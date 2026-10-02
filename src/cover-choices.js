import {referenceImageSource} from './reference-image-source.js';

const sourceOf=value=>referenceImageSource(typeof value==='string'?value:value?.file_path||value?.src||value?.url||'');
const dimension=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):undefined;
const mainSource=album=>[album?.cover,album?.artworkUrl1200,album?.artworkUrl600,album?.artworkUrl100].map(sourceOf).find(Boolean)||null;
const indexOfBundle=value=>value==='_'?-1:/^\d+(?:\.|$)/.test(String(value||''))&&Number.isSafeInteger(Number(String(value).split('.')[0]))?Number(String(value).split('.')[0]):null;

// Different resolutions of the main cover are not extra posters and never receive mp indices.
export function coverChoices(album,{cp='',savedCover=''}={}){
 const posters=Array.isArray(album?.customPosters)?album.customPosters.map(poster=>({
  file_path:sourceOf(poster),type:String(poster?.type||'custom'),label:String(poster?.label||poster?.name||''),
  width:dimension(poster?.width),height:dimension(poster?.height)
 })):[];
 const prefix=[];
 for(const [source,type,label] of [[cp,'custom-upload','Custom Upload'],[savedCover,'custom-upload','Saved Design Poster']]){
  const file_path=sourceOf(source);
  if(file_path&&!prefix.some(p=>p.file_path===file_path))prefix.push({file_path,type,label});
 }
 // Retain invalid slots: dropping one would silently make subsequent URL indices select another picture.
 return [{file_path:mainSource(album),type:'original',label:'Основная обложка'},...prefix,...posters].map((choice,index)=>({...choice,index}));
}

export function referenceCoverIndex(params){
 const mp=indexOfBundle(params?.get('mp')),cp=params?.get('cp')||'',fallback=indexOfBundle(cp);
 let index=mp??fallback??0;
 // On normal original-project restore, a cp upload selects the first custom poster unless mp explicitly hides it.
 if(index!==-1&&sourceOf(cp)&&index<1)index=1;
 return index;
}

export function selectCoverChoice(album,indexOrParams=0,options={}){
 const params=indexOrParams&&typeof indexOrParams.get==='function'?indexOrParams:null;
 const requestedIndex=params?referenceCoverIndex(params):Number.isSafeInteger(indexOrParams)&&indexOrParams>=-1?indexOrParams:0;
 const choices=coverChoices(album,{...options,cp:options.cp??params?.get('cp')??''});
 if(requestedIndex===-1)return {choices,requestedIndex,index:-1,file_path:null,hidden:true,fallback:false};
 const requested=choices[requestedIndex],choice=requested?.file_path?requested:choices[0];
 return {...choice,choices,requestedIndex,hidden:false,fallback:requestedIndex!==choice.index};
}

export function buildTrackCoverPosters(tracks,{exclude=[],type='track-cover',limit=12}={}){
 const seen=new Set(exclude.map(sourceOf).filter(Boolean)),posters=[],maximum=Math.min(12,Math.max(0,Math.trunc(Number(limit)||0)));
 if(!maximum)return posters;
 for(const track of Array.isArray(tracks)?tracks:[]){
  const file_path=sourceOf(track?.thumbnail||track?.cover);
  if(!file_path||seen.has(file_path))continue;
  seen.add(file_path);posters.push({file_path,type,label:String(track.title||track.trackName||track.name||''),
   width:dimension(track.thumbnailWidth),height:dimension(track.thumbnailHeight)});
  if(posters.length===maximum)break;
 }
 return posters;
}

// The provider-background list is independent from mp: all track thumbnails participate after custom posters.
export function audioBackgroundChoices(album,options={}){
 const seen=new Set(),choices=[];
 const candidates=[...coverChoices(album,options),...(Array.isArray(album?.tracks)?album.tracks:[]).map(track=>({
  file_path:sourceOf(track.thumbnail),type:'track-cover',label:String(track.title||track.trackName||track.name||''),
  width:dimension(track.thumbnailWidth),height:dimension(track.thumbnailHeight)
 }))];
 for(const candidate of candidates){if(!candidate.file_path||seen.has(candidate.file_path))continue;seen.add(candidate.file_path);choices.push({...candidate,index:choices.length})}
 return choices;
}
