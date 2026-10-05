import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,clone,dimensions,panelRects,makeLayer,validateProject,boundText,importReference} from '../src/model.js';
import {EDITOR_SURFACES,modeSurfaces,modeDefaultSurface,normalizeEditorMode,isCDMode} from '../src/media-formats.js';
import {CD_DEFAULTS,cdLabelGeometry,resetCDSurfaces,updateCDLayout,updateCDTrackLayout} from '../src/cd-layout.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';
import {albumCoverFrame,applyAlbumArt,applyReferenceArtwork,albumArtLayer} from '../src/album-art.js';
import {importMusicData} from '../src/music-import.js';
import {applyAlbumColors} from '../src/album-colors.js';
import {setProjectTextColor,surfaceBackground} from '../src/text-color.js';
import {applyGalleryCover} from '../src/cover-gallery.js';
import {renderSvg,flowText} from '../src/render.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const artwork='data:image/png;base64,'+new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#345678"/></svg>').render().asPng().toString('base64');
const album={artist:'New artist',album:'New album',url:'https://example.com/album',tracks:Array.from({length:7},(_,index)=>({title:'Track '+(index+1),artist:'New artist',seconds:121+index}))};

test('format registry selects every independent CD face and preserves legacy cassette modes',()=>{
 const p=createProject();assert.equal(EDITOR_SURFACES.length,9);assert.deepEqual(Object.keys(p.surfaces),EDITOR_SURFACES);
 for(const [mode,front,back]of [['cd-label','cdLabel'],['cd-insert','cdFront','cdInside'],['cd-tray','cdTray','cdTrayInside']]){
  assert.equal(isCDMode(mode),true);assert.equal(modeDefaultSurface(mode),front);assert.deepEqual(modeSurfaces(p,mode),[front,...(back?[back]:[])]);assert.deepEqual(modeSurfaces(p,mode,'front'),[front]);
 }
 assert.equal(normalizeEditorMode('cassette-label'),'label');assert.equal(normalizeEditorMode('bad'),'jcard');
});

test('CD dimensions match the original physical panels and mirror logical front identities',()=>{
 const p=createProject(),cassette=clone(p.surfaces.outer);
 for(const [count,width]of [[1,2850],[2,5700],[3,8476]]){
  p.layout.cdInsertPanels=count;near(dimensions(p,'cdFront').w,width*25.4/600);near(dimensions(p,'cdFront').h,120.65);
  const front=panelRects(p,'cdFront').find(panel=>panel.index===2),inside=panelRects(p,'cdInside').find(panel=>panel.index===2);
  near(front.x,dimensions(p,'cdFront').w-front.w);near(inside.x,0);near(albumCoverFrame(p,'cdFront').x,front.x);near(front.w,120.65);
 }
 near(dimensions(p,'cdTray').w,150.876);near(dimensions(p,'cdTray').h,117.983);near(albumCoverFrame(p,'cdTray').w,3244*25.4/600);
 p.layout.cdTrayLeftSpine=false;near(albumCoverFrame(p,'cdTray').x,0);near(dimensions(p,'cdTray').w,150.876-CD_DEFAULTS.cdSpine);
 assert.deepEqual(p.surfaces.outer,cassette);
});

test('old projects gain editable CD layouts during migration without changing cassette artwork',()=>{
 const old=validateProject(createProject());delete old.editorMode;old.mode='cassette-label';old.layout.cdLabelHub='0';
 const original=clone(old.surfaces.outer).map(({id,...layer})=>layer);
 for(const key of EDITOR_SURFACES.filter(key=>key.startsWith('cd')))delete old.surfaces[key];
 const p=validateProject(old);assert.equal(p.editorMode,'label');assert.equal(p.layout.cdLabelHub,false);assert.equal(p.surfaces.cdLabel.length,4);assert.equal(p.settings.cdCapacity,80);
 assert.deepEqual(p.surfaces.outer.map(({id,...layer})=>layer),original);
});

test('CD album import uses a complete ordered list and resets only its current format while retaining locks',()=>{
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const p=createProject();p.editorMode=mode;p.settings.lockDesign=false;const target=modeDefaultSurface(mode),cassette=clone(p.surfaces.outer),other=clone(p.surfaces[mode==='cd-label'?'cdTray':'cdLabel']);
  applyAlbumArt(p,artwork);const cover=albumArtLayer(p,target);cover.locked=true;cover.x+=2;cover.fit='slice';cover.cropZoom=2;
  const locked=p.surfaces[target].find(layer=>layer.type==='text');locked.locked=true;locked.color='#ff00ff';const snapshot=clone(cover);
  importMusicData(p,album);const result=applyAlbumArt(p,'replacement');assert.deepEqual(p.surfaces.outer,cassette);assert.deepEqual(p.surfaces[mode==='cd-label'?'cdTray':'cdLabel'],other);applyAlbumColors(p,{bg:'#abcdef',fg:'#000000'});
  assert.equal(p.data.A.length,7);assert.equal(p.data.B.length,0);assert.deepEqual(p.data.A.map(track=>track.title),album.tracks.map(track=>track.title));assert.equal(p.surfaces[target].filter(layer=>layer.id===locked.id).length,1);assert.equal(locked.color,'#ff00ff');assert.deepEqual(cover,snapshot);assert.deepEqual(result.locked,[target]);
  assert.deepEqual(p.surfaces.outer,cassette.map(layer=>({...layer,color:layer.source?'#000000':layer.color})));assert.deepEqual(p.surfaces[mode==='cd-label'?'cdTray':'cdLabel'],other.map(layer=>({...layer,color:layer.source?'#000000':layer.color})));
 }
});

test('a locked CD spine preserves its own panel while fresh defaults retain the other spine',()=>{
 const p=createProject();p.editorMode='cd-tray';p.settings.lockDesign=false;
 const left=p.surfaces.cdTray.find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===0);left.locked=true;left.x+=1;left.albumStyle={font:'Georgia',color:'#ff00ff'};const before=clone(left);
 importMusicData(p,album);assert.deepEqual(p.surfaces.cdTray.find(layer=>layer.id===left.id),before);assert.equal(p.surfaces.cdTray.filter(layer=>layer.source==='cdSpine').length,2);
 assert.ok(p.surfaces.cdTray.some(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===1));
});

test('a locked reference CD contents block suppresses only its panel equivalents on import',()=>{
 const p=createProject();p.editorMode='cd-insert';p.settings.lockDesign=false;
 const frame=panelRects(p,'cdInside').find(panel=>panel.index===2),block=makeLayer('text',{source:'cdContents',referenceCDContent:true,cdContentIndex:0,cdPanelIndex:2,locked:true,x:frame.x+4,y:4,w:frame.w-8,h:110});
 p.surfaces.cdInside=[block];importMusicData(p,album);assert.equal(p.surfaces.cdInside.filter(layer=>layer.cdPanelIndex===2).length,1);assert.equal(p.surfaces.cdInside[0],block);assert.ok(p.surfaces.cdInside.some(layer=>layer.cdPanelIndex===3));
});

test('changing CD panels reflows untouched templates and covers, preserving style, manual frames and locks',()=>{
 const p=createProject();p.editorMode='cd-insert';applyAlbumArt(p,artwork);const cover=albumArtLayer(p,'cdFront'),title=p.surfaces.cdFront.find(layer=>layer.source==='artist');title.font='Georgia';title.color='#123456';title.visible=true;const id=title.id;
 const manual=p.surfaces.cdFront.find(layer=>layer.source==='album');manual.x+=3;const manualBefore=clone(manual),cassette=clone(p.surfaces.outer),previous=clone(p.layout);p.layout.cdInsertPanels=3;updateCDLayout(p,'cd-insert',previous);
 assert.deepEqual({x:cover.x,y:cover.y,w:cover.w,h:cover.h},albumCoverFrame(p,'cdFront'));assert.equal(title.id,id);assert.equal(title.font,'Georgia');assert.equal(title.color,'#123456');assert.equal(title.visible,true);near(title.x,albumCoverFrame(p,'cdFront').x+7);assert.deepEqual(manual,manualBefore);assert.ok(p.surfaces.cdInside.some(layer=>layer.source==='cdContents'&&layer.cdPanelIndex===4));assert.deepEqual(p.surfaces.outer,cassette);
 cover.locked=true;const coverBefore=clone(cover),old=clone(p.layout);p.layout.cdInsertPanels=1;updateCDLayout(p,'cd-insert',old);assert.deepEqual(cover,coverBefore);
});

test('CD spine toggles remove untouched blocks but retain locked or manually placed frames',()=>{
 const p=createProject(),left=p.surfaces.cdTray.find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===0),right=p.surfaces.cdTray.find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===1);left.locked=true;const saved=clone(left),old=clone(p.layout);
 p.layout.cdTrayLeftSpine=false;p.layout.cdTrayRightSpine=false;updateCDLayout(p,'cd-tray',old);assert.deepEqual(p.surfaces.cdTray.find(layer=>layer.id===left.id),saved);assert.equal(p.surfaces.cdTray.some(layer=>layer.id===right.id),false);
 const before=clone(p.layout);p.layout.cdTrayRightSpine=true;updateCDLayout(p,'cd-tray',before);assert.equal(p.surfaces.cdTray.filter(layer=>layer.source==='cdSpine').length,2);
});

test('gallery covers use the logical CD front panel, full fit and active-face lock protection',()=>{
 const p=createProject();p.layout.cdInsertPanels=3;const layer=applyGalleryCover(p,'cdInside',{index:1,label:'Back'},{src:artwork,key:'key'});
 assert.deepEqual({x:layer.x,y:layer.y,w:layer.w,h:layer.h},albumCoverFrame(p,'cdInside'));assert.equal(layer.fit,'meet');assert.equal(layer.cropZoom,1);layer.locked=true;const saved=clone(layer);assert.throws(()=>applyGalleryCover(p,'cdInside',{index:2},{src:'new',key:'new'}),/закреплена/);assert.deepEqual(layer,saved);
});

test('CD reference cover settings use label point offsets, insert fit and blurred tray poster controls',()=>{
 const p=createProject();for(const mode of ['cd-label','cd-insert','cd-tray']){p.editorMode=mode;applyAlbumArt(p,artwork)}
 applyReferenceArtwork(p,new URLSearchParams('mp=0.1.00.72.-72.0'),400,400,'cd-label');const label=albumArtLayer(p,'cdLabel');near(label.cropX,25.4);near(label.cropY,-25.4);near(label.opacity,.8);
 applyReferenceArtwork(p,new URLSearchParams('pf=f'),400,400,'cd-insert');assert.equal(albumArtLayer(p,'cdFront').fit,'meet');near(albumArtLayer(p,'cdFront').cropZoom,1);
 Object.assign(p.layout,{cdTrayPosterOpacity:30,cdTrayPosterBlur:50,cdTrayPosterScale:1.2});applyReferenceArtwork(p,new URLSearchParams('mp=0.5.00.100.0.0&opacity=1'),400,400,'cd-tray');const tray=albumArtLayer(p,'cdTray');near(tray.opacity,.3);near(tray.blur,50*25.4/600);assert.ok(tray.cropZoom<1.2);tray.locked=true;const saved=clone(tray);applyReferenceArtwork(p,new URLSearchParams('mp=_'),400,400,'cd-tray');assert.deepEqual(tray,saved);
});

test('CD contents flow continues across its own format without repeating production or losing ordered tracks',()=>{
 const p=createProject();p.data.artist='';p.data.album='';p.data.production='Final production';p.data.lyrics='';p.data.A=album.tracks;p.data.B=[];
 const block=(index)=>makeLayer('text',{source:'cdContents',referenceCDContent:true,cdContentIndex:index,x:0,y:0,w:110,h:30,size:3,autoFit:false,lineHeight:1.3,trackOptions:{showProduction:true}}),a=block(0),b=block(1);p.surfaces.cdFront=[a];p.surfaces.cdInside=[b];p.surfaces.cdTray=[block(0)];
 const source=boundText(p,a,'cdFront');assert.equal(source.split('Final production').length-1,1);
 const first=flowText(p,a,'cdFront'),second=flowText(p,b,'cdInside');assert.ok(first.text.includes('Track 1'));assert.ok(second.text.includes('Final production'));assert.equal(second.text.includes('Track 1 ('),false);assert.equal(second.overflow,false);
 assert.equal(flowText(p,p.surfaces.cdTray[0],'cdTray').text,first.text);
});

test('CD text color updates preserve locked spine styles and resolve reverse-face contrast from its own background',()=>{
 const p=createProject(),locked=p.surfaces.cdTray.find(layer=>layer.source==='cdSpine');locked.locked=true;locked.color='rainbow';locked.albumStyle={color:'#ff00ff'};const saved=clone(locked);
 assert.equal(p.surfaces.cdInside[0].color,'#000000');assert.equal(p.surfaces.cdTrayInside[0].color,'#000000');
 setProjectTextColor(p,'#aabbcc',{all:true});assert.deepEqual(locked,saved);assert.equal(p.surfaces.cdLabel[0].color,'#aabbcc');p.settings.bgInside='#ffffff';assert.equal(surfaceBackground(p,'cdTrayInside'),'#ffffff');assert.equal(surfaceBackground(p,'cdInside'),'#ffffff');
});

test('CD circle text renders as curved native SVG and clean clipping removes center and rectangular corners',()=>{
 const p=createProject();p.settings.bg='#000000';p.settings.fg='#ffffff';p.settings.guides=false;p.layout.cdTrackLayout='circular';resetCDSurfaces(p,'cd-label');p.surfaces.cdLabel=p.surfaces.cdLabel.filter(layer=>layer.source==='cdTracks');p.surfaces.cdLabel[0].color='#ffffff';
 const {svg,warnings}=renderSvg(p,'cdLabel',{guides:false});assert.match(svg,/<textPath href="#/);assert.equal(warnings.length,0);assert.doesNotMatch(svg,/<circle|stroke-dasharray/);
 const native=new Resvg(svg,{fitTo:{mode:'width',value:700}}).render(),pixels=native.pixels;const alpha=(x,y)=>pixels[(Math.floor(y)*native.width+Math.floor(x))*4+3];assert.equal(alpha(0,0),0);assert.equal(alpha(native.width/2,native.height/2),0);let white=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+3]>200)white++;assert.ok(white>500,`Expected visible curved text, got ${white} white pixels`);
 const old=clone(p.layout);p.layout.cdLabelHub=true;updateCDLayout(p,'cd-label',old);near(cdLabelGeometry(p).holeDiameter,14.957778);assert.match(renderSvg(p,'cdLabel',{guides:true}).svg,/<circle/);
});

test('mirrored CD insert fold guides stay at internal boundaries, with no cassette slit paths',()=>{
 const p=createProject();p.layout.cdInsertPanels=3;p.layout.backSlits=true;const {svg}=renderSvg(p,'cdInside',{blank:true});const folds=[...svg.matchAll(/d="M([0-9.]+) 0V/g)].map(match=>Number(match[1]));
 assert.equal(folds.length,2);assert.ok(folds.every(x=>x>0&&x<dimensions(p,'cdInside').w));assert.doesNotMatch(svg,/data-jcard-slit/);near(folds[0],120.65);near(folds[1],241.3);
});

test('generic single-sided CD Insert places the full album on its non-cover front panel',()=>{
 const p=createProject();p.editorMode='cd-insert';p.data.production='Unique production';p.settings.lockDesign=false;importMusicData(p,album);
 const body=p.surfaces.cdFront.find(layer=>layer.cdContentFlow);assert.ok(body);assert.equal(body.referenceCDContent,undefined);assert.equal(body.cdPanelIndex,3);assert.equal(p.layout.cdInsertDouble,false);
 const result=renderSvg(p,'cdFront',{guides:false});for(const title of album.tracks.map(track=>track.title))assert.ok(result.svg.includes(title));assert.ok(result.svg.includes('Unique production'));assert.ok(result.svg.includes('New artist'));assert.ok(result.svg.includes('New album'));assert.equal(result.warnings.length,0);
 p.layout.cdInsertPanels=1;resetCDSurfaces(p,'cd-insert');assert.equal(p.surfaces.cdFront.some(layer=>layer.cdContentFlow),false);assert.equal(p.surfaces.cdFront.some(layer=>layer.visible),false);
});

test('generic CD Insert columns distribute complete contents across printed faces once',()=>{
 const p=createProject();p.layout.cdInsertPanels=3;p.layout.cdInsertDouble=true;p.layout.columns=2;p.layout.columnHeight=30;p.data.artist='Artist';p.data.album='Album';p.data.production='End of production';p.data.A=Array.from({length:20},(_,i)=>({title:'TrackToken'+String(i+1).padStart(2,'0'),seconds:120}));p.data.B=[];p.data.lyrics=Array.from({length:30},(_,i)=>'LyricToken'+String(i+1).padStart(2,'0')).join('\n');resetCDSurfaces(p,'cd-insert');
 const frames=['cdFront','cdInside'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.cdContentFlow).map(layer=>({surface,layer}))).sort((a,b)=>a.layer.cdContentIndex-b.layer.cdContentIndex);assert.equal(frames.length,10);assert.equal(new Set(frames.map(({layer})=>layer.cdContentIndex)).size,10);assert.ok(frames.every(({layer})=>layer.cdColumnIndex===0||layer.cdColumnIndex===1));
 const chunks=frames.map(({surface,layer})=>flowText(p,layer,surface));assert.equal(chunks.at(-1).overflow,false);const text=chunks.map(chunk=>chunk.text).join('\n');for(const item of [...p.data.A.map(track=>track.title),...p.data.lyrics.split('\n'),'End of production'])assert.equal(text.split(item).length-1,1,item);
});

test('generic CD Insert reflow adds columns without resetting manual or locked content styles',()=>{
 const p=createProject(),body=p.surfaces.cdFront.find(layer=>layer.cdContentFlow);body.color='#aabbcc';body.font='Georgia';const id=body.id,previous=clone(p.layout);p.layout.columns=2;p.layout.columnHeight=70;updateCDLayout(p,'cd-insert',previous);
 const frames=p.surfaces.cdFront.filter(layer=>layer.cdContentFlow);assert.equal(frames.length,2);assert.equal(body.id,id);assert.equal(body.color,'#aabbcc');assert.equal(body.font,'Georgia');near(body.h,(120.65-14)*.7);assert.ok(frames[1].x>body.x+body.w);
 body.locked=true;const before=clone(body);p.settings.lockDesign=false;p.editorMode='cd-insert';p.referenceCDContentTemplate={source:'cdContents',type:'text'};importMusicData(p,album);assert.deepEqual(p.surfaces.cdFront.find(layer=>layer.id===id),before);assert.equal(p.surfaces.cdFront.filter(layer=>layer.cdPanelIndex===3&&layer.cdColumnIndex===0).length,1);assert.equal(p.referenceCDContentTemplate,undefined);
});

test('resetting an original CD Insert clears its template before generic column changes and leaves other formats intact',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cd-insert?mode=d2&musicA=One+%281%3A00%29');
 const template=clone(p.referenceCDContentTemplate);p.referenceFreePlace={mode:'cd-insert',raw:'~bdefault-backText_25_50_100_0_5_0_1',token:'original'};
 const archive=clone(p.referenceFreePlace),old=clone(p.layout);p.layout.columns=2;updateCDLayout(p,'cd-insert',old);assert.deepEqual(p.referenceCDContentTemplate,template);assert.deepEqual(p.referenceFreePlace,archive);
 resetCDSurfaces(p,'cd-insert');assert.equal(p.referenceCDContentTemplate,undefined);assert.equal(p.referenceFreePlace,undefined);
 const previous=clone(p.layout);p.layout.columns=1;updateCDLayout(p,'cd-insert',previous);assert.equal(rebuildReferenceCDContents(p).created,0);assert.equal(p.surfaces.cdFront.filter(layer=>layer.cdContentFlow).length,1);assert.equal(p.surfaces.cdFront.some(layer=>layer.referenceCDContent),false);
 p.referenceFreePlace={mode:'label',raw:'other'};p.referenceCDContentTemplate=template;resetCDSurfaces(p,'cd-tray');assert.equal(p.referenceFreePlace.mode,'label');assert.deepEqual(p.referenceCDContentTemplate,template);
});

test('switching an original right CD track list to circular and bottom restores every track and keeps locked lists intact',()=>{
 const p=createProject(),tracks=Array.from({length:22},(_,index)=>'TrackToken'+String(index+1).padStart(2,'0')+' (1:00)').join('|');importReference(p,'https://vhs.texs.org/en/cd?tl=1&musicA='+encodeURIComponent(tracks));
 const layer=p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');assert.equal(layer.maxTracks,18);assert.equal(boundText(p,layer,'cdLabel').includes('TrackToken22'),false);
 for(const kind of ['circular','bottom']){p.layout.cdTrackLayout=kind;updateCDTrackLayout(p);assert.equal(layer.maxTracks,undefined);assert.equal(layer.trackOptions.inlineTracks,true);assert.ok(boundText(p,layer,'cdLabel').includes('TrackToken22'));assert.ok(renderSvg(p,'cdLabel',{guides:false}).svg.includes('TrackToken22'))}
 p.layout.cdTrackLayout='right';updateCDTrackLayout(p);assert.equal(layer.maxTracks,18);assert.equal(layer.trackOptions.inlineTracks,false);layer.locked=true;const before=clone(layer);p.layout.cdTrackLayout='circular';updateCDTrackLayout(p);assert.deepEqual(layer,before);
});

test('a cassette music import preserves a cover-only CD Insert template for its later panel expansion',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cd-insert?mode=s1&musicA=Original+%281%3A00%29');const template=clone(p.referenceCDContentTemplate),faces=clone({cdFront:p.surfaces.cdFront,cdInside:p.surfaces.cdInside});
 p.editorMode='jcard';p.settings.lockDesign=false;importMusicData(p,album);assert.deepEqual(p.referenceCDContentTemplate,template);assert.deepEqual({cdFront:p.surfaces.cdFront,cdInside:p.surfaces.cdInside},faces);
 p.editorMode='cd-insert';const old=clone(p.layout);p.layout.cdInsertPanels=2;updateCDLayout(p,'cd-insert',old);assert.equal(rebuildReferenceCDContents(p).created,1);assert.equal(p.surfaces.cdFront.filter(layer=>layer.referenceCDContent).length,1);assert.equal(p.surfaces.cdFront.some(layer=>layer.cdContentFlow),false);
});
