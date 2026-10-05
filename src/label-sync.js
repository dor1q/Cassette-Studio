import {clone,uid} from './model.js';
import {albumArtLayer} from './album-art.js';

// A lock on the destination side protects its complete design from replacement.
// Turn synchronization off instead of silently mixing two independent layouts.
export function synchronizeLabelLayers(project,surface){
 if(!surface.startsWith('label')||!project.layout.sync)return {mirrored:false,blocked:false};
 const other=surface==='labelA'?'labelB':'labelA';
 if(project.surfaces[other].some(layer=>layer.locked)){
  project.layout.sync=false;
  return {mirrored:false,blocked:true,other};
 }
 project.surfaces[other]=clone(project.surfaces[surface]).map(layer=>({...layer,id:uid()}));
 const index=albumArtLayer(project,surface)?.referenceCoverIndex;
 if(index!==undefined)project.referenceCoverIndices={...project.referenceCoverIndices,[surface]:index,[other]:index};
 else if(project.referenceCoverIndices){delete project.referenceCoverIndices[surface];delete project.referenceCoverIndices[other]}
 return {mirrored:true,blocked:false,other};
}
