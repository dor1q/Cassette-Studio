import {loadReferenceImage,referenceImageSource,referenceImageDimensions,embeddedReferenceImage} from './reference-image-source.js';
import {referenceBackgroundRetrySource,referenceBackgroundRetryFrame,referenceBackgroundFrameSnapshot} from './reference-background.js';

export function missingReferenceImages(project){
 return Object.entries(project.surfaces).flatMap(([surface,layers])=>layers.filter(layer=>layer.type==='image'&&layer.missingReference&&!embeddedReferenceImage(layer.src)).map(layer=>({surface,layer})));
}

// Mutates a prepared project copy. The caller checks that the active project is
// unchanged before replacing it; retrying never resets text or edited frames.
export async function retryReferenceImages(project,request,{getDimensions=referenceImageDimensions,refreshGallery}={}){
 const result={restored:0,missing:0,locked:0,warnings:[]},pending=missingReferenceImages(project);
 if(!pending.length)return result;
 if(refreshGallery&&pending.some(({layer})=>layer.referenceBackgroundSource?.type==='providerIndex'))try{await refreshGallery(project)}catch{result.warnings.push('Галерея пока недоступна. Доступные картинки будут загружены отдельно.')}
 const cached=[...Object.values(project.surfaces).flat(),...(project.uploads||[])],loads=new Map();
 const pairKey=layer=>layer.referenceBackgroundSourceKey||layer.referenceAssetKey||'';
 const blocked=project.layout.sync?new Set(['labelA','labelB'].flatMap(surface=>(project.surfaces[surface]||[]).filter(layer=>layer.locked).map(pairKey)).filter(Boolean)):new Set();
 for(const {surface,layer}of pending){
  if(layer.locked||surface.startsWith('label')&&blocked.has(pairKey(layer))){result.locked++;continue}
  const source=layer.referenceBackground?referenceBackgroundRetrySource(project,layer):referenceImageSource(layer.referenceAssetKey);
  if(!source||source.startsWith('storage:')){result.missing++;continue}
  try{
   if(!loads.has(source))loads.set(source,loadReferenceImage(source,request,getDimensions,cached));
   const data=await loads.get(source),frame=layer.referenceBackground&&referenceBackgroundRetryFrame(project,layer,data,surface);
   if(frame){Object.assign(layer,frame);layer.referenceBackgroundRestoreFrame=referenceBackgroundFrameSnapshot(layer)}
   layer.src=data.src;layer.referenceAssetKey=data.key;delete layer.missingReference;
   if(/— замените файл$/.test(layer.name))layer.name=layer.name.replace(/ — замените файл$/,'');
   result.restored++;
  }catch{result.missing++}
 }
 if(result.missing)result.warnings.push('Часть файлов недоступна. Выберите такой слой и замените картинку своим файлом.');
 if(result.locked)result.warnings.push('Закреплённые картинки сохранены. Снимите закрепление, чтобы повторить их загрузку.');
 return result;
}
