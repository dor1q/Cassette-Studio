import {normalizePaint} from './color-paint.js';

export function surfaceBackground(project,surface){
 return surface==='inner'?project.settings.bgInside:surface==='labelB'?project.settings.bgB:project.settings.bg;
}

export function setProjectTextColor(project,value,{all=false}={}){
 const previous=normalizePaint(project.settings.fg),next=normalizePaint(value);
 project.settings.fg=next;project.settings.referenceTransparentText=next==='transparent';
 for(const layer of Object.values(project.surfaces).flat()){
  if(['qr','barcode'].includes(layer.type)){
   if(!layer.referenceOwnColor&&(layer.referenceColorInherited===true||layer.referenceColorInherited===undefined&&normalizePaint(layer.color)===previous))layer.color=next;
   continue;
  }
  if(layer.type!=='text')continue;
  if(all||!layer.referenceOwnColor&&normalizePaint(layer.color)===previous){layer.color=next;if(all)layer.referenceOwnColor=false}
  if(layer.albumStyle&&(all||!layer.referenceAlbumOwnColor&&normalizePaint(layer.albumStyle.color)===previous)){layer.albumStyle.color=next;if(all)layer.referenceAlbumOwnColor=false}
  if(layer.referenceHiddenByTextColor&&next!=='transparent'){layer.visible=true;delete layer.referenceHiddenByTextColor}
 }
 return next;
}
