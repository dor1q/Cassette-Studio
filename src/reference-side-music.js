import {parseMusicLink} from '../music-links.mjs';
import {uid} from './model.js';
import {referenceImageSource} from './reference-image-source.js';
import {coverChoices,audioBackgroundChoices} from './cover-choices.js';

const storefront=value=>/^[a-z]{2}$/i.test(value||'')?value.toLowerCase():'us';
const publicSource=value=>{try{return parseMusicLink(value).url}catch{return ''}};
const imageDimension=value=>Number.isFinite(Number(value))&&Number(value)>0?Math.min(100000,Number(value)):undefined;

// Saved side imports use collection IDs as well as normal service share links.
export function referenceMusicSource(value,{country='us',source='',allowNumeric=true,allowLegacyApplePlaylist=false}={}){
 const raw=String(value||'').trim();if(!raw||raw.length>4096)return '';
 const direct=publicSource(raw);if(direct)return direct;
 const compact=/^(sa|sp|st|a|ap|yt|yv|dz)\.(.+)$/.exec(raw);
 let type=source,id=raw;
 if(compact){
  const explicit=/^(?:spotify-(?:album|track|playlist)|youtube(?:-music)?-(?:video|track|playlist)|deezer-(?:album|track|playlist)|apple(?:-(?:album|song|track))?)$/.test(source);
  type=explicit?source:({sa:'spotify-album',sp:'spotify',st:'spotify-track',a:'album',ap:'apple',yt:'youtube',yv:'youtube-video',dz:'deezer'})[compact[1]];id=compact[2];
 }
 const legacy=/^(spotify(?:-album|-track)?|youtube(?:-video)?|apple|deezer(?:-album|-track)?):(.+)$/.exec(id);
 if(legacy){type=legacy[1];id=legacy[2]}
 let url='';
 const spotify={spotify:'playlist','spotify-playlist':'playlist','spotify-album':'album','spotify-track':'track'}[type];
 if(spotify&&/^[a-z0-9]{22}$/i.test(id))url='https://open.spotify.com/'+spotify+'/'+id;
 const youtube={youtube:'playlist','youtube-playlist':'playlist','youtube-music-playlist':'playlist','youtube-video':'track','youtube-track':'track','youtube-music-video':'track','youtube-music-track':'track'}[type];
 if(youtube&&/^[a-z0-9_-]{10,120}$/i.test(id))url=youtube==='playlist'?'https://www.youtube.com/playlist?list='+id:'https://www.youtube.com/watch?v='+id;
 const deezer={deezer:'playlist','deezer-playlist':'playlist','deezer-album':'album','deezer-track':'track'}[type];
 if(deezer&&/^\d+$/.test(id))url='https://www.deezer.com/'+deezer+'/'+id;
 if((type==='album'||/^apple(?:-(?:album|song|track))?$/.test(type)||allowNumeric&&!type)&&/^\d+$/.test(id))url='https://music.apple.com/'+storefront(country)+'/'+(/song|track/.test(type)?'song':'album')+'/id'+id;
 if(type==='apple'&&/^pl\.[a-z0-9.-]+$/i.test(id)){
  url='https://music.apple.com/'+storefront(country)+'/playlist/'+id;
  // The original URL codec accepted older playlist IDs more broadly than today's service importer.
  if(allowLegacyApplePlaylist)return url;
 }
 return publicSource(url);
}

function normalizedAlbum(album,url){
 if(!album||!Array.isArray(album.tracks))throw Error('Сервис не вернул список треков');
 const tracks=album.tracks.slice(0,2000).map(track=>({
  title:String(track?.title||track?.trackName||track?.name||'').trim().slice(0,1000),
  artist:String(track?.artist||'').slice(0,500),seconds:Math.max(0,Math.min(86400,Math.round(Number(track?.seconds)||0))),
  thumbnail:referenceImageSource(track?.thumbnail)||'',thumbnailWidth:imageDimension(track?.thumbnailWidth),thumbnailHeight:imageDimension(track?.thumbnailHeight)
 }));
 if(tracks.some(track=>!track.title))throw Error('Сервис вернул треки без названий');
 const cover=coverChoices(album)[0]?.file_path||'';
 return {url,cover,artist:String(album.artist||album.artistName||'').slice(0,500),album:String(album.album||album.collectionName||'').slice(0,1000),
  coverWidth:imageDimension(album.coverWidth||album.artworkWidth),coverHeight:imageDimension(album.coverHeight||album.artworkHeight),tracks};
}

export function referenceSidePosters(project){
 return ['A','B'].flatMap(side=>{
  const album=project.referenceSideMusic?.[side]?.album,source=referenceImageSource(album?.cover);
  return source?[{file_path:source,type:'side-import',label:album.album||album.artist||'Side '+side,width:album.coverWidth,height:album.coverHeight}]:[];
 });
}

export function mergeReferenceSidePosters(project,album){
 const posters=(Array.isArray(album?.customPosters)?album.customPosters:[]).filter(poster=>poster?.type!=='side-import');
 const seen=new Set(posters.map(poster=>referenceImageSource(typeof poster==='string'?poster:poster?.file_path||poster?.src||poster?.url)).filter(Boolean));
 for(const poster of referenceSidePosters(project))if(!seen.has(poster.file_path)){seen.add(poster.file_path);posters.push(poster)}
 return {...album,customPosters:posters};
}

export function updateReferenceSideGallery(project,params){
 const album=mergeReferenceSidePosters(project,project.referenceMusicMetadata||{cover:'',customPosters:[],tracks:[]});
 if(project.referenceMusicMetadata)project.referenceMusicMetadata=album;
 project.referenceCoverChoices=coverChoices(album,{cp:params?.get('cp')||''});
 project.referenceBackgroundChoices=audioBackgroundChoices(album,{cp:params?.get('cp')||''});
 return album;
}

export async function restoreReferenceSideMusic(project,params,request,{previous=project}={}){
 const restored=[],warnings=[],sources={},pending=new Map();
 for(const side of ['A','B']){
  const raw=params.get(side==='A'?'sai':'sbi');if(!raw)continue;
  const url=referenceMusicSource(raw,{country:params.get('country')||'us'});
  if(!url){warnings.push('Сторона '+side+': не удалось распознать музыкальный источник.');continue}
  try{
   let album;
   const cached=[project,previous].flatMap(p=>Object.values(p.referenceSideMusic||{})).find(item=>item?.url===url&&item?.album);
   if(cached)album=normalizedAlbum(cached.album,url);
   else{
    if(!pending.has(url))pending.set(url,request('/api/import?url='+encodeURIComponent(url)));
    album=normalizedAlbum(await pending.get(url),url);
   }
   sources[side]={source:String(raw).slice(0,4096),url,album};restored.push(side);
   if(!params.has('music'+side))project.data[side]=album.tracks.map(track=>({id:uid(),title:track.title,artist:track.artist,seconds:track.seconds}));
  }catch(error){warnings.push('Сторона '+side+': '+error.message)}
 }
 project.referenceSideMusic=sources;
 if(restored.length)updateReferenceSideGallery(project,params);
 return {restored,count:restored.length,warnings};
}

export function sanitizeReferenceSideMusic(project){
 const sources={};
 for(const side of ['A','B']){
  const item=project.referenceSideMusic?.[side];if(!item)continue;
  const url=referenceMusicSource(item.url,{allowNumeric:false});if(!url)continue;
  try{sources[side]={source:String(item.source||url).slice(0,4096),url,album:normalizedAlbum(item.album,url)}}catch{}
 }
 if(Object.keys(sources).length)project.referenceSideMusic=sources;else delete project.referenceSideMusic;
}
