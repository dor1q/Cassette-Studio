import {makeLayer,panelRects,clone,uid} from './model.js';
import {REFERENCE_UNIT} from './reference-format.js';

export function updateReferenceFrames(project){
 if(!project.layout.referenceTemplate)return;
 const layout=project.layout,extended=layout.flapShape==='extended';
 const flap=project.surfaces.outer.find(l=>l.source==='flapTracks');
 if(flap&&!flap.referenceBlock&&!flap.locked){
  const wasExtended=flap.referenceExtended??flap.rotation===0;
  Object.assign(flap,extended?{x:36*REFERENCE_UNIT,y:40*REFERENCE_UNIT,w:layout.flap-72*REFERENCE_UNIT,h:layout.height-80*REFERENCE_UNIT,rotation:0}:{x:layout.flap-1,y:4,w:layout.height-8,h:layout.flap-2,rotation:90});
  if(wasExtended!==extended){flap.align=extended?'left':'center';flap.lineHeight=extended?1.35:1.5;flap.trackOptions={...flap.trackOptions,inlineTracks:!extended}}
  flap.referenceExtended=extended;flap.flapTapered=layout.flapShape==='tapered';
 }
 const spine=project.surfaces.outer.find(l=>l.referenceSpine);
 if(spine&&!spine.referenceBlock&&!spine.locked)Object.assign(spine,{x:layout.flap+layout.spine-2,y:4,w:layout.height-8,h:layout.spine-4,rotation:90});
}

export function referenceFlowCopy(layer){
 return layer.referenceFlow?{...clone(layer),referenceFlow:false,referenceFlowCopyIndex:layer.flowIndex,flowIndex:undefined}:clone(layer);
}

export function rebuildReferenceFlow(project,template){
 const previous=Object.entries(project.surfaces).flatMap(([surface,layers])=>layers.filter(l=>l.referenceFlow).map(l=>({...l,flowSurface:surface})));
 template||=previous[0];if(!template)return;
 for(const surface of ['outer','inner'])project.surfaces[surface]=project.surfaces[surface].filter(l=>!l.referenceFlow);
 let index=0,insideIndex=0;const columns=project.layout.columns||1,padX=36*REFERENCE_UNIT,padY=40*REFERENCE_UNIT,gap=24*REFERENCE_UNIT;
 for(const surface of ['outer','inner']){
  if(surface==='inner'&&!project.layout.double)continue;
  for(const panel of panelRects(project,surface).filter(r=>r.index>=(surface==='outer'?3:2)))for(let column=0;column<columns;column++){
   const width=(panel.w-2*padX-gap*(columns-1))/columns;
   const old=previous.find(l=>l.flowSurface===surface&&l.referencePanelIndex===panel.index&&l.referenceColumn===column)||template;
   const height=(project.layout.height-2*padY)*(columns>1?(project.layout.columnHeight||100)/100:1);
   project.surfaces[surface].push(makeLayer('text',{
    ...clone(old),id:uid(),source:'referenceContents',category:surface==='inner'?'insideTracks':'referenceContents',referenceFlow:true,
    referencePanelIndex:panel.index,referenceColumn:column,flowIndex:index++,insideIndex:surface==='inner'?insideIndex++:undefined,
    name:(surface==='inner'?'Содержимое оборота':'Содержимое внешней панели')+' · '+(panel.index-1)+(columns>1?' / '+(column+1):''),
    x:panel.x+padX+column*(width+gap),y:padY,w:width,h:height,rotation:0,autoFit:false,visible:old.visible!==false,
    ...(old.referenceBlock?{x:old.x,y:old.y,w:old.w,h:old.h,rotation:old.rotation}:{})
   }));
  }
 }
}
