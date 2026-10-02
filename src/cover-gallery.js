import {makeLayer,dimensions,panelRects} from './model.js';
import {albumArtLayer,fitCoverImage} from './album-art.js';
import {loadReferenceImage} from './reference-image-source.js';
import {coverChoices,audioBackgroundChoices} from './cover-choices.js';

export function storeMusicGallery(project,album){
 project.referenceCoverChoices=coverChoices(album);project.referenceBackgroundChoices=audioBackgroundChoices(album);
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
  const size=dimensions(project,surface),label=surface.startsWith('label'),front=label?null:panelRects(project,surface).find(p=>p.index===2);
  layer=makeLayer('image',{name:'Обложка альбома',category:'albumCover',x:front?.x||0,y:0,w:front?.w||size.w,h:size.h,opacity:label?.5:1});
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
