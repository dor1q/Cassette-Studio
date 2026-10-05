import {makeLayer,dimensions,panelRects} from './model.js';
import {albumArtLayer,fitCoverImage,albumCoverFrame} from './album-art.js';
import {loadReferenceImage} from './reference-image-source.js';
import {coverChoices,audioBackgroundChoices} from './cover-choices.js';
import {recordLabelMetadata} from '../music-labels.mjs';
import {musicGalleryScope} from './music-gallery-scope.js';

export function storeMusicGallery(project,album){
 Object.assign(project.data,recordLabelMetadata(album.recordLabels,album.recordLabelSource));
 project.referenceCoverChoices=coverChoices(album);project.referenceBackgroundChoices=audioBackgroundChoices(album);
 project.referenceBackgroundChoicesScope=musicGalleryScope({url:album.url,artist:album.artist,album:album.album,cover:album.cover});
 project.referenceCoverIndex=0;project.referenceCoverIndices={};
 delete project.referenceMusicMetadata;delete project.referenceMusicMetadataSource;
}

export async function loadGalleryChoice(project,choice,request,getDimensions){
 if(!choice?.file_path)throw Error('Это изображение недоступно');
 return loadReferenceImage(choice.file_path,request,getDimensions,[...project.uploads,...Object.values(project.surfaces).flat()]);
}

function rememberImage(project,loaded,choice){
 if(project.uploads.some(item=>item.referenceAssetKey===loaded.key))return;
 if(project.uploads.length<30)project.uploads.push({name:choice.label||'Изображение альбома',category:'galleryCover',src:loaded.src,referenceAssetKey:loaded.key});
}

export function applyGalleryCover(project,surface,choice,loaded){
 if(!project.surfaces[surface])throw Error('Неизвестная сторона');
 let layer=albumArtLayer(project,surface);
 if(layer?.locked)throw Error('Обложка закреплена. Сначала снимите закрепление.');
 if(!layer){
  const label=surface.startsWith('label');
  layer=makeLayer('image',{name:'Обложка альбома',category:'albumCover',...albumCoverFrame(project,surface),opacity:label?.5:1});
  const list=project.surfaces[surface],index=list.findIndex(l=>l.category!=='background'&&l.referenceDecalLayer!=='background');list.splice(index<0?list.length:index,0,layer);
 }
 Object.assign(layer,{src:loaded.src,referenceAssetKey:loaded.key,referenceCoverIndex:choice.index,missingReference:false});fitCoverImage(layer);
 project.referenceCoverIndex=choice.index;project.referenceCoverIndices={...project.referenceCoverIndices,[surface]:choice.index};
 project.lastCover=loaded.key;delete project.referenceArtworkSource;rememberImage(project,loaded,choice);return layer;
}

export function applyGalleryBackground(project,surface,choice,loaded){
 if(!project.surfaces[surface])throw Error('Неизвестная сторона');
 const size=dimensions(project,surface),layer=makeLayer('image',{name:'Фон · '+(choice.label||'Изображение альбома'),category:'background',src:loaded.src,referenceAssetKey:loaded.key,x:0,y:0,w:size.w,h:size.h,fit:'slice'});
 project.surfaces[surface].unshift(layer);rememberImage(project,loaded,choice);return layer;
}
