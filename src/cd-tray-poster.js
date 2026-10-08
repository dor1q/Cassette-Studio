import {albumArtLayer} from './album-art.js';
import {normalizeEditorMode} from './media-formats.js';

const PIXEL=25.4/600;
const limits={opacity:[0,100],blur:[0,200],scale:[.5,3]};
const round=value=>Math.round(value*1e6)/1e6;
function poster(project,surface,requested){
 if(normalizeEditorMode(project?.editorMode??project?.mode)!=='cd-tray'||!['cdTray','cdTrayInside'].includes(surface))return null;
 const layer=requested||albumArtLayer(project,surface);
 if(!project.surfaces?.[surface]?.includes(layer)||layer?.type!=='image'||!(['albumCover','art'].includes(layer.category)||['Обложка альбома','Обложка'].includes(layer.name)))return null;
 return layer;
}
const zoomBase=layer=>Number.isFinite(Number(layer.cdTrayPosterZoomBase))&&Number(layer.cdTrayPosterZoomBase)>0?Number(layer.cdTrayPosterZoomBase):1;
export function cdTrayPosterState(project,surface,{layer:requested}={}){
 const layer=poster(project,surface,requested);if(!layer)return null;
 return {layerId:layer.id,locked:!!layer.locked,opacity:round((Number(layer.opacity)||0)*100),blur:round((Number(layer.blur)||0)/PIXEL),scale:round((Number(layer.cropZoom)||1)/zoomBase(layer))};
}
export function setCDTrayPoster(project,surface,key,value,{layer:requested}={}){
 const layer=poster(project,surface,requested),range=Object.hasOwn(limits,key)?limits[key]:null;
 if(!layer||layer.locked||!range||value===null||String(value).trim()===''||!Number.isFinite(Number(value)))return false;
 const amount=Math.max(range[0],Math.min(range[1],Number(value))),property={opacity:'opacity',blur:'blur',scale:'cropZoom'}[key],next=key==='opacity'?amount/100:key==='blur'?amount*PIXEL:amount*zoomBase(layer);
 if(Math.abs(Number(layer[property]??(key==='scale'?1:0))-next)<1e-10)return false;
 layer[property]=next;return true;
}
export function applyOriginalCDTrayPoster(project,surface,{layer}={}){
 const target=poster(project,surface,layer);if(!target||target.locked)return false;
 const opacity=setCDTrayPoster(project,surface,'opacity',20,{layer:target}),blur=setCDTrayPoster(project,surface,'blur',60,{layer:target}),scale=setCDTrayPoster(project,surface,'scale',1.1,{layer:target});
 return opacity||blur||scale;
}
