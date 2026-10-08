import {resetCDSurfaces,makeCDProductionLayer} from './cd-layout.js';
const sources=new Set(['artist','album','cdTracks','production']);
const members=(project,source)=>(project.surfaces.cdLabel||[]).filter(layer=>layer.type==='text'&&layer.source===source);
export function cdLabelSectionState(project,source){
 const layers=members(project,source);
 return {present:layers.length>0,visible:layers.some(layer=>layer.visible!==false&&(source!=='cdTracks'||!(layer.trackOptions?.hideTracks??layer.hideTracks??project.settings.hideTracks))),locked:layers.some(layer=>layer.locked)};
}
export function canSetCDLabelSection(project,source){return sources.has(source)&&!cdLabelSectionState(project,source).locked}
export function ensureCDLabelProduction(project){
 let layer=members(project,'production')[0];if(layer)return layer;
 layer=makeCDProductionLayer(project);project.surfaces.cdLabel.push(layer);return layer;
}
export function setCDLabelSection(project,source,visible){
 if(typeof visible!=='boolean'||!canSetCDLabelSection(project,source))return false;
 let layers=members(project,source);
 if(!layers.length){
  if(!visible)return false;
  if(source==='production')layers=[ensureCDLabelProduction(project)];
  else{
   const defaults={...project,surfaces:{}};resetCDSurfaces(defaults,'cd-label',{preserveReference:true});
   const layer=defaults.surfaces.cdLabel.find(layer=>layer.source===source);if(!layer)return false;project.surfaces.cdLabel.push(layer);layers=[layer];
  }
 }
 for(const layer of layers){
  layer.visible=visible;
  if(source==='cdTracks'&&visible){layer.trackOptions={...layer.trackOptions,hideTracks:false};delete layer.hideA;delete layer.hideB}
 }
 return true;
}
export function cdLabelSectionControl(project,source,label){
 const state=cdLabelSectionState(project,source);
 return `<label class="inlinecheck"><input type="checkbox" data-cd-section="${source}" ${state.visible?'checked':''} ${state.locked?'disabled':''}>Показывать ${label}</label><p class="hint" data-cd-section-lock="${source}" ${state.locked?'':'hidden'}>Блок закреплён. Снимите закрепление в «Слоях».</p>`;
}
