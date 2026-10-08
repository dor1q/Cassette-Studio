import {clone} from './model.js';
import {resetCDSurfaces} from './cd-layout.js';
import {isCDMode,modeSurfaces} from './media-formats.js';

const standardSources=new Set(['artist','album','production','note','cdTracks','cdContents','cdSpine']);
const standard=layer=>layer.type==='text'&&standardSources.has(layer.source)&&!!(layer.cdTemplate||layer.referenceCDStandard||layer.referenceCDContent);
const key=(layer,surface)=>JSON.stringify([layer.source,layer.cdPanelIndex??null,layer.cdColumnIndex??(surface.startsWith('cdTray')&&layer.source==='cdTracks'?0:null)]);
const frameKeys=['x','y','w','h','rotation','cdArc','cdArcRadius','maxTracks','cdContentIndex','cdPanelIndex','cdColumnIndex','cdContentFlow','cdTrayTrackFlow'];
const contentStyleKeys=['font','fontWeight','fontStretch','size','color','bold','italic','uppercase','smallcaps','align','lineHeight','spacing','outline','outlineColor','shadow','shadowColor','opacity','visible','autoFit','referenceOwnColor','referenceColorInherited','hideArtist','hideAlbum','hideLyrics','hideTracks','hideA','hideB','showProduction','trackOptions'];
export function resetCDStandardBlocks(project,mode){
 if(!isCDMode(mode))return {updated:0,created:0,locked:0};
 const fresh={...project,surfaces:{}};resetCDSurfaces(fresh,mode,{preserveReference:true});
 const surfaces=modeSurfaces(project,mode),linkedLocked=mode==='cd-insert'&&surfaces.some(surface=>project.surfaces[surface].some(layer=>layer.referenceCDContent&&!layer.referenceBlockCopy&&layer.locked));
 const contentTemplate=mode==='cd-insert'?surfaces.flatMap(surface=>project.surfaces[surface]).find(layer=>layer.source==='cdContents'&&!layer.referenceBlockCopy&&(layer.cdTemplate||layer.referenceCDContent||layer.cdContentFlow))||project.referenceCDContentTemplate:null;
 const result={updated:0,created:0,locked:0};
 for(const surface of surfaces){
  const insideProduction=surface==='cdTrayInside'&&project.surfaces[surface].some(layer=>layer.cdTrayInsideProduction);
  if(insideProduction)continue;
  const pending=new Map(fresh.surfaces[surface].filter(layer=>(!linkedLocked||layer.source!=='cdContents')&&!insideProduction).map(layer=>[key(layer,surface),layer]));
  for(const layer of project.surfaces[surface]){
   if(layer.referenceBlockCopy)continue;
   if(!standard(layer)){if(layer.type==='text'&&layer.source)pending.delete(key(layer,surface));continue}
   if(linkedLocked&&layer.referenceCDContent){result.locked+=Number(!!layer.locked);continue}
   const target=pending.get(key(layer,surface));pending.delete(key(layer,surface));
   if(layer.locked){result.locked++;continue}
   if(target){for(const field of frameKeys)if(target[field]===undefined)delete layer[field];else layer[field]=clone(target[field]);result.updated++}
   if(layer.referenceCDContent){delete layer.referenceCDContent;delete layer.referenceCDContentFrame;layer.cdContentFlow=true}
   delete layer.referenceCDTrayTrack;delete layer.referenceCDTrayTrackFrame;
   delete layer.referenceCDStandard;layer.cdTemplate=true;
  }
  for(const layer of pending.values())if(layer.source==='cdContents'&&contentTemplate)for(const field of contentStyleKeys)if(contentTemplate[field]!==undefined)layer[field]=clone(contentTemplate[field]);
  project.surfaces[surface].push(...pending.values());result.created+=pending.size;
 }
 if(mode==='cd-insert'&&!linkedLocked)delete project.referenceCDContentTemplate;
 if(project.referenceFreePlace?.mode===mode)delete project.referenceFreePlace;
 return result;
}
