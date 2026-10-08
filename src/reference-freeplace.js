import {clone,uid,dimensions} from './model.js';
import {referenceFont,referenceCenterX,REFERENCE_UNIT,referencePixelUnit} from './reference-format.js';
import {isCDMode} from './media-formats.js';
import {referenceFlowCopy} from './reference-flow.js';
import {flowText} from './render.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const MAX_BUNDLE=30000,MAX_BLOCKS=80,validRef=ref=>typeof ref==='string'&&/^[a-z0-9]+-[a-z0-9]+$/i.test(ref)&&ref.length<=200;
const validToken=token=>typeof token==='string'&&/^[a-z0-9-]{1,100}$/i.test(token);
const projectLayers=project=>[...Object.values(project.surfaces||{}).flat(),...(Array.isArray(project.referenceFlowArchive)?project.referenceFlowArchive.slice(0,32):[])];
const blockSurface=(entry,mode)=>mode==='cd-label'?undefined:mode==='cd-insert'?({default:'cdFront',inside:'cdInside',sideB:'cdInside'}[entry.scope]):mode==='cd-tray'?({default:'cdTray',inside:'cdTrayInside',sideB:'cdTrayInside'}[entry.scope]):mode==='label'?({A:'labelA',B:'labelB'}[entry.scope]):({default:'outer',sideB:'inner'}[entry.scope]);
export function parseReferenceBlocks(raw,{includeSuspended=false}={}){
 if(typeof raw!=='string'||!raw||raw.startsWith('~')&&!includeSuspended)return [];
 const seen=new Set();return raw.slice(0,MAX_BUNDLE).split('|').filter(part=>part!=='~').slice(0,MAX_BLOCKS).map(part=>{
  const [tag,x,y,scale,rotation,w,hidden,locked,aspect,style]=part.split('_');
  const match=/^b([A-Za-z0-9]+-[A-Za-z0-9]+)(?:\*(\d+))?$/.exec(tag||'');
  if(!match||!validRef(match[1]))return null;
  const parsedCopy=Number(match[2]),copy=Number.isInteger(parsedCopy)&&parsedCopy>=2?parsedCopy:1,identity=match[1]+'*'+copy;
  if(seen.has(identity))return null;seen.add(identity);
  const number=(raw,fallback,min,max)=>Number.isFinite(parseFloat(raw))?clamp(parseFloat(raw),min,max):fallback;
  const [scope,key]=match[1].split('-');
  return {ref:match[1],scope,key,copy,x:number(x,50,-300,400),y:number(y,50,-300,400),scale:number(scale,100,10,400),rotation:number(rotation,0,-180,180),w:number(w,100,1,200),hidden:hidden==='1',locked:locked==='1',style:style||''};
 }).filter(Boolean);
}
export function referenceBlockStyle(bundle,pixelUnit){
 if(!bundle)return {};const f=bundle.split('.'),out={};
 const font=referenceFont(`${f[0]}.2s.${f[1]||7}.${f[2]||'2s'}.${parseInt(f[3]||0,36)}.${f[4]||0}`,1,pixelUnit);
 if(f[0])out.font=font.font;if(/^\d+$/.test(f[1]||'')&&Number.isFinite(Number(f[1])))Object.assign(out,{fontWeight:font.fontWeight,bold:font.bold});
 if(/^[0-9a-z]+$/i.test(f[2]||'')&&Number.isFinite(parseInt(f[2],36)))out.fontStretch=font.fontStretch;
 for(const key of ['italic','smallcaps','uppercase','shadow','outline'])if(font[key])out[key]=font[key];
 if(/^-?\d+$/.test(f[4]||'')&&Number.isFinite(Number(f[4]))&&Number(f[4])!==0)out.spacing=clamp(Number(f[4])/10,-20,50)*pixelUnit;
 if(/^\d+$/.test(f[5]||'')&&Number.isFinite(Number(f[5])))out.lineHeight=clamp(Number(f[5])/100,.5,4);
 if(/^[a-f0-9]{3}$/i.test(f[6]||''))out.color='#'+[...f[6]].map(c=>c+c).join('');
 else if(/^(?:[a-f0-9]{6}|[a-f0-9]{8})$/i.test(f[6]||'')){out.color='#'+f[6].slice(0,6);if(f[6].length===8)out.opacity=parseInt(f[6].slice(6),16)/255}
 if({l:1,c:1,r:1}[f[7]])out.align={l:'left',c:'center',r:'right'}[f[7]];
 return out;
}
function matches(layer,key,project){
 if(layer.referenceBlockKey===key)return true;
 if(isCDMode(project.editorMode)&&key==='tracklist')return layer.source==='cdTracks'||layer.source==='cdContents';
 if(isCDMode(project.editorMode)&&/^inside\d+$/.test(key))return layer.referenceCDContent&&layer.cdContentIndex===Number(key.slice(6))-1;
 const source={artist:'artist',album:'album',spineText:'spine',spineLogo:'referenceSpineLogo',logo:'referenceLogo',flapTracks:'flapTracks',flapProd:'flapProduction',stereo:'stereo',side:'side',production:'production',tracklist:'tracks'}[key];
 if(/^inside\d+$/.test(key))return layer.source==='referenceContents'&&Math.floor((layer.insideIndex??layer.flowIndex)/project.layout.columns)+1===Number(key.slice(6));
 return source&&layer.source===source;
}
export function sanitizeReferenceFreePlace(project){
 const state=project.referenceFreePlace;if(!state||typeof state!=='object'||Array.isArray(state)){delete project.referenceFreePlace;for(const layer of projectLayers(project)){delete layer.referenceSuspendedBlock;delete layer.referenceFreePlaceToken}return project}
 const raw=typeof state.raw==='string'?state.raw.slice(0,MAX_BUNDLE):'',entries=parseReferenceBlocks(raw,{includeSuspended:true}),refs=new Set(entries.map(entry=>entry.ref)),identities=new Set(entries.map(entry=>entry.ref+'*'+entry.copy));
 const appliedKeys=Array.isArray(state.appliedKeys)?[...new Set(state.appliedKeys.filter(key=>typeof key==='string'&&key.length<=220&&/^[a-z0-9]+-[a-z0-9]+\*\d+$/i.test(key)&&(!raw||identities.has(key))))].slice(0,MAX_BLOCKS):[];
 project.referenceFreePlace={raw,mode:isCDMode(state.mode)?state.mode:state.mode==='label'?'label':'jcard',token:validToken(state.token)?state.token:'',applied:appliedKeys.length,appliedKeys,unsupported:Array.isArray(state.unsupported)?[...new Set(state.unsupported.filter(validRef))].slice(0,MAX_BLOCKS):[],suspended:raw.startsWith('~')&&entries.length>0};
 for(const layer of projectLayers(project))if(!project.referenceFreePlace.suspended||!project.referenceFreePlace.token||layer.referenceFreePlaceToken!==project.referenceFreePlace.token||!refs.has(layer.referenceSuspendedBlock)){delete layer.referenceSuspendedBlock;delete layer.referenceFreePlaceToken}
 return project;
}
export function hasSuspendedReferenceBlocks(project){return !!(project.referenceFreePlace?.suspended&&parseReferenceBlocks(project.referenceFreePlace.raw,{includeSuspended:true}).length)}
export function resumeReferenceFreePlace(project){
 sanitizeReferenceFreePlace(project);const state=project.referenceFreePlace;
 if(!hasSuspendedReferenceBlocks(project))return {applied:state?.applied||0,unsupported:state?.unsupported||[],resumed:false};
 // A suspended bundle stores layout data; it is not permission to transform a later replacement image.
 const params=new URLSearchParams({bx:state.raw.split('|').filter((part,index)=>index!==0||!part.startsWith('~')).join('|')});
 const result=applyReferenceBlocks(project,params,state.mode,{pending:true,resuming:true});
 for(const layer of projectLayers(project)){delete layer.referenceSuspendedBlock;delete layer.referenceFreePlaceToken}
 return {...result,resumed:true};
}
export function applyReferenceBlocks(project,params,mode='jcard',{pending=false,resuming=false}={}){
 const raw=String(params.get('bx')||'').slice(0,MAX_BUNDLE),storedEntries=parseReferenceBlocks(raw,{includeSuspended:true}),suspended=raw.startsWith('~'),previous=pending&&project.referenceFreePlace?.mode===mode&&(resuming||project.referenceFreePlace.raw===raw)?project.referenceFreePlace:null;
 const entries=suspended?[]:storedEntries,appliedKeys=new Set(previous?.appliedKeys||[]),baselines=new Map(),token=previous?.token||uid();let applied=previous?.applied||0;const unsupported=[];
 if(suspended)for(const entry of storedEntries){const surface=blockSurface(entry,mode);for(const layer of project.surfaces[surface]||[])if(!layer.referenceBlockCopy&&matches(layer,entry.key,project)){layer.referenceSuspendedBlock=entry.ref;layer.referenceFreePlaceToken=token}}
 for(const entry of entries){const surface=blockSurface(entry,mode);if(surface&&!baselines.has(surface+'|'+entry.ref))baselines.set(surface+'|'+entry.ref,(project.surfaces[surface]||[]).filter(l=>!l.referenceBlockCopy&&matches(l,entry.key,project)&&(!resuming||l.referenceSuspendedBlock===entry.ref&&l.referenceFreePlaceToken===token)).map(l=>clone(l)))}
 for(const entry of entries){
  const identity=entry.ref+'*'+entry.copy;if(appliedKeys.has(identity))continue;
  const surface=blockSurface(entry,mode);
  if(!surface){unsupported.push(entry.ref);continue}
  const layers=project.surfaces[surface],original=baselines.get(surface+'|'+entry.ref)||[];
  if(!original.length){unsupported.push(entry.ref);continue}
  const targets=entry.copy>1?original.map(l=>({...referenceFlowCopy(l),id:uid(),name:l.name+' · копия '+entry.copy,referenceBlockCopy:entry.copy})):original.map(l=>layers.find(t=>t.id===l.id));
  if(entry.copy>1&&isCDMode(mode))for(const [index,copy]of targets.entries()){
   delete copy.cdTemplate;delete copy.referenceCDStandard;
   const source=original[index];
   if(source.source==='cdTracks'&&(source.cdTemplate||source.cdTrayTrackFlow)||source.source==='cdContents'&&(source.referenceCDContent||source.cdContentFlow)){
    copy.text=flowText(project,source,surface).text;
    for(const key of ['source','cdTemplate','cdTrayTrackFlow','referenceCDTrayTrack','referenceCDTrayTrackFrame','cdContentFlow','referenceCDContent','cdPanelIndex','cdColumnIndex','cdContentIndex','referenceCDContentFrame'])delete copy[key];
   }
  }
  const W=dimensions(project,surface).w,H=dimensions(project,surface).h,baseWidth=mode==='label'||mode==='cd-tray'?W:mode==='cd-insert'?8476*REFERENCE_UNIT:406.4,scale=entry.scale/100;
  const points=original.flatMap(l=>{const r=l.rotation*Math.PI/180;return [[0,0],[l.w,0],[0,l.h],[l.w,l.h]].map(([x,y])=>[l.x+x*Math.cos(r)-y*Math.sin(r),l.y+x*Math.sin(r)+y*Math.cos(r)])});
  const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));
  const width=baseWidth*entry.w/100*scale,factor=width/Math.max(.1,right-left),verticalScale=original.every(l=>l.type==='image')?factor:scale,height=(bottom-top)*verticalScale,angle=entry.rotation*Math.PI/180;
  const cdX=baseWidth*entry.x/100-(mode==='cd-insert'&&surface==='cdFront'?baseWidth-W:0),cx=isCDMode(mode)?mode==='cd-insert'?clamp(cdX,W*.02,W*.98):cdX:mode==='label'?W*entry.x/100:referenceCenterX(project,entry.x),cy=H*entry.y/100;
  const baseX=cx-width/2*Math.cos(angle)+height/2*Math.sin(angle),baseY=cy-width/2*Math.sin(angle)-height/2*Math.cos(angle);
  for(let i=0;i<targets.length;i++){
   const layer=targets[i],originalLayer=original[i],dx=(originalLayer.x-left)*factor,dy=(originalLayer.y-top)*verticalScale,r=originalLayer.rotation*Math.PI/180,vx=originalLayer.w*Math.cos(r)*factor,vy=originalLayer.w*Math.sin(r)*verticalScale,hx=-originalLayer.h*Math.sin(r)*factor,hy=originalLayer.h*Math.cos(r)*verticalScale;
   const style=referenceBlockStyle(entry.style,referencePixelUnit(mode));
   Object.assign(layer,{x:baseX+dx*Math.cos(angle)-dy*Math.sin(angle),y:baseY+dx*Math.sin(angle)+dy*Math.cos(angle),w:Math.hypot(vx,vy),h:Math.hypot(hx,hy),size:originalLayer.size*scale,rotation:Math.atan2(vy,vx)*180/Math.PI+entry.rotation,visible:originalLayer.visible&&!entry.hidden,locked:entry.locked,referenceBlock:entry.ref},style);
   if(style.color)layer.referenceOwnColor=true;
  }
  if(entry.copy>1)layers.push(...targets);applied++;appliedKeys.add(identity);
 }
 project.referenceFreePlace={raw,mode,token,applied,unsupported,appliedKeys:[...appliedKeys],suspended};
 return {applied,unsupported};
}
