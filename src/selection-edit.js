import {groupFor,frameFor,captureGroup,applyFrame,patchGroup,copyGroup} from './flow-editing.js';
import {markReferenceGeometry,referenceFlowCopy} from './reference-flow.js';
import {clone,uid} from './model.js';
import {rotateLayer} from './transforms.js';
import {flowText} from './render.js';

export function selectionGroup(project,layer,surface,joined=true){return joined?groupFor(project,layer,surface):null}
export function selectionFrame(project,layer,surface,joined=true){return frameFor(selectionGroup(project,layer,surface,joined))||layer}
export function selectionMembers(project,layer,surface,joined=true){return selectionGroup(project,layer,surface,joined)?.layers||[layer].filter(Boolean)}
export function captureSelection(project,layer,surface,joined=true){
 const group=selectionGroup(project,layer,surface,joined);
 return group?{group:captureGroup(group),initial:frameFor(group)}:{layer,initial:clone(layer)};
}
export function applySelectionFrame(snapshot,patch){
 if(snapshot?.group)return applyFrame(snapshot.group,patch);
 if(!snapshot?.layer||snapshot.layer.locked)return false;
 if(Object.entries(patch).some(([key,value])=>snapshot.layer[key]!==value))markReferenceGeometry(snapshot.layer);
 Object.assign(snapshot.layer,patch);return true;
}
export function setSelectionProperty(project,layer,surface,key,value,joined=true){
 const group=selectionGroup(project,layer,surface,joined),frame=frameFor(group)||layer;
 if(!frame||frame.locked&&key!=='locked')return false;
 if(['x','y','w','h','rotation'].includes(key)){
  return applySelectionFrame(captureSelection(project,layer,surface,joined),key==='rotation'?rotateLayer(frame,value):{[key]:value});
 }
 const patch={[key]:value};
 if(key==='bold')patch.fontWeight=value?700:400;
 if(key==='color')patch.referenceOwnColor=true;
 // Content conversion and a column's name are individual properties.
 if(group&&!['name','source','text'].includes(key)){if(!patchGroup(group,patch))return false}
 else Object.assign(layer,patch);
 if(key==='color')for(const peer of selectionMembers(project,layer,surface,joined)){
  peer.referenceColorInherited=false;
  if(peer.referenceHiddenByTextColor){peer.visible=true;delete peer.referenceHiddenByTextColor}
 }
 return true;
}
export function duplicateSelection(project,layer,surface,{joined=true,dx=3,dy=3}={}){
 const group=selectionGroup(project,layer,surface,joined);
 if(group)return copyGroup(group,{dx,dy});
 if(!layer)return [];
 const copy={...referenceFlowCopy(layer,surface),id:uid(),name:layer.name+' копия',x:layer.x+dx,y:layer.y+dy};
 if(layer.source==='cdTracks'&&surface.startsWith('cdTray')&&(layer.cdTrayTrackFlow||layer.cdTemplate)||layer.source==='cdContents'&&(layer.cdContentFlow||layer.referenceCDContent)){
  // A copied column keeps its visible text independently of the album flow.
  // Structural changes must never consume or move this manual copy.
  copy.text=flowText(project,layer,surface).text;
  for(const key of ['source','cdTemplate','cdTrayTrackFlow','cdContentFlow','referenceCDContent','cdPanelIndex','cdColumnIndex','cdContentIndex','referenceCDContentFrame'])delete copy[key];
 }
 delete copy.referenceFlowEditGroup;
 if(copy.source==='referenceContents')delete copy.referenceBlockCopy;
 // A user-created copy is a manual logo choice. Its bytes and styling stay
 // intact, but later albums and automatic palette changes must not manage it.
 for(const key of Object.keys(copy))if(key.startsWith('automaticRecordLabelLogo')||key.startsWith('recordLabelLogo'))delete copy[key];
 return [copy];
}
