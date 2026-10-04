import {uid,resetSurfaces,balance} from './model.js';
import {extractAlbumColors} from './album-colors.js';
import {recordLabelMetadata} from '../music-labels.mjs';

export function importMusicData(project,album,target='both',{tracksOnly=false}={}){
 if(!['A','B','both'].includes(target)||tracksOnly&&target==='both')throw Error('Выберите сторону A или B');
 validateMusicData(album);
 const tracks=album.tracks.map(t=>({...t,id:uid(),title:String(t.title),artist:String(t.artist||''),seconds:Math.max(0,Math.round(Number(t.seconds)||0))}));
 if(target==='both'){
  Object.assign(project.data,{artist:album.artist||'',album:album.album||'',url:album.url||'',note:album.note||project.data.note,...recordLabelMetadata(album.recordLabels,album.recordLabelSource)});
  [project.data.A,project.data.B]=balance(tracks);
 }else project.data[target]=tracks;
 if(!tracksOnly&&!project.settings.lockDesign){
  if(target==='both'){resetSurfaces(project);delete project.referenceFreePlace}
  else{const previous={...project.surfaces};resetSurfaces(project);const replacement=project.surfaces['label'+target];project.surfaces=previous;project.surfaces['label'+target]=replacement}
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
