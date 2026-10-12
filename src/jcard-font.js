import {REFERENCE_UNIT,referenceFont} from './reference-format.js';
import {time} from './model.js';
import {referenceJCardSpineMetric} from './jcard-spine.js';

const DEFAULT_SCALE=100,NORMAL_SPINE=300*REFERENCE_UNIT;
const validScale=value=>Number.isFinite(value)&&value>=6&&value<=1000;
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.0001;
const layerKind=layer=>layer?.source==='spine'&&layer.referenceSpine?'spine':layer?.source==='flapTracks'?'flap':null;
const requestedScale=value=>{
 const token=String(value||'').split('.')[1];
 return /^[0-9a-z]+$/i.test(token||'')?Math.max(6,Math.min(1000,parseInt(token,36))):DEFAULT_SCALE;
};

// The public editor measures the complete source strings, before visibility
// options and wrapping. Its length metric counts JavaScript UTF-16 code units.
export function jcardSpineFontScale(text,requested=DEFAULT_SCALE){
 if(validScale(requested)&&requested!==DEFAULT_SCALE)return requested;
 const length=String(text||'').length;
 if(length<=6)return 150;if(length>=50)return 70;
 if(length<=20)return Math.round(150-(length-6)*35/14);
 if(length<=35)return Math.round(115-(length-20)*30/15);
 return Math.round(85-(length-35));
}

export function jcardTrackMetric(tracks){
 return (Array.isArray(tracks)?tracks:[]).map(track=>{
  const title=String(track?.title??track?.name??track?.trackName??''),artist=String(track?.artist||'');
  const seconds=Number(track?.seconds),duration=Number.isFinite(seconds)&&seconds>0?time(seconds):'';
  return title+(artist?' - '+artist:'')+(duration?' ('+duration+')':'');
 }).filter(Boolean).join('\n');
}

export function jcardFlapFontScale(data,requested=DEFAULT_SCALE){
 if(validScale(requested)&&requested!==DEFAULT_SCALE)return requested;
 const length=(jcardTrackMetric(data?.A)+jcardTrackMetric(data?.B)).length;
 if(length<=122)return 100;if(length>=593)return 61;
 return length<=264?Math.round(100-(length-122)*20/142):Math.round(80-(length-264)*19/329);
}

function computedFont(project,kind,requested){
 const scale=kind==='spine'?jcardSpineFontScale(referenceJCardSpineMetric(project),requested):jcardFlapFontScale(project.data,requested);
 const ratio=kind==='spine'&&Number.isFinite(project.layout?.spine)?project.layout.spine/NORMAL_SPINE:1;
 const pixels=Math.round((kind==='spine'?94:44)*scale/100*ratio);
 return {scale,size:Math.max(.1,Math.min(100,pixels*REFERENCE_UNIT))};
}

const fontKeys=album=>album?
 {requested:'referenceJCardAlbumRequestedFontScale',scale:'referenceJCardAlbumFontScale',size:'referenceJCardAlbumFontSize'}:
 {requested:'referenceJCardRequestedFontScale',scale:'referenceJCardFontScale',size:'referenceJCardFontSize'};

export function referenceJCardFontPreset(project,params,kind,{album=false}={}){
 const value=params.get(album?'f3':kind==='spine'?'f2':'fb')||(album?params.get('f2'):null),requested=requestedScale(value);
 const result=computedFont(project,kind,requested),keys=fontKeys(album);
 return {style:{...referenceFont(value,(kind==='spine'?94:44)*REFERENCE_UNIT),size:result.size},
  state:{[keys.requested]:requested,[keys.scale]:result.scale,[keys.size]:result.size,...(!album?{referenceJCardFontKind:kind}:{})}};
}

export function jcardFontLayerSupported(project,layer){
 return !!(project.layout?.referenceTemplate&&layer?.type==='text'&&!layer.referenceBlock&&!layer.referenceBlockCopy&&!layer.standardBlockCopy&&
  layerKind(layer));
}

export function syncReferenceJCardFonts(project){
 const result={updated:0,preserved:0};if(!project.layout?.referenceTemplate)return result;
 const layers=(project.surfaces?.outer||[]).filter(layer=>jcardFontLayerSupported(project,layer));
 for(const layer of layers){
  if(layer.locked){result.preserved++;continue}
  const kind=layerKind(layer);
  let changed=false;
  for(const album of [false,true]){
   if(album&&(kind!=='spine'||!layer.albumStyle))continue;
   const keys=fontKeys(album),face=album?layer.albumStyle:layer;
   if(!validScale(layer[keys.requested])||!near(face.size,layer[keys.size])){result.preserved++;continue}
   const next=computedFont(project,kind,layer[keys.requested]);
   changed||=!near(face.size,next.size)||layer[keys.scale]!==next.scale;
   face.size=next.size;layer[keys.size]=next.size;layer[keys.scale]=next.scale;
  }
  if(changed)result.updated++;
 }
 const flap=layers.find(layer=>layerKind(layer)==='flap');
 if(flap)for(const production of project.surfaces.outer){
  if(production.source!=='flapProduction'||!production.referenceFlapProduction||production.referenceBlock||production.referenceBlockCopy||production.standardBlockCopy)continue;
  if(production.locked||!near(production.size,production.referenceJCardFlapProductionSize)){result.preserved++;continue}
  const size=flap.size*.85;if(!near(production.size,size)){production.size=size;production.referenceJCardFlapProductionSize=size;result.updated++}
 }
 return result;
}

export function referenceJCardFontState(project,layer,{album=false}={}){
 if(!jcardFontLayerSupported(project,layer)||album&&!layer.albumStyle)return null;
 const keys=fontKeys(album),face=album?layer.albumStyle:layer,following=validScale(layer[keys.requested])&&near(face.size,layer[keys.size]);
 return {automatic:following&&layer[keys.requested]===DEFAULT_SCALE,preset:following&&layer[keys.requested]!==DEFAULT_SCALE,
  locked:!!layer.locked,size:face.size,kind:layerKind(layer),album};
}

export function enableReferenceJCardAutoFont(project,layer,{album=false}={}){
 if(!jcardFontLayerSupported(project,layer)||album&&!layer.albumStyle)return {applied:false,reason:'unsupported'};
 if(layer.locked)return {applied:false,reason:'locked'};
 const keys=fontKeys(album),face=album?layer.albumStyle:layer;
 layer.referenceJCardFontKind=layerKind(layer);
 layer[keys.requested]=DEFAULT_SCALE;layer[keys.size]=face.size;
 return {applied:true,...syncReferenceJCardFonts(project)};
}
