import {parseMusicLink} from '../music-links.mjs';
import {applyAlbumArt,applyReferenceArtwork,cachedReferenceArtwork,referenceArtworkKey} from './album-art.js';
import {referenceImageDimensions} from './reference-image-source.js';
import {syncReferenceCDTrayFonts} from './cd-tray-font.js';
import {selectCoverChoice,referenceCoverIndex,audioBackgroundChoices,coverChoices} from './cover-choices.js';
import {loadReferenceImage} from './reference-image-source.js';
import {recordLabelMetadata} from '../music-labels.mjs';
import {musicGalleryScope} from './music-gallery-scope.js';
import {referenceMusicSource,mergeReferenceSidePosters,referenceSidePosters} from './reference-side-music.js';
import {referenceCoverSurfaces} from './reference-format.js';
import {isCDMode} from './media-formats.js';
import {uid} from './model.js';

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
 const params=url.searchParams,musicUrl=referenceMusicUrl(params),cd=isCDMode(project.editorMode);
 const hasSides=referenceSidePosters(project).length>0;
 if(!musicUrl&&!hasSides)return {album:null,musicUrl,choices:[],backgroundChoices:[],cached:false};
 const reusable=musicUrl?[project,previous].find(candidate=>candidate.referenceMusicMetadataSource===musicUrl&&candidate.referenceMusicMetadata&&(!cd||candidate.referenceMusicMetadata.referenceFullTracks)):null;
 const imported=musicUrl?(reusable?.referenceMusicMetadata||await request('/api/import?url='+encodeURIComponent(musicUrl))):{cover:'',url:'',customPosters:[],tracks:[]};
 // Keep only artwork metadata needed to restore galleries, never session or service-connection data.
 const normalized=coverChoices(imported);
 const album=mergeReferenceSidePosters(project,{cover:normalized[0].file_path||'',coverAlternatives:[...(imported.coverAlternatives||[])],url:imported.url||musicUrl,
  customPosters:normalized.slice(1).map(({index,...poster})=>poster),
  ...recordLabelMetadata(imported.recordLabels,imported.recordLabelSource),
  ...(cd&&musicUrl?{referenceFullTracks:true,artist:String(imported.artist||imported.artistName||'').slice(0,500),album:String(imported.album||imported.collectionName||'').slice(0,1000),production:String(imported.production||imported.note||'').slice(0,100000)}:{}),
  tracks:Array.isArray(imported.tracks)?imported.tracks.slice(0,2000).map(track=>({title:String(track.title||track.trackName||'').slice(0,1000),thumbnail:track.thumbnail||'',thumbnailWidth:track.thumbnailWidth,thumbnailHeight:track.thumbnailHeight,...(cd?{artist:String(track.artist||'').slice(0,500),seconds:Math.max(0,Math.min(86400,Math.round(Number(track.seconds)||0)))}:{})})):[]});
 const options={cp:url.searchParams.get('cp')||''},selection=selectCoverChoice(album,url.searchParams,options),backgroundChoices=audioBackgroundChoices(album,options);
 project.referenceMusicMetadataSource=musicUrl;project.referenceMusicMetadata=album;
 if(musicUrl)Object.assign(project.data,recordLabelMetadata(album.recordLabels,album.recordLabelSource));
 if(cd&&musicUrl){
  if(!params.has('musicArtist'))project.data.artist=album.artist||'';
  if(!params.has('musicAlbum'))project.data.album=album.album||'';
  if(!params.has('musicProd')&&!params.has('musicPL'))project.data.production=album.production||'';
  if(!['musicA','musicB','sai','sbi'].some(key=>params.has(key))) {
   project.data.A=album.tracks.filter(track=>track.title.trim()).map(track=>({id:uid(),title:track.title,artist:track.artist,seconds:track.seconds}));project.data.B=[];
  }else if(params.has('musicA')&&!params.has('sai')){
   // A raw title keeps its written duration and artist override. The source
   // album can supply an absent artist only for an exact matching title.
   const byTitle=new Map(album.tracks.map(track=>[track.title,track]));
   for(const track of project.data.A)if(!track.artist&&byTitle.get(track.title)?.artist)track.artist=byTitle.get(track.title).artist;
  }
 }
 syncReferenceCDTrayFonts(project);
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
 if(isCDMode(mode))applyAlbumArt(project,artwork,{surfaces:referenceCoverSurfaces(mode)});
 else{applyAlbumArt(project,artwork,mode==='label'?'A':'both');if(mode==='label')applyAlbumArt(project,artwork,'B')}
 const upload=project.uploads.find(item=>item.category==='albumCover');
 if(cover&&upload)upload.referenceAssetKey=cover;
 applyReferenceArtwork(project,params,w,h,mode);
 project.referenceArtworkSource=referenceArtworkKey(url);
 return {artwork,restored:1,musicUrl,choices:project.referenceCoverChoices,index:project.referenceCoverIndex,fallback:selection?.fallback||false,warnings};
}
