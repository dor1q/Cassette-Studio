import {parseMusicLink} from '../music-links.mjs';
import {applyAlbumArt,applyReferenceArtwork,cachedReferenceArtwork,referenceArtworkKey} from './album-art.js';
import {referenceImageDimensions} from './reference-image-source.js';
import {selectCoverChoice,referenceCoverIndex,audioBackgroundChoices,coverChoices} from './cover-choices.js';
import {loadReferenceImage} from './reference-image-source.js';

export function referenceMusicUrl(params){
 const supplied=params.get('playlistUrl');
 if(supplied){try{return parseMusicLink(supplied).url}catch{}}
 const id=params.get('id')||'',source=params.get('source')||'',value=id.includes('.')?id.slice(id.indexOf('.')+1):id;
 const spotify=source.match(/^spotify-(album|track|playlist)$/)?.[1]||({sa:'album',st:'track',sp:'playlist'})[id.split('.')[0]]||(source==='spotify'?'playlist':'');
 if(spotify&&/^[A-Za-z0-9]{22}$/.test(value))return 'https://open.spotify.com/'+spotify+'/'+value;
 if((/^a\.\d+$/.test(id)||/^apple-(album|song|track)$/.test(source))&&/^\d+$/.test(value)){
  return 'https://music.apple.com/'+(params.get('country')||'us')+'/'+(/song|track/.test(source)?'song':'album')+'/id'+value;
 }
 if((/^ap\./.test(id)||source==='apple')&&/^pl\.[A-Za-z0-9.-]+$/.test(value))return 'https://music.apple.com/'+(params.get('country')||'us')+'/playlist/'+value;
 const deezer=source.match(/^deezer-(album|track|playlist)$/)?.[1]||(/^dz\./.test(id)||source==='deezer'?'playlist':'');
 if(deezer&&/^\d+$/.test(value))return 'https://www.deezer.com/'+deezer+'/'+value;
 const youtube=source.match(/^youtube(?:-music)?-(video|track|playlist)$/)?.[1]||(/^yv\./.test(id)?'video':/^yt\./.test(id)?'playlist':'');
 if(youtube&&/^[A-Za-z0-9_-]{10,120}$/.test(value))return youtube==='playlist'?'https://www.youtube.com/playlist?list='+value:'https://www.youtube.com/watch?v='+value;
 return '';
}

export async function restoreReferenceMusicMetadata(project,url,request,previous=project){
 const musicUrl=referenceMusicUrl(url.searchParams);
 if(!musicUrl)return {album:null,musicUrl,choices:[],backgroundChoices:[],cached:false};
 const reusable=[project,previous].find(candidate=>candidate.referenceMusicMetadataSource===musicUrl&&candidate.referenceMusicMetadata);
 const imported=reusable?.referenceMusicMetadata||await request('/api/import?url='+encodeURIComponent(musicUrl));
 // Keep only artwork metadata needed to restore galleries, never session or service-connection data.
 const normalized=coverChoices(imported);
 const album={cover:normalized[0].file_path||'',coverAlternatives:[...(imported.coverAlternatives||[])],url:imported.url||musicUrl,
  customPosters:normalized.slice(1).map(({index,...poster})=>poster),
  tracks:Array.isArray(imported.tracks)?imported.tracks.map(track=>({title:track.title||track.trackName||'',thumbnail:track.thumbnail||'',thumbnailWidth:track.thumbnailWidth,thumbnailHeight:track.thumbnailHeight})):[]};
 const options={cp:url.searchParams.get('cp')||''},selection=selectCoverChoice(album,url.searchParams,options),backgroundChoices=audioBackgroundChoices(album,options);
 project.referenceMusicMetadataSource=musicUrl;project.referenceMusicMetadata=album;
 project.referenceCoverChoices=selection.choices;project.referenceBackgroundChoices=backgroundChoices;
 return {album,musicUrl,choices:selection.choices,backgroundChoices,cached:!!reusable};
}

export async function restoreReferenceMusicArtwork(project,url,request,mode='jcard',previous=project,getDimensions=referenceImageDimensions){
 const params=url.searchParams;
 if(referenceCoverIndex(params)===-1)return {artwork:'',restored:0};
 const cached=cachedReferenceArtwork(previous,url),musicUrl=referenceMusicUrl(params);
 if(!cached&&!musicUrl)return {artwork:'',restored:0};
 let artwork=cached,cover='',selection=null,warnings=[];
 const fallbackWarning='Выбранная картинка недоступна. Загружена основная обложка.';
 if(!artwork){
  const {album}=await restoreReferenceMusicMetadata(project,url,request,previous);selection=selectCoverChoice(album,params);cover=selection.file_path||'';
  if(!cover)throw Error('Музыкальный сервис не вернул обложку');
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
  project.data.url||=musicUrl||previous.data.url;
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
