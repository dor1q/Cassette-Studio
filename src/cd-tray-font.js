import {REFERENCE_UNIT,referenceFont} from './reference-format.js';
import {cdReferenceTrayTrackFrame} from './cd-layout.js';

const BASE_PIXELS=72,DEFAULT_SCALE=75;
const frameKeys=['x','y','w','h','rotation'];
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.0001;
const matchesFrame=layer=>layer.referenceCDTrayTrackFrame&&frameKeys.every(key=>near(layer[key]||0,layer.referenceCDTrayTrackFrame[key]||0));
const targets=project=>(project.surfaces?.cdTray||[]).filter(layer=>layer.type==='text'&&layer.source==='cdTracks'&&layer.referenceCDTrayTrack&&!layer.referenceBlockCopy);
const validScale=value=>Number.isFinite(value)&&value>=6&&value<=1000;

export function referenceCDTrayTrackDuration(track){
 const seconds=Math.max(0,Math.round(Number(track?.seconds)||0));
 if(typeof track?.referenceDuration==='string'&&/^\d{1,6}:\d{2}(?::\d{2})?$/.test(track.referenceDuration)&&near(seconds,track.referenceDurationSeconds))return track.referenceDuration;
 if(track?.seconds===undefined&&typeof track?.duration==='string')return track.duration;
 if(!seconds)return '';
 if(seconds>=6000)return Math.floor(seconds/3600)+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

function trackMetric(tracks){
 return (Array.isArray(tracks)?tracks:[]).map(track=>String(track?.title??track?.name??track?.trackName??'')+String(track?.artist||'')+referenceCDTrayTrackDuration(track)).join('\n');
}

export function referenceCDTrayFontScale(data,requested=DEFAULT_SCALE){
 const scale=validScale(requested)?requested:DEFAULT_SCALE;
 if(scale!==DEFAULT_SCALE)return scale;
 const a=trackMetric(data?.A),b=trackMetric(data?.B);if(!a&&!b)return scale;
 // The original uses UTF-16 string length and adds no newline between sides.
 const length=(a+b).length;
 if(length<=200)return 100;
 if(length>=1200)return 50;
 return length<=500?Math.round(100-(length-200)*25/300):Math.round(75-(length-500)*25/700);
}

export function referenceCDTrayFontStyle(params,data){
 const value=params.get('fb'),token=String(value||'').split('.')[1],requested=/^[0-9a-z]+$/i.test(token||'')?Math.max(6,Math.min(1000,parseInt(token,36))):DEFAULT_SCALE;
 const scale=referenceCDTrayFontScale(data,requested),size=Math.round(BASE_PIXELS*scale/100)*REFERENCE_UNIT;
 return {...referenceFont(value,BASE_PIXELS*REFERENCE_UNIT,REFERENCE_UNIT,{font:'Nunito Sans',weight:400}),size,
  referenceCDTrayRequestedFontScale:requested,referenceCDTrayFontScale:scale,referenceCDTrayFontSize:size};
}

export function syncReferenceCDTrayFonts(project){
 const result={updated:0,preserved:0};if(project.editorMode!=='cd-tray')return result;
 for(const layer of targets(project)){
  // Existing projects without the requested-size snapshot remain unchanged.
  // A manually edited size and a lock protect the stored typography and frame.
  if(layer.locked||!validScale(layer.referenceCDTrayRequestedFontScale)||!near(layer.size,layer.referenceCDTrayFontSize)){result.preserved++;continue}
  const scale=referenceCDTrayFontScale(project.data,layer.referenceCDTrayRequestedFontScale),size=Math.round(BASE_PIXELS*scale/100)*REFERENCE_UNIT,automaticFrame=matchesFrame(layer);
  let changed=layer.size!==size||layer.referenceCDTrayFontScale!==scale;
  Object.assign(layer,{size,referenceCDTrayFontScale:scale,referenceCDTrayFontSize:size});
  if(automaticFrame){
   const frame=cdReferenceTrayTrackFrame(project,'cdTray',layer);
   changed||=frameKeys.some(key=>!near(layer[key]||0,frame[key]||0));
   Object.assign(layer,frame);layer.referenceCDTrayTrackFrame=Object.fromEntries(frameKeys.map(key=>[key,layer[key]||0]));
  }
  if(changed)result.updated++;
 }
 return result;
}

export function enableReferenceCDTrayAutoFont(project,layer){
 const layers=targets(project);
 if(project.editorMode!=='cd-tray'||!layers.includes(layer))return {applied:false,reason:'unsupported'};
 if(layers.some(peer=>peer.locked))return {applied:false,reason:'locked'};
 for(const peer of layers)Object.assign(peer,{referenceCDTrayRequestedFontScale:DEFAULT_SCALE,referenceCDTrayFontSize:peer.size});
 return {applied:true,...syncReferenceCDTrayFonts(project)};
}
