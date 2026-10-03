import {makeLayer,panelRects,clone,uid,clamp} from './model.js';
import {REFERENCE_UNIT} from './reference-format.js';
import {normalizePaint} from './color-paint.js';

export function markReferenceGeometry(layer){
 if(layer&&(layer.referenceFlow||layer.referenceSpine||['flapTracks','flapProduction'].includes(layer.source)))layer.referenceManualGeometry=true;
 return layer;
}

// The short flap has an independent, horizontal production block. Other flap
// shapes keep this text in the track block. Measurements use the public 600 dpi
// layout: 8 px padding, a 32 px gap and a 750 px barcode reservation.
export function referenceFlapProductionFrame(project,layer){
 const layout=project.layout,padding=8*REFERENCE_UNIT,edge=6*REFERENCE_UNIT;
 const w=Math.max(.1,layout.flap-2*(edge+padding));
 const size=Math.max(.1,Number(layer.size)||1),stretch=(Number(layer.fontStretch)||100)/100;
 const lines=String(project.data.production||'').split(/\r?\n/).reduce((count,line)=>count+Math.max(1,Math.ceil((line.length*size*.55+Math.max(0,line.length-1)*(layer.spacing||0))*stretch/w)),0);
 const h=Math.max(size*(layer.lineHeight||1.5),lines*size*(layer.lineHeight||1.5));
 const reserved=project.surfaces.outer.some(item=>item.type==='barcode'&&item.visible)?750*REFERENCE_UNIT:0;
 // The source stacks fixed-height tracks and the natural-height credit block
 // around the centre of the flap; the resulting text remains clipped by the card.
 return {x:edge+padding,y:layout.height-reserved-16*REFERENCE_UNIT-h/2,w,h,rotation:0};
}

export function updateReferenceFlapProduction(project){
 if(!project.layout.referenceTemplate)return null;
 const flap=project.surfaces.outer.find(layer=>layer.source==='flapTracks'&&!layer.referenceBlockCopy);
 if(!flap)return null;
 const short=project.layout.flapShape==='short';flap.referenceFlapProductionSeparate=short;
 let production=project.surfaces.outer.find(layer=>layer.source==='flapProduction'&&layer.referenceFlapProduction&&!layer.referenceBlockCopy);
 if(!production&&!short)return null;
 if(!production&&flap.referenceFlapProductionCreated)return null;
 if(!production){
  const keys=['font','fontWeight','fontStretch','bold','italic','uppercase','smallcaps','spacing','outline','outlineColor','shadow','shadowColor','opacity','color','referenceOwnColor','referenceHiddenByTextColor'];
  const style=Object.fromEntries(keys.filter(key=>Object.hasOwn(flap,key)).map(key=>[key,flap[key]]));
  production=makeLayer('text',{...style,source:'flapProduction',name:'Выходные данные на коротком клапане',referenceFlapProduction:true,size:flap.size*.85,lineHeight:1.5,align:'center',autoFit:false});
  project.surfaces.outer.push(production);
 }
 flap.referenceFlapProductionCreated=true;
 if(!production.referenceBlock&&!production.referenceManualGeometry&&!production.locked)Object.assign(production,referenceFlapProductionFrame(project,production));
 const active=short&&!!flap.trackOptions?.showProduction&&!!String(project.data.production||'').trim();
 const transparent=project.settings.referenceTransparentText&&!production.referenceOwnColor&&normalizePaint(production.color)==='transparent';
 if(active){
  if(transparent){if(production.visible||production.referenceFlapProductionHidden)production.referenceHiddenByTextColor=true;production.visible=false;delete production.referenceFlapProductionHidden}
  else if(production.referenceFlapProductionHidden){production.visible=true;delete production.referenceFlapProductionHidden}
 }
 else if(production.visible){production.visible=false;production.referenceFlapProductionHidden=true}
 return production;
}

export function updateReferenceFrames(project){
 if(!project.layout.referenceTemplate)return;
 const layout=project.layout,extended=layout.flapShape==='extended';
 const flap=project.surfaces.outer.find(l=>l.source==='flapTracks');
 if(flap&&!flap.referenceBlock&&!flap.referenceManualGeometry&&!flap.locked){
  const wasExtended=flap.referenceExtended??flap.rotation===0;
  Object.assign(flap,extended?{x:36*REFERENCE_UNIT,y:40*REFERENCE_UNIT,w:layout.flap-72*REFERENCE_UNIT,h:layout.height-80*REFERENCE_UNIT,rotation:0}:{x:layout.flap-1,y:4,w:layout.height-8,h:layout.flap-2,rotation:90});
  if(wasExtended!==extended){flap.align=extended?'left':'center';flap.lineHeight=extended?1.35:1.5;flap.trackOptions={...flap.trackOptions,inlineTracks:!extended}}
  flap.referenceExtended=extended;flap.flapTapered=layout.flapShape==='tapered';
 }
 const spine=project.surfaces.outer.find(l=>l.referenceSpine);
 if(spine&&!spine.referenceBlock&&!spine.referenceManualGeometry&&!spine.locked)Object.assign(spine,{x:layout.flap+layout.spine-2,y:4,w:layout.height-8,h:layout.spine-4,rotation:90});
 updateReferenceFlapProduction(project);
}

function flowSource(layer,surface=layer.referenceFlowSurface||layer.flowSurface){
 return ['outer','inner'].includes(surface)&&Number.isInteger(layer.referencePanelIndex)&&Number.isInteger(layer.referenceColumn)?{surface,panel:layer.referencePanelIndex,column:layer.referenceColumn}:null;
}

const flowSlot=source=>source&&`${source.surface}:${source.panel}:${source.column}`;
function validArchivedFlow(layer){
 const source=layer&&flowSource(layer);
 return !!(source&&layer.type==='text'&&layer.referenceFlow&&layer.source==='referenceContents'&&source.panel>=(source.surface==='outer'?3:2)&&source.panel<8&&source.column>=0&&source.column<2);
}

function archivedTextLayer(layer,template=false){
 if(!layer||layer.type!=='text'||layer.source!=='referenceContents'||!template&&!validArchivedFlow(layer))return null;
 const styleKeys=['id','name','x','y','w','h','rotation','opacity','visible','locked','color','font','size','bold','fontWeight','fontStretch','italic','uppercase','smallcaps','align','lineHeight','spacing','outline','outlineColor','shadow','shadowColor','autoFit','text','hideArtist','hideAlbum','hideA','hideB','referenceOwnColor','referenceHiddenByTextColor','referenceManualGeometry','referenceBlock','referenceSuspendedBlock','referenceFreePlaceToken'];
 const out=makeLayer('text',Object.fromEntries(styleKeys.filter(key=>Object.hasOwn(layer,key)).map(key=>[key,layer[key]])));
 out.id=/^[a-z0-9-]{1,100}$/i.test(out.id||'')?out.id:uid();
 out.name=String(out.name||'Содержимое').slice(0,200);out.text=String(out.text||'').slice(0,100000);out.font=String(out.font||'Arial').slice(0,200);
 for(const key of ['x','y','rotation'])out[key]=clamp(out[key],-2000,2000);
 for(const key of ['w','h'])out[key]=clamp(out[key],.1,1500);
 for(const [key,min,max] of [['size',.1,100],['fontStretch',50,200],['opacity',0,1],['lineHeight',.5,4],['spacing',-1,10],['outline',0,2],['shadow',0,5]])out[key]=clamp(out[key],min,max);
 out.fontWeight=out.fontWeight?clamp(out.fontWeight,100,900):0;out.color=normalizePaint(out.color);
 for(const key of ['outlineColor','shadowColor'])if(!/^#[a-f0-9]{6}$/i.test(out[key]||''))out[key]='#000000';
 for(const key of ['visible','locked','bold','italic','uppercase','smallcaps','autoFit','hideArtist','hideAlbum','hideA','hideB','referenceOwnColor','referenceHiddenByTextColor','referenceManualGeometry'])out[key]=!!out[key];
 out.align=['left','center','right'].includes(out.align)?out.align:'left';
 if(typeof out.referenceBlock==='string'&&/^[a-z0-9]+-[a-z0-9]+$/i.test(out.referenceBlock))out.referenceBlock=out.referenceBlock.slice(0,200);else delete out.referenceBlock;
 if(!(typeof out.referenceSuspendedBlock==='string'&&out.referenceSuspendedBlock.length<=200&&/^[a-z0-9]+-[a-z0-9]+$/i.test(out.referenceSuspendedBlock)))delete out.referenceSuspendedBlock;
 if(typeof out.referenceFreePlaceToken==='string'&&/^[a-z0-9-]{1,100}$/i.test(out.referenceFreePlaceToken))out.referenceFreePlaceToken=out.referenceFreePlaceToken.slice(0,100);else delete out.referenceFreePlaceToken;
 if(layer.trackOptions&&typeof layer.trackOptions==='object'&&!Array.isArray(layer.trackOptions)){
  out.trackOptions={};
  for(const key of ['numbers','artists','durations','bullets','inlineTracks','showSide','hideTracks','showProduction'])if(typeof layer.trackOptions[key]==='boolean')out.trackOptions[key]=layer.trackOptions[key];
  for(const key of ['sideText','sideA','sideB'])if(typeof layer.trackOptions[key]==='string')out.trackOptions[key]=layer.trackOptions[key].slice(0,200);
 }
 out.source='referenceContents';out.referenceFlow=!template;
 if(!template){const source=flowSource(layer);Object.assign(out,{referenceFlowSurface:source.surface,referencePanelIndex:source.panel,referenceColumn:source.column,category:source.surface==='inner'?'insideTracks':'referenceContents'});for(const key of ['flowIndex','insideIndex'])if(Number.isInteger(layer[key])&&layer[key]>=0&&layer[key]<32)out[key]=layer[key]}
 return out;
}

export function sanitizeReferenceFlowArchive(project){
 const seenSlots=new Set(),seenIds=new Set(Object.values(project.surfaces).flat().map(layer=>layer.id)),archived=[];
 if(Array.isArray(project.referenceFlowArchive))for(const layer of project.referenceFlowArchive.slice(0,32)){
  const normalized=archivedTextLayer(layer),slot=normalized&&flowSlot(flowSource(normalized));if(!normalized||seenSlots.has(slot))continue;
  seenSlots.add(slot);if(seenIds.has(normalized.id))normalized.id=uid();seenIds.add(normalized.id);archived.push(normalized);
 }
 if(Object.hasOwn(project,'referenceFlowArchive'))project.referenceFlowArchive=archived;
 if(Object.hasOwn(project,'referenceFlowTemplate')){const template=archivedTextLayer(project.referenceFlowTemplate,true);if(template)project.referenceFlowTemplate=template;else delete project.referenceFlowTemplate}
 return project;
}

export function referenceFlowLayers(project){
 const active=Object.values(project.surfaces).flat().filter(layer=>layer.referenceFlow),archived=Array.isArray(project.referenceFlowArchive)?project.referenceFlowArchive.slice(0,32).filter(validArchivedFlow):[];
 return [...active,...archived,...(project.referenceFlowTemplate?.type==='text'?[project.referenceFlowTemplate]:[])];
}

export function referenceFlowCopy(layer,surface){
 if(!layer.referenceFlow){const copy=clone(layer);if(copy.referenceFlapProduction){delete copy.referenceFlapProduction;delete copy.referenceFlapProductionHidden}return copy}
 const source=flowSource(layer,surface);
 return {...clone(layer),referenceFlow:false,referenceFlowCopyIndex:layer.flowIndex,...(source?{referenceFlowCopySource:source}:{}),flowIndex:undefined};
}

export function findReferenceFlowCopySource(project,copy){
 const source=copy.referenceFlowCopySource;
 for(const surface of ['outer','inner']){
  const layer=project.surfaces[surface].find(layer=>layer.referenceFlow&&(source?surface===source.surface&&layer.referencePanelIndex===source.panel&&layer.referenceColumn===source.column:layer.flowIndex===copy.referenceFlowCopyIndex));
  if(layer)return {surface,layer};
 }
 return null;
}

export function rebuildReferenceFlow(project,template){
 sanitizeReferenceFlowArchive(project);
 const freshTemplate=!!template;
 const previous=freshTemplate?[]:Object.entries(project.surfaces).flatMap(([surface,layers])=>layers.filter(l=>l.referenceFlow).map(l=>({...l,flowSurface:surface})));
 const archived=!freshTemplate&&Array.isArray(project.referenceFlowArchive)?project.referenceFlowArchive.slice(0,32).filter(validArchivedFlow):[];
 if(freshTemplate){project.referenceFlowArchive=[];project.referenceFlowTemplate=archivedTextLayer(template,true)}
 template||=previous[0]||archived[0]||project.referenceFlowTemplate;if(!template)return;
 const candidates=new Map();
 for(const layer of [...archived,...previous]){
  const source=flowSource(layer);if(!source||!validArchivedFlow({...layer,referenceFlowSurface:source.surface}))continue;
  const saved={...clone(layer),referenceFlowSurface:source.surface};delete saved.flowSurface;candidates.set(flowSlot(source),saved);
 }
 for(const copy of Object.values(project.surfaces).flat())if(!copy.referenceFlow&&!copy.referenceFlowCopySource&&copy.referenceFlowCopyIndex!==undefined){
  const original=previous.find(layer=>layer.flowIndex===copy.referenceFlowCopyIndex),source=original&&flowSource(original);
  if(source)copy.referenceFlowCopySource=source;
 }
 for(const surface of ['outer','inner'])project.surfaces[surface]=project.surfaces[surface].filter(l=>!l.referenceFlow);
 let index=0,insideIndex=0;const activeSlots=new Set(),columns=project.layout.columns||1,padX=36*REFERENCE_UNIT,padY=40*REFERENCE_UNIT,gap=24*REFERENCE_UNIT;
 for(const surface of ['outer','inner']){
  if(surface==='inner'&&!project.layout.double)continue;
  for(const panel of panelRects(project,surface).filter(r=>r.index>=(surface==='outer'?3:2)))for(let column=0;column<columns;column++){
   const width=(panel.w-2*padX-gap*(columns-1))/columns;
   const slot=flowSlot({surface,panel:panel.index,column}),matched=candidates.get(slot),old=matched||template,style=clone(old);activeSlots.add(slot);
   if(!matched)for(const key of ['referenceBlock','referenceSuspendedBlock','referenceFreePlaceToken','referenceBlockCopy','referenceManualGeometry','referenceFlowCopyIndex','referenceFlowCopySource'])delete style[key];
   delete style.flowSurface;
   const height=(project.layout.height-2*padY)*(columns>1?(project.layout.columnHeight||100)/100:1);
   project.surfaces[surface].push(makeLayer('text',{
    ...style,id:matched?.id||uid(),source:'referenceContents',category:surface==='inner'?'insideTracks':'referenceContents',referenceFlow:true,referenceFlowSurface:surface,
    referencePanelIndex:panel.index,referenceColumn:column,flowIndex:index++,insideIndex:surface==='inner'?insideIndex++:undefined,
    name:(surface==='inner'?'Содержимое оборота':'Содержимое внешней панели')+' · '+(panel.index-1)+(columns>1?' / '+(column+1):''),
    x:panel.x+padX+column*(width+gap),y:padY,w:width,h:height,rotation:0,autoFit:false,visible:matched?old.visible!==false:previous.length||archived.length?true:old.visible!==false,locked:matched?!!old.locked:false,
    ...(matched&&(old.referenceBlock||old.referenceManualGeometry||old.locked)?{x:old.x,y:old.y,w:old.w,h:old.h,rotation:old.rotation}:{})
   }));
  }
 }
 project.referenceFlowArchive=[...candidates].filter(([slot])=>!activeSlots.has(slot)).map(([,layer])=>layer).slice(0,32);
}
