import {clone,resetSurfaces} from './model.js';
import {groupFor} from './flow-editing.js';
import {rebuildReferenceFlow,updateReferenceFrames} from './reference-flow.js';

const frameKeys=['x','y','w','h','rotation'];
const stockSources=new Set(['artist','album','note','spine','A','B','production','lyrics']);
const copy=layer=>!!(layer.standardBlockCopy||layer.referenceBlockCopy||layer.referenceFlowCopySource||layer.referenceFlowCopyIndex!==undefined);
const stockKey=layer=>JSON.stringify([layer.source,layer.source==='lyrics'?layer.flowIndex??0:null]);
const referenceLike=layer=>layer.type==='text'&&!!(layer.referenceFlow||layer.referenceSpine||layer.source==='flapTracks'||layer.referenceFlapProduction||layer.category==='referenceStereo');
const referenceStandard=layer=>referenceLike(layer)&&!copy(layer);
const referenceKey=layer=>layer.referenceFlow?JSON.stringify(['flow',layer.referencePanelIndex,layer.referenceColumn]):layer.source;
function standardIds(project,reference,fresh){
 const ids=new Set();
 for(const surface of ['outer','inner']){
  const defaults=new Map(!reference?fresh.surfaces[surface].filter(layer=>layer.type==='text').map(layer=>[stockKey(layer),layer.name]):[]),groups=new Map();
  for(const layer of project.surfaces[surface]){
   if(layer.type!=='text'||copy(layer)||!(reference?referenceStandard(layer):stockSources.has(layer.source)))continue;
   // Up to 2.4.5, a duplicate had only this generated suffix. Keep these old
   // copies intact after reopening or changing their stacking order.
   if(/(?: ·)? копия(?: \d+)?$/.test(String(layer.name||'')))continue;
   const key=reference?referenceKey(layer):stockKey(layer);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(layer);
  }
  for(const [key,layers]of groups){
   if(layers.length===1){ids.add(layers[0].id);continue}
   const name=reference?({spine:'Корешок',flapTracks:'Треки A/B на клапане',flapProduction:'Выходные данные на коротком клапане',stereo:'Надпись Stereo из ссылки'})[layers[0].source]:defaults.get(key);
   const named=layers.filter(layer=>name&&layer.name===name);
   // Renamed old twins have no saved provenance. Skip an ambiguous slot
   // instead of moving a user's manual copy on the strength of layer order.
   if(named.length===1)ids.add(named[0].id);
  }
 }
 return ids;
}

// Reposition existing bound blocks without replacing the artwork or converting
// the original J-card flow into the generic project template.
export function resetJCardStandardBlocks(project){
 const result={updated:0,locked:0},fresh=clone(project),targets=new Map();
 const reference=!!project.layout.referenceTemplate;
 if(!reference)resetSurfaces(fresh,{mode:'jcard',preserveReference:true});
 const eligible=standardIds(project,reference,fresh);
 if(reference){
  // A reordered manual copy must never become the helper's first spine/flap.
  for(const surface of ['outer','inner'])fresh.surfaces[surface]=fresh.surfaces[surface].filter(layer=>!referenceLike(layer)||eligible.has(layer.id));
  for(const surface of ['outer','inner'])for(const layer of fresh.surfaces[surface])if(referenceStandard(layer)){
   layer.locked=false;delete layer.referenceManualGeometry;delete layer.referenceBlock;
  }
  updateReferenceFrames(fresh);rebuildReferenceFlow(fresh);
  for(const surface of ['outer','inner'])for(const layer of fresh.surfaces[surface])if(referenceStandard(layer)){
   if(layer.category==='referenceStereo')Object.assign(layer,{x:project.layout.flap-3,y:74,w:24,h:3,rotation:90});
   targets.set(layer.id,layer);
  }
 }

 const protectedLayers=new Set();
 for(const surface of ['outer','inner'])for(const layer of project.surfaces[surface])if(layer.locked){
  protectedLayers.add(layer);
  for(const peer of groupFor(project,layer,surface)?.layers||[])protectedLayers.add(peer);
 }
 for(const surface of ['outer','inner']){
  const defaults=new Map(!reference?fresh.surfaces[surface].filter(layer=>layer.type==='text'&&stockSources.has(layer.source)).map(layer=>[stockKey(layer),layer]):[]);
  for(const layer of project.surfaces[surface]){
   if(!eligible.has(layer.id))continue;
   const target=reference?targets.get(layer.id):defaults.get(stockKey(layer));
   if(!reference)defaults.delete(stockKey(layer));
   if(!target)continue;
   if(protectedLayers.has(layer)){result.locked+=Number(!!layer.locked);continue}
   for(const key of frameKeys)layer[key]=target[key];
   if(reference){delete layer.referenceManualGeometry;delete layer.referenceBlock}
   result.updated++;
  }
 }
 return result;
}
