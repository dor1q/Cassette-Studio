import {parseMusicLink} from '../music-links.mjs';
import {applyAlbumArt,applyReferenceArtwork,cachedReferenceArtwork,referenceArtworkKey} from './album-art.js';
import {referenceImageDimensions} from './reference-image-source.js';
import {selectCoverChoice,referenceCoverIndex,audioBackgroundChoices,coverChoices} from './cover-choices.js';
import {loadReferenceImage} from './reference-image-source.js';
import {recordLabelMetadata} from '../music-labels.mjs';
import {musicGalleryScope} from './music-gallery-scope.js';
import {referenceMusicSource,mergeReferenceSidePosters,referenceSidePosters} from './reference-side-music.js';

export function referenceMusicUrl(params){
 const supplied=params.get('playlistUrl');
 if(supplied){try{return parseMusicLink(supplied).url}catch{}}
 const options={country:params.get('country')||'us',source:params.get('source')||'',allowNumeric:false,allowLegacyApplePlaylist:true};
 return referenceMusicSource(params.get('id'),options)||referenceMusicSource(params.get('musicId'),{...options,allowNumeric:true});
}

export function referenceMusicGalleryScope(params){
 const base=musicGalleryScope({url:referenceMusicUrl(params),id:params.get('id'),artist:params.get('musicArtist'),album:params.get('musicAlbum'),cover:params.get('cp')});
 const sides=['sai','sbi'].map(key=>referenceMusicSource(params.get(key),{country:params.get('country')||'us'}));
 return sides.some(Boolean)?JSON.stringify(['side-imports',base,...sides]):base;
}

export async function restoreReferenceMusicMetadata(project,url,request,previous=project){
 const musicUrl=referenceMusicUrl(url.searchParams);
 const hasSides=referenceSidePosters(project).length>0;
 if(!musicUrl&&!hasSides)return {album:null,musicUrl,choices:[],backgroundChoices:[],cached:false};
 const reusable=musicUrl?[project,previous].find(candidate=>candidate.referenceMusicMetadataSource===musicUrl&&candidate.referenceMusicMetadata):null;
 const imported=musicUrl?(reusable?.referenceMusicMetadata||await request('/api/import?url='+encodeURIComponent(musicUrl))):{cover:'',url:'',customPosters:[],tracks:[]};
 // Keep only artwork metadata needed to restore galleries, never session or service-connection data.
 const normalized=coverChoices(imported);
 const album=mergeReferenceSidePosters(project,{cover:normalized[0].file_path||'',coverAlternatives:[...(imported.coverAlternatives||[])],url:imported.url||musicUrl,
  customPosters:normalized.slice(1).map(({index,...poster})=>poster),
  ...recordLabelMetadata(imported.recordLabels,imported.recordLabelSource),
  tracks:Array.isArray(imported.tracks)?imported.tracks.map(track=>({title:track.title||track.trackName||'',thumbnail:track.thumbnail||'',thumbnailWidth:track.thumbnailWidth,thumbnailHeight:track.thumbnailHeight})):[]});
 const options={cp:url.searchParams.get('cp')||''},selection=selectCoverChoice(album,url.searchParams,options),backgroundChoices=audioBackgroundChoices(album,options);
 project.referenceMusicMetadataSource=musicUrl;project.referenceMusicMetadata=album;
 if(musicUrl)Object.assign(project.data,recordLabelMetadata(album.recordLabels,album.recordLabelSource));
 project.referenceCoverChoices=selection.choices;project.referenceBackgroundChoices=backgroundChoices;
 project.referenceBackgroundChoicesScope=referenceMusicGalleryScope(url.searchParams);
 return {album,musicUrl,choices:selection.choices,backgroundChoices,cached:!!reusable};
}

export async function restoreReferenceMusicArtwork(project,url,request,mode='jcard',previous=project,getDimensions=referenceImageDimensions){
 const params=url.searchParams;
 if(referenceCoverIndex(params)===-1)return {artwork:'',restored:0};
 const cached=cachedReferenceArtwork(previous,url),musicUrl=referenceMusicUrl(params);
 if(!cached&&!musicUrl&&!referenceSidePosters(project).length)return {artwork:'',restored:0};
 let artwork=cached,cover='',selection=null,warnings=[];
 const fallbackWarning='Выбранная картинка недоступна. Загружена основная обложка.';
 if(!artwork){
  const {album}=await restoreReferenceMusicMetadata(project,url,request,previous);selection=selectCoverChoice(album,params);cover=selection.file_path||'';
  if(!cover)throw Error(musicUrl?'Музыкальный сервис не вернул обложку':'В ссылке нет основной обложки. Выберите картинку источника стороны.');
  if(selection.fallback)warnings.push(fallbackWarning);
  const imageDimensions=async src=>{const size=await getDimensions(src);return Array.isArray(size)?size:[size.w,size.h]};
  let loaded;
  try{loaded=await loadReferenceImage(cover,request,imageDimensions,previous.uploads||[])}catch(error){
   const main=selection.choices[0];if(selection.index===0||!main.file_path)throw error;
   loaded=await loadReferenceImage(main.file_path,request,imageDimensions,previous.uploads||[]);
   selection={...main,choices:selection.choices,requestedIndex:selection.requestedIndex,hidden:false,fallback:true};cover=main.file_path;
   warnings.push(fallbackWarning);
  }
  artwork=loaded.src;
  project.referenceCoverChoices=selection.choices;project.referenceCoverIndex=selection.index;
  project.referenceRequestedCoverIndex=selection.requestedIndex;
  project.data.url||=album.url||musicUrl;project.lastCover=cover;
 }else{
  if(previous.referenceMusicMetadataSource===musicUrl&&previous.referenceMusicMetadata){
   await restoreReferenceMusicMetadata(project,url,request,previous);
  }
  if(musicUrl)project.data.url||=musicUrl;
  project.referenceCoverChoices||=previous.referenceCoverChoices||[];
  project.referenceBackgroundChoices||=previous.referenceBackgroundChoices||[];
  project.referenceCoverIndex=previous.referenceCoverIndex??referenceCoverIndex(params);
  project.referenceRequestedCoverIndex=referenceCoverIndex(params);
  project.lastCover=previous.lastCover||'';cover=project.lastCover;
  selection={fallback:project.referenceRequestedCoverIndex!==project.referenceCoverIndex};
  if(selection.fallback)warnings.push(fallbackWarning);
 }
 if(!artwork)throw Error('Не удалось загрузить обложку');
 const size=await getDimensions(artwork),[w,h]=Array.isArray(size)?size:[size.w,size.h];
 applyAlbumArt(project,artwork,mode==='label'?'A':'both');
 if(mode==='label')applyAlbumArt(project,artwork,'B');
 const upload=project.uploads.find(item=>item.category==='albumCover');
 if(cover&&upload)upload.referenceAssetKey=cover;
 applyReferenceArtwork(project,params,w,h,mode);
 project.referenceArtworkSource=referenceArtworkKey(url);
 return {artwork,restored:1,musicUrl,choices:project.referenceCoverChoices,index:project.referenceCoverIndex,fallback:selection?.fallback||false,warnings};
}
