import {uid,resetSurfaces,balance,clone} from './model.js';
import {extractAlbumColors} from './album-colors.js';
import {recordLabelMetadata} from '../music-labels.mjs';
import {albumArtLayer} from './album-art.js';
import {groupFor} from './flow-editing.js';
import {findReferenceFlowCopySource} from './reference-flow.js';

function preservedImportLayers(project,surfaces){
 const keep=new Set();
 for(const surface of surfaces)for(const layer of project.surfaces[surface])if(layer.locked){
  keep.add(layer);
  // Joined columns have one editable frame. A lock on a member protects that
  // complete frame, including the other column's flow and physical position.
  for(const peer of groupFor(project,layer,surface)?.layers||[])keep.add(peer);
 }
 if(project.layout.sync&&['labelA','labelB'].some(surface=>albumArtLayer(project,surface)?.locked)){
  for(const surface of surfaces.filter(surface=>surface.startsWith('label'))){
   const cover=albumArtLayer(project,surface);if(cover)keep.add(cover);
  }
 }
 const dependencies=new Map();
 if([...keep].some(layer=>(layer.referenceFlowCopySource||layer.referenceFlowCopyIndex!==undefined)&&findReferenceFlowCopySource(project,layer))){
  // A saved flow copy resolves its text through the original chain. Keep the
  // unlocked originals as hidden dependencies so the copy stays editable and
  // bound to the new music, without displaying the discarded old layout.
  for(const surface of surfaces)for(const layer of project.surfaces[surface])if(layer.referenceFlow&&!keep.has(layer))dependencies.set(layer,{...clone(layer),visible:false});
 }
 return Object.fromEntries(surfaces.map(surface=>[surface,project.surfaces[surface].flatMap((layer,index)=>{
  if(!keep.has(layer)&&!dependencies.has(layer))return [];
  return [{layer:dependencies.get(layer)||layer,index,dependency:dependencies.has(layer)}];
 })]));
}

function equivalentDefault(layer,preserved,surface){
 if(layer.type!==preserved.type||layer.type!=='text')return false;
 if(preserved.referenceFlow){
  const panel=preserved.referencePanelIndex;
  return surface==='inner'&&layer.source==='lyrics'&&layer.flowIndex===panel-2||surface==='outer'&&panel===3&&layer.source==='production';
 }
 if(!preserved.source)return false;
 if(layer.source===preserved.source)return layer.source!=='lyrics'||preserved.flowIndex===undefined||layer.flowIndex===preserved.flowIndex;
 const sources={referenceHeading:['artist','album'],flapTracks:['A','B'],flapProduction:['production']};
 return sources[preserved.source]?.includes(layer.source)||false;
}

function restoreImportLayers(project,preserved){
 for(const [surface,entries]of Object.entries(preserved)){
  const fresh=project.surfaces[surface].filter(layer=>!entries.some(({layer:old,dependency})=>!dependency&&equivalentDefault(layer,old,surface)));
  for(const {layer,index}of entries)fresh.splice(Math.min(index,fresh.length),0,layer);
  project.surfaces[surface]=fresh;
 }
}

export function importMusicData(project,album,target='both',{tracksOnly=false}={}){
 if(!['A','B','both'].includes(target)||tracksOnly&&target==='both')throw Error('Выберите сторону A или B');
 validateMusicData(album);
 const tracks=album.tracks.map(t=>({...t,id:uid(),title:String(t.title),artist:String(t.artist||''),seconds:Math.max(0,Math.round(Number(t.seconds)||0))}));
 if(target==='both'){
  Object.assign(project.data,{artist:album.artist||'',album:album.album||'',url:album.url||'',note:album.note||project.data.note,...recordLabelMetadata(album.recordLabels,album.recordLabelSource)});
  [project.data.A,project.data.B]=balance(tracks);
 }else project.data[target]=tracks;
 if(!tracksOnly&&!project.settings.lockDesign){
  const surfaces=target==='both'?Object.keys(project.surfaces):['label'+target],preserved=preservedImportLayers(project,surfaces);
  if(target==='both'){resetSurfaces(project);delete project.referenceFreePlace}
  else{const previous={...project.surfaces};resetSurfaces(project);const replacement=project.surfaces['label'+target];project.surfaces=previous;project.surfaces['label'+target]=replacement}
  restoreImportLayers(project,preserved);
 }
 return tracks.length;
}

export function validateMusicData(album){
 if(!Array.isArray(album?.tracks)||!album.tracks.length)throw Error('В альбоме или плейлисте нет доступных треков');
 if(album.tracks.some(t=>!t||typeof t.title!=='string'||!t.title.trim()))throw Error('Сервис вернул треки без названий. Повторите импорт.');
}

export async function prepareAlbumImport(album,loadImage,{colors=false,extractColors=extractAlbumColors}={}){
 validateMusicData(album);
 const warnings=[...(album.warnings||[])];
 const covers=[...new Set([album.cover,...(album.coverAlternatives||[])].filter(Boolean))].slice(0,3);
 for(const cover of covers){
  try{const result=await loadImage(cover);if(!/^data:image\/(png|jpeg|webp);base64,/.test(result.src||''))throw Error('Некорректное изображение');let palette=null;if(colors)try{palette=await extractColors(result.src)}catch{warnings.push('Обложка загружена, но подобрать цвет не удалось. Цвета макета сохранены.')}return {artwork:result.src,warnings,palette}}
  catch{}
 }
 if(covers.length)warnings.push('Треки загружены, но обложка пока недоступна. Загрузите изображение файлом или повторите импорт позже.');
 return {artwork:null,warnings,palette:null};
}
