import {clone,uid,panelRects} from './model.js';
import {referenceFlowCopy} from './reference-flow.js';

const GROUP_ID=/^[a-z0-9-]{1,100}$/i;
const geometryKeys=['x','y','w','h','rotation'];
const scaleKeys=['size','spacing','outline','shadow'];
const properties=new Set(['visible','locked','font','size','fontWeight','fontStretch','bold','italic','uppercase','smallcaps','align','lineHeight','spacing','opacity','outline','outlineColor','shadow','shadowColor','autoFit','color','referenceOwnColor','referenceHiddenByTextColor','hideArtist','hideAlbum','hideA','hideB','trackOptions']);
const trackKeys=new Set(['numbers','artists','durations','bullets','inlineTracks','showSide','hideTracks','showProduction','sideText','sideA','sideB']);
const radians=degrees=>degrees*Math.PI/180;
const rotate=(x,y,angle)=>({x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)});
const angle=degrees=>((degrees+180)%360+360)%360-180;
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function validSource(source){
 return source&&['outer','inner'].includes(source.surface)&&Number.isInteger(source.panel)&&source.panel>=(source.surface==='outer'?3:2)&&source.panel<8&&Number.isInteger(source.column)&&source.column>=0&&source.column<2;
}
function originalSource(project,layer,surface){
 if(!layer.referenceFlow||layer.source!=='referenceContents')return null;
 const exact={surface,panel:layer.referencePanelIndex,column:layer.referenceColumn};
 if(validSource(exact))return exact;
 const index=surface==='inner'?layer.insideIndex:layer.flowIndex,columns=project.layout.columns===2?2:1;
 const panels=panelRects(project,surface).filter(panel=>panel.index>=(surface==='inner'?2:3));
 const legacy={surface,panel:panels[Math.floor(index/columns)]?.index,column:index%columns};
 return Number.isInteger(index)&&index>=0&&validSource(legacy)?legacy:null;
}
function sourceFor(project,layer,surface){
 if(layer.referenceFlow)return originalSource(project,layer,surface);
 if(validSource(layer.referenceFlowCopySource))return layer.referenceFlowCopySource;
 if(layer.referenceFlowCopyIndex!==undefined)for(const side of ['outer','inner']){
  const original=project.surfaces[side]?.find(peer=>peer.referenceFlow&&peer.flowIndex===layer.referenceFlowCopyIndex);
  const source=original&&originalSource(project,original,side);if(source)return source;
 }
 return null;
}
function identity(layer,source){
 if(layer.referenceFlow)return 'original';
 if(GROUP_ID.test(layer.referenceFlowEditGroup||''))return 'copy:'+layer.referenceFlowEditGroup;
 if(Number.isInteger(layer.referenceBlockCopy)&&layer.referenceBlockCopy>=2&&typeof layer.referenceBlock==='string')return `block:${layer.referenceBlock}:${layer.referenceBlockCopy}`;
 // Independent duplicates of individual columns must stay independent.
 return null;
}

// The original insideN FreeBlock contains both columns. Our editable columns
// retain their separate flow slots, styles and manually placed rectangles.
export function groupFor(project,layer,surface){
 const active=project.surfaces?.[surface];
 if(!layer||layer.type!=='text'||layer.source!=='referenceContents'||!active?.includes(layer))return null;
 const source=sourceFor(project,layer,surface),kind=source&&identity(layer,source);if(!source||!kind)return null;
 const peers=active.filter(peer=>{
  if(peer.type!=='text'||peer.source!=='referenceContents')return false;
  const target=sourceFor(project,peer,surface);
  return target&&target.surface===source.surface&&target.panel===source.panel&&identity(peer,target)===kind;
 }).sort((a,b)=>sourceFor(project,a,surface).column-sourceFor(project,b,surface).column);
 if(peers.length<2||new Set(peers.map(peer=>sourceFor(project,peer,surface).column)).size!==peers.length)return null;
 return {layers:peers,leader:layer,sourceSlots:peers.map(peer=>({...sourceFor(project,peer,surface)})),surface,panel:source.panel,kind:layer.referenceFlow?'original':'copy',key:`${surface}:${source.surface}:${source.panel}:${kind}`};
}

export function frameFor(group){
 if(!group?.layers?.length)return null;
 const leader=group.leader||group.layers[0],rotation=leader.rotation||0,r=radians(rotation),points=[];
 for(const layer of group.layers){
  const a=radians(layer.rotation||0);
  for(const [x,y]of [[0,0],[layer.w,0],[0,layer.h],[layer.w,layer.h]]){
   const relative=rotate(x,y,a);points.push(rotate(layer.x+relative.x,layer.y+relative.y,-r));
  }
 }
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y)),origin=rotate(left,top,r);
 return {...leader,x:origin.x,y:origin.y,w:right-left,h:bottom-top,rotation,visible:group.layers.some(layer=>layer.visible!==false),locked:group.layers.some(layer=>!!layer.locked)};
}

export function captureGroup(group){
 if(!group?.layers?.length)return null;
 return {...group,frame:frameFor(group),originals:group.layers.map(layer=>clone(layer))};
}

export function applyFrame(snapshot,newFrame={}){
 if(!snapshot?.frame||!snapshot.originals||snapshot.layers.length!==snapshot.originals.length||snapshot.layers.some(layer=>layer.locked))return false;
 const frame=snapshot.frame;
 for(const key of geometryKeys)if(Object.hasOwn(newFrame,key)&&!finite(newFrame[key]))return false;
 if(!(frame.w>0&&frame.h>0))return false;
 const sx=Object.hasOwn(newFrame,'w')?newFrame.w/frame.w:null,sy=Object.hasOwn(newFrame,'h')?newFrame.h/frame.h:null;
 if(sx!==null&&sy!==null&&Math.abs(sx-sy)>Math.max(1,Math.abs(sx),Math.abs(sy))*1e-7)return false;
 const scale=sx??sy??1;if(!finite(scale)||scale<=0)return false;
 const x=newFrame.x??frame.x,y=newFrame.y??frame.y,rotation=newFrame.rotation??frame.rotation,delta=radians(rotation-frame.rotation);
 const changed=scale!==1||x!==frame.x||y!==frame.y||rotation!==frame.rotation;
 const patches=snapshot.originals.map(layer=>{
  const offset=rotate((layer.x-frame.x)*scale,(layer.y-frame.y)*scale,delta);
  const patch={x:x+offset.x,y:y+offset.y,w:layer.w*scale,h:layer.h*scale,rotation:angle((layer.rotation||0)+rotation-frame.rotation)};
  for(const key of scaleKeys)if(finite(layer[key]))patch[key]=layer[key]*scale;
  return patch;
 });
 if(patches.some(patch=>Object.values(patch).some(value=>!finite(value))||patch.w<.1||patch.h<.1))return false;
 for(let i=0;i<snapshot.layers.length;i++){Object.assign(snapshot.layers[i],patches[i]);if(changed)snapshot.layers[i].referenceManualGeometry=true}
 return true;
}

export function patchGroup(group,patch={}){
 if(!group?.layers?.length||!patch||typeof patch!=='object'||Array.isArray(patch))return false;
 const keys=Object.keys(patch);if(!keys.length||keys.some(key=>!properties.has(key)))return false;
 const unlocking=keys.length===1&&patch.locked===false;
 if(!unlocking&&group.layers.some(layer=>layer.locked))return false;
 if(Object.hasOwn(patch,'trackOptions')&&patch.trackOptions!==undefined&&(!patch.trackOptions||typeof patch.trackOptions!=='object'||Array.isArray(patch.trackOptions)||Object.keys(patch.trackOptions).some(key=>!trackKeys.has(key))))return false;
 for(const layer of group.layers){
  for(const key of keys){
   if(key==='trackOptions'){
    if(patch[key]===undefined)delete layer.trackOptions;
    else layer.trackOptions={...layer.trackOptions,...clone(patch[key])};
   }else if(patch[key]===undefined)delete layer[key];
   else layer[key]=clone(patch[key]);
  }
  if(Object.hasOwn(patch,'color')&&!Object.hasOwn(patch,'referenceOwnColor'))layer.referenceOwnColor=true;
 }
 return true;
}

export function copyGroup(group,{dx=3,dy=3}={}){
 if(!group?.layers?.length||!finite(dx)||!finite(dy))return [];
 const token=uid();
 return group.layers.map((layer,index)=>{
  const copy=referenceFlowCopy(layer,group.surface);
  if(!copy.referenceFlowCopySource&&validSource(group.sourceSlots?.[index]))copy.referenceFlowCopySource={...group.sourceSlots[index]};
  return {...copy,id:uid(),referenceFlowEditGroup:token,name:layer.name+' · копия',x:layer.x+dx,y:layer.y+dy};
 });
}
