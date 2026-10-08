import {normalizePaint} from './color-paint.js';
import {recordLabelMetadata} from '../music-labels.mjs';
import {makeLayer,resetSurfaces,dimensions,panelRects,parseTracks,clone,uid,clamp} from './model.js';
import {CASSETTE_TEMPLATE} from './cassette-template.js';
import {rebuildReferenceFlow,updateReferenceFlapProduction} from './reference-flow.js';
import {applyReferenceBlocks} from './reference-freeplace.js';
import {REFERENCE_UNIT,referenceFont,referenceLayout,referenceCenterX,referenceFlags,splitReferenceCaptions,referenceSectionColors,referenceSynced,referenceSurface,referencePlacement,decodedText,referencePixelUnit,referenceCodeUnit} from './reference-format.js';
import {importReferenceCD} from './reference-cd.js';
import {isCDMode,modeDefaultSurface} from './media-formats.js';

export function referenceMode(url){const u=new URL(url);if(u.hostname!=='vhs.texs.org')throw Error('Нужна ссылка vhs.texs.org');const route=/\/([^/]+)\/?$/.exec(u.pathname)?.[1],mode={cassette:'label',jcard:'jcard',cd:'cd-label','cd-insert':'cd-insert','cd-tray':'cd-tray'}[route];if(mode)return mode;throw Error('Поддерживаются ссылки J-card, Cassette Label и CD')}
export function referencePosition(p,xPercent,yPercent,w,h,rotation=0,surface='outer',canonical=true,anchored=false){
 const {w:W,h:H}=dimensions(p,surface),cd=surface.startsWith('cd'),insert=['cdFront','cdInside'].includes(surface),canonicalWidth=8476*REFERENCE_UNIT,rawX=(canonical&&insert?canonicalWidth:W)*xPercent/100-(canonical&&insert&&anchored&&surface==='cdFront'?canonicalWidth-W:0),cx=cd?(canonical&&insert?clamp(rawX,W*.02,W*.98):rawX):surface.startsWith('label')?W*xPercent/100:referenceCenterX(p,xPercent,canonical),cy=H*yPercent/100,a=rotation*Math.PI/180;
 return {x:cx-(w*Math.cos(a)-h*Math.sin(a))/2,y:cy-(w*Math.sin(a)+h*Math.cos(a))/2};
}
export function importReference(p,url){
 const u=new URL(url),q=u.searchParams,mode=referenceMode(url),label=mode==='label',cd=isCDMode(mode);for(const key of ['referenceCoverChoices','referenceBackgroundChoices','referenceBackgroundChoicesScope','referenceCoverIndex','referenceCoverIndices','referenceRequestedCoverIndex','referenceMusicMetadata','referenceSideMusic','referenceMusicMetadataSource','referenceArtworkSource','referenceFlowArchive','referenceFlowTemplate','referenceCDContentTemplate'])delete p[key];
 p.editorMode=mode;
 Object.assign(p.data,{artist:q.get('musicArtist')||'',album:q.get('musicAlbum')||'',note:'',stereo:q.get('musicDS')??'STEREO SURROUND',url:q.get('playlistUrl')||'',lyrics:q.get('musicLyrics')||'',production:label?(q.get('musicPL')??q.get('musicProd')??''):(q.get('musicProd')??q.get('musicPL')??''),...recordLabelMetadata([])});
 for(const side of ['A','B'])p.data[side]=q.has('music'+side)?parseTracks(q.get('music'+side).replace(/\|/g,'\n'),true):[];
 delete p.layout.panelWidths;delete p.layout.referenceTemplate;
 if(label)Object.assign(p.layout,CASSETTE_TEMPLATE,{sync:referenceSynced(q)});else if(!cd)Object.assign(p.layout,referenceLayout(q));
 const bg=q.get('bg')?.split('.')[0];p.settings.bg=label||mode==='cd-label'?'#ffffff':'#f9f3ea';
 if(/^[0-9a-f]{6}$/i.test(bg||''))p.settings.bg='#'+bg;else if(/^[0-9a-f]{3}$/i.test(bg||''))p.settings.bg='#'+bg.split('').map(c=>c+c).join('');
 const fg=q.get('color');p.settings.fg=normalizePaint(fg||(mode==='cd-label'?'#000000':'rainbow'),'rainbow');
 p.settings.bgB=p.settings.bg;p.settings.bgInside=p.settings.bg;
 p.settings.referenceTransparentBackground=['clear','transparent'].includes(bg);p.settings.referenceTransparentText=fg==='clear';p.settings.referenceLogoHidden=q.get('cl')==='hidden';
 Object.assign(p.settings,{sideText:q.get('sll')??(label?'SIDE':'Side'),sideA:q.get('sla')??'A',sideB:q.get('slb')??'B'});
 const flags=referenceFlags(q.get('ts'));Object.assign(p.settings,{artists:!(flags&1),numbers:!(flags&2),durations:!(flags&4),bullets:!(flags&8)});
 p.settings.referenceSeparator=['-','|',' ','•','·'][Number(q.get('sep'))]||'-';p.settings.referenceSectionColors=referenceSectionColors(q.get('fc'));p.settings.referenceTrackAlign={l:'left',r:'right'}[q.get('ta')]||'center';
 if(cd)importReferenceCD(p,q,mode);else{resetSurfaces(p);if(label)importLabel(p,q);else importJCard(p,q)}
 importCaptions(p,q.get('cxt'),mode);importCodes(p,q,u,mode);if(!label&&!cd)updateReferenceFlapProduction(p);applyReferenceBlocks(p,q,mode);
 p.referenceView={mode,surface:cd?modeDefaultSurface(mode):label?(q.get('sd')==='B'?'labelB':'labelA'):'outer',both:label&&q.get('sd')==='AB'};
 if(p.settings.referenceTransparentText)for(const list of Object.values(p.surfaces))for(const l of list)if(l.type==='text'&&!l.referenceOwnColor&&!l.referenceAlbumOwnColor){l.referenceHiddenByTextColor=l.visible;l.visible=false;}
 return p;
}
function importCaptions(p,encoded,mode){
 if(!encoded)return;
 for(const chunk of splitReferenceCaptions(encoded).slice(0,60)){
  const f=chunk.split('|');if(f.length<5)continue;const text=decodedText(f[0]).slice(0,10000),[x,y,rotation]=f.slice(1,4).map(Number);
  if(!text||![x,y,rotation].every(Number.isFinite)||Math.abs(x)>125||y < -100||y>200||Math.abs(rotation)>360)continue;
  const side=f.slice(9).includes('b')?'back':'front',surface=referenceSurface(p,mode,side),label=mode==='label',W=dimensions(p,surface).w,style=referenceFont(f[5],label?1.25356:mode==='cd-label'?12*25.4/72:3.048,referencePixelUnit(mode)),w=clamp(W*(Number(f[4])||50)/100,1,W*3),lineHeight=clamp(Number(f[6])/100||1.4,.5,4),lines=text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length*style.size*.48*style.fontStretch/100/w)),0),h=Math.max(style.size*lineHeight,lines*style.size*lineHeight),ownColor=/^#?[a-f0-9]{6}$/i.test(f[7]||''),color=ownColor?'#'+f[7].replace(/^#/,''):p.settings.fg;
  const layer=makeLayer('text',{category:'referenceText',name:'Надпись из ссылки',text,...referencePosition(p,x,y,w,h,rotation,surface,f.slice(9).includes('c'),true),w,h,...style,color,referenceOwnColor:ownColor,rotation,align:{l:'left',c:'center',r:'right'}[f[8]]||'center',lineHeight,autoFit:false});
  p.surfaces[surface].push(layer);if(label&&p.layout.sync)p.surfaces[surface==='labelA'?'labelB':'labelA'].push({...clone(layer),id:uid()});
 }
}
function importJCard(p,q){
 const hidden=referenceFlags(q.get('jh')),style=referenceFont(q.get('fi'),48*REFERENCE_UNIT),fg=p.settings.fg,l=p.layout,colors=p.settings.referenceSectionColors;
 p.surfaces.outer=p.surfaces.outer.filter(t=>!['A','B','artist','album','production','note'].includes(t.source));
 const flapFlags=referenceFlags(q.get('tf')),extended=l.flapShape==='extended',flapOptions={artists:!(flapFlags&1),numbers:!(flapFlags&2),durations:!(flapFlags&4),bullets:!(flapFlags&8),inlineTracks:!extended,hideTracks:!!(hidden&16),showProduction:!!(hidden&32),showSide:q.get('hsif')!=='1'};
 const flapFrame=extended?{x:36*REFERENCE_UNIT,y:40*REFERENCE_UNIT,w:l.flap-72*REFERENCE_UNIT,h:l.height-80*REFERENCE_UNIT,rotation:0}:{x:l.flap-1,y:4,w:l.height-8,h:l.flap-2,rotation:90};
 p.surfaces.outer.push(makeLayer('text',{source:'flapTracks',name:'Треки A/B на клапане',...flapFrame,align:extended?'left':'center',lineHeight:extended?1.35:1.5,color:colors.back||fg,referenceOwnColor:!!colors.back,flapTapered:l.flapShape==='tapered',trackOptions:flapOptions,...referenceFont(q.get('fb'),44*REFERENCE_UNIT)}));
 const spine=p.surfaces.outer.find(t=>t.source==='spine');Object.assign(spine,{x:l.flap+l.spine-2,y:4,w:l.height-8,h:l.spine-4,rotation:90,align:'center',lineHeight:clamp(Number(q.get('slh'))||1.4,.5,4),referenceSpine:true,hideArtist:!!(hidden&2),hideAlbum:!!(hidden&1),spineTwoLines:l.spineTwoLines,visible:!(hidden&1&&hidden&2),color:colors.spine||fg,referenceOwnColor:!!colors.spine,...referenceFont(q.get('f2'),94*REFERENCE_UNIT)});
 if(q.has('f3')||colors.album)spine.albumStyle={...referenceFont(q.get('f3')||q.get('f2'),94*REFERENCE_UNIT),color:colors.album||colors.spine||fg};spine.referenceAlbumOwnColor=!!colors.album||!!colors.spine;
 p.surfaces.inner=[];
 rebuildReferenceFlow(p,makeLayer('text',{source:'referenceContents',color:colors.inside||fg,referenceOwnColor:!!colors.inside,...style,autoFit:false,lineHeight:1.4,align:'left',hideArtist:!!(hidden&2),hideAlbum:!!(hidden&1),hideA:!!(hidden&64),hideB:!!(hidden&128),trackOptions:{inlineTracks:false,showSide:q.get('hsib')!=='1'}}));
 if(q.has('musicDS')||q.has('musicDSh'))p.surfaces.outer.push(makeLayer('text',{category:'referenceStereo',source:'stereo',name:'Надпись Stereo из ссылки',visible:q.get('musicDSh')!=='1',x:l.flap-3,y:74,w:24,h:3,rotation:90,size:2,color:fg}));
}
function importLabel(p,q){
 const sx=p.layout.labelW/251.16,sy=p.layout.labelH/118.43,hidden=referenceFlags(q.get('ch')),colors=p.settings.referenceSectionColors;
 const text=(source,name,x,y,w,h,size,more={})=>makeLayer('text',{source,name,x:x*sx,y:y*sy,w:w*sx,h:h*sy,size,color:p.settings.fg,align:'center',...more});
 const artist=referenceFont(q.get('fb'),10*sy,sy,{font:'Arial',weight:700}),album=referenceFont(q.get('fi'),7*sy,sy,{font:'Arial',weight:600,italic:true}),tracks=referenceFont(q.get('f2'),5.2*sy,sy,{font:'Arial',weight:500});
 const baseline=(source,name,y,style,visible)=>text(source,name,6,y-style.size/sy*.9,239.16,style.size/sy*1.4,style.size,{...style,visible,color:colors[source==='artist'?'back':'inside']||p.settings.fg,referenceOwnColor:!!colors[source==='artist'?'back':'inside']});
 for(const side of ['A','B'])p.surfaces['label'+side]=[baseline('artist','Исполнитель',19,artist,!(hidden&1)),text('tracks','Треки',6,24,239.16,20,tracks.size,{...tracks,lineHeight:1.3,align:p.settings.referenceTrackAlign,color:colors.spine||p.settings.fg,referenceOwnColor:!!colors.spine,visible:!(hidden&(side==='A'?4:8))}),baseline('album','Альбом',102.43,album,!(hidden&2)),text('sideText','Префикс стороны',218.16,55.5,22,6,5*sy,{spacing:.6*sx,uppercase:true,visible:q.get('hsi')!=='1'}),text('side','Сторона',218.16,60.3,22,16,13*sy,{bold:true,visible:q.get('hsi')!=='1'}),text('production','Выходные данные',6,105.1,239.16,7,3.7*sy,{opacity:.9,visible:!(hidden&16)})];
}
function importCodes(p,q,u,mode){
 const hidden=referenceFlags(q.get(mode==='label'?'ch':mode==='cd-label'||mode==='cd-tray'?'cdh':'jh')),color=(key,explicit)=>q.get(key)==='1'?( /^#?[a-f0-9]{6}$/i.test(q.get(explicit)||'')?'#'+q.get(explicit).replace(/^#/,''):p.settings.fg):'#000000';
 const add=(layer,side)=>{const s=referenceSurface(p,mode,side);p.surfaces[s].push(layer);if(mode==='label'&&p.layout.sync)p.surfaces[s==='labelA'?'labelB':'labelA'].push({...clone(layer),id:uid()})};
 const barcodeDefaults={'cd-label':{x:76.73,y:41.24,scale:124,rotation:90},'cd-insert':{x:28.8,y:92.03,scale:173,rotation:0},'cd-tray':{x:76.23,y:91.76,scale:148,rotation:0},label:{x:89.34,y:87.67,scale:89,rotation:0},jcard:{x:4.25,y:84.35,scale:196,rotation:90}};
 const raw=q.get('bp'),placement=raw?referencePlacement(raw):{...barcodeDefaults[mode],side:'front'},custom=q.get('bcm')==='c',cid=q.get('cid'),text=custom?decodedText(q.get('bcv')):/^\d{1,13}$/.test(cid||'')?(cid.length<=12?cid.padStart(12,'0'):cid):'';
 if(text&&placement){const s=referenceSurface(p,mode,placement.side),unit=referenceCodeUnit(p,mode),w=352*unit*placement.scale/100,h=176*unit*placement.scale/100,type=custom?({'128':'code128','39':'code39','93':'code93',itf:'itf14',msi:'msi',cdb:'rationalizedCodabar'}[q.get('bcf')||'128']||'code128'):'ean13';
  add(makeLayer('barcode',{category:'referenceCode',name:'Штрихкод из ссылки',text,barcodeType:type,visible:q.get('bv')==='1'||(q.get('bv')!=='0'&&(mode==='cd-tray'||mode==='jcard'&&!(hidden&4))),color:color('bcz','bcc'),referenceColorInherited:q.get('bcz')==='1'&&!/^#?[a-f0-9]{6}$/i.test(q.get('bcc')||''),referenceOwnColor:q.get('bcz')==='1'&&/^#?[a-f0-9]{6}$/i.test(q.get('bcc')||''),transparentCode:q.get('bcz')==='1',...referencePosition(p,placement.x,placement.y,w,h,placement.rotation,s),w,h,rotation:placement.rotation}),placement.side);
 }
 for(const [index,part]of String(q.get('qr')||'').split('|').entries()){
  const t=referencePlacement(part);if(!t)continue;let target=t.url||(index===0?q.get('qrU'):'')||q.get('playlistUrl')||u.href;
  if(!/^https?:\/\//i.test(target)&&! /^[a-z][a-z0-9+.-]*:/i.test(target))target='https://'+target;
  const s=referenceSurface(p,mode,t.side),unit=referenceCodeUnit(p,mode),w=350*unit*t.scale/100;
  add(makeLayer('qr',{category:'referenceCode',name:'QR из ссылки',text:target,color:color('qcz','qcc'),referenceColorInherited:q.get('qcz')==='1'&&!/^#?[a-f0-9]{6}$/i.test(q.get('qcc')||''),referenceOwnColor:q.get('qcz')==='1'&&/^#?[a-f0-9]{6}$/i.test(q.get('qcc')||''),transparentCode:q.get('qcz')==='1',visible:mode!=='jcard'||!(hidden&8),...referencePosition(p,t.x,t.y,w,w,t.rotation,s),w,h:w,rotation:t.rotation}),t.side);
 }
}
