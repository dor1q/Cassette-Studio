import {makeLayer,dimensions,panelRects} from './model.js';
import {referenceCoverIndex} from './cover-choices.js';
import {isCDMode,modeSurfaces} from './media-formats.js';

export function referenceArtworkKey(url){
 const u=url instanceof URL?url:new URL(url),params=u.searchParams;
 const parts=['id','playlistUrl','source','country','cp','sai','sbi'].map(name=>params.get(name)||'');
 return parts.some(Boolean)?JSON.stringify([...parts,referenceCoverIndex(params)]):'';
}
export function cachedReferenceArtwork(project,url){
 const key=referenceArtworkKey(url);
 return key&&project.referenceArtworkSource===key?project.uploads.find(u=>u.category==='albumCover')?.src||'':'';
}

export function albumArtLayer(project,surface){
 return project.surfaces[surface]?.find(l=>l.type==='image'&&(['albumCover','art'].includes(l.category)||['Обложка альбома','Обложка'].includes(l.name)));
}

export function albumCoverFrame(project,surface){
 const size=dimensions(project,surface);
 if(surface.startsWith('label')||surface==='cdLabel')return {x:0,y:0,w:size.w,h:size.h};
 const front=panelRects(project,surface).find(panel=>panel.index===2);
 return {x:front?.x||0,y:0,w:front?.w||size.w,h:size.h};
}

export function canReplaceAlbumArt(project,surface){
 if(albumArtLayer(project,surface)?.locked)return false;
 if(project.layout.sync&&surface.startsWith('label')){
  const other=surface==='labelA'?'labelB':'labelA';
  if(albumArtLayer(project,other)?.locked)return false;
 }
 return true;
}

export function fitCoverImage(layer){
 delete layer.cdTrayPosterZoomBase;
 return Object.assign(layer,{fit:'meet',cropZoom:1,cropX:0,cropY:0,cropRotation:0});
}

export function albumCoverAppearance(surface){
 if(['cdTray','cdTrayInside'].includes(surface))return {opacity:.2,blur:60*25.4/600};
 return {opacity:String(surface||'').startsWith('label')?.5:1};
}

export function parseReferenceArtwork(value){
 const m=String(value||'').match(/^(\d+)\.(\d+\.\d{1,2})\.(-?\d+)\.(-?\d+)(?:\.(-?\d+))?$/);
 if(!m)return null;
 const [index,zoom,x,y,rotation]=m.slice(1).map(v=>Number(v||0));
 if(index>100||zoom<.3||zoom>6||Math.abs(x)>20000||Math.abs(y)>20000||Math.abs(rotation)>360)return null;
 return {index,zoom,x:x*25.4/600,y:y*25.4/600,rotation};
}

function legacyReferenceArtwork(params,label){
 const read=(key,fallback,min,max)=>{const raw=params.get(key),n=raw?.trim()?Number(raw):NaN;return Number.isFinite(n)&&n>=min&&n<=max?n:fallback};
 return {zoom:read('cassetteScale',label?2:1,.3,6),x:read('cassetteOffsetX',0,-20000,20000)*25.4/600,y:read('cassetteOffsetY',0,-20000,20000)*25.4/600,rotation:read('cassetteRotation',0,-360,360)};
}

export function applyReferenceArtwork(project,params,naturalWidth,naturalHeight,mode='jcard'){
 const label=mode==='label',cdLabel=mode==='cd-label',cdTray=mode==='cd-tray',parsedPosition=parseReferenceArtwork(params.get('mp'))||parseReferenceArtwork(params.get('cp')),position=parsedPosition||legacyReferenceArtwork(params,label),surfaces=isCDMode(mode)?modeSurfaces(project,mode,'front'):label?['labelA','labelB']:['outer'];
 for(const surface of surfaces)for(const layer of project.surfaces[surface].filter(l=>l.category==='albumCover')){
  if(!canReplaceAlbumArt(project,surface))continue;
  if(params.get('mp')==='_'){layer.visible=false;continue}const fit=params.get('pf')==='f';layer.fit=params.get('pf')==='s'?'stretch':fit||params.get('pFM')==='1'?'meet':'slice';
  if(position){
   const factor=naturalWidth>0&&naturalHeight>0?Math.max(layer.w/naturalWidth,layer.h/naturalHeight)/Math.min(layer.w/naturalWidth,layer.h/naturalHeight):1;
   const zoom=cdTray?(Number(project.layout.cdTrayPosterScale)||1.1):mode==='cd-insert'&&!parsedPosition&&layer.fit==='slice'?1.59:position.zoom;
   if(cdTray)layer.cdTrayPosterZoomBase=1/(layer.fit!=='slice'?1:factor);
   layer.cropZoom=zoom*(label?1.06:1)/(layer.fit!=='slice'?1:factor);layer.cropX=position.x*(label||cdLabel?600/72:1);layer.cropY=position.y*(label||cdLabel?600/72:1);layer.cropRotation=position.rotation;
  }
  const opacity=Number(params.get('opacity'));
  layer.opacity=cdTray?Math.max(0,Math.min(1,(project.layout.cdTrayPosterOpacity??20)/100)):params.has('opacity')&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1?opacity:label?.3:cdLabel?.8:1;
  if(cdTray)layer.blur=Math.max(0,Math.min(20,(project.layout.cdTrayPosterBlur??60)*25.4/600));
 }
}

export function applyAlbumArt(project,src,target='both',options={}){
 if(target&&typeof target==='object'){options=target;target=options.target||'both'}
 const mode=options.mode||project.editorMode,surfaces=options.surfaces||(isCDMode(mode)?modeSurfaces(project,mode,'front'):target==='both'?['outer','labelA','labelB']:['label'+target]);
 const result={applied:[],locked:[]};
 for(const surface of surfaces){
  if(!canReplaceAlbumArt(project,surface)){result.locked.push(surface);continue}
  const layers=project.surfaces[surface];
  const existing=albumArtLayer(project,surface);
  result.applied.push(surface);
  if(existing){existing.src=src;existing.category='albumCover';delete existing.referenceAssetKey;delete existing.referenceCoverIndex;fitCoverImage(existing);continue}
  const firstForeground=layers.findIndex(l=>l.category!=='background'&&l.referenceDecalLayer!=='background');
  layers.splice(firstForeground<0?layers.length:firstForeground,0,fitCoverImage(makeLayer('image',{name:'Обложка альбома',category:'albumCover',src,...albumCoverFrame(project,surface),...albumCoverAppearance(surface)})));
 }
 const upload=project.uploads.find(u=>u.category==='albumCover');
 if(upload){upload.src=src;delete upload.referenceAssetKey}else project.uploads.push({name:'Обложка альбома',category:'albumCover',src});
 return result;
}
