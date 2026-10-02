import {clone,uid,dimensions} from './model.js';
import {referenceFont,referenceCenterX,REFERENCE_UNIT} from './reference-format.js';
import {referenceFlowCopy} from './reference-flow.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function parseReferenceBlocks(raw){
 if(!raw||raw.startsWith('~'))return [];
 const seen=new Set();return String(raw).slice(0,30000).split('|').slice(0,80).map(part=>{
  const [tag,x,y,scale,rotation,w,hidden,locked,aspect,style]=part.split('_');
  const match=/^b([A-Za-z0-9]+-[A-Za-z0-9]+)(?:\*(\d+))?$/.exec(tag||'');
  if(!match||seen.has(tag))return null;seen.add(tag);
  const number=(raw,fallback,min,max)=>Number.isFinite(parseFloat(raw))?clamp(parseFloat(raw),min,max):fallback;
  const [scope,key]=match[1].split('-');
  return {ref:match[1],scope,key,copy:Number(match[2])||1,x:number(x,50,-300,400),y:number(y,50,-300,400),scale:number(scale,100,10,400),rotation:number(rotation,0,-180,180),w:number(w,100,1,200),hidden:hidden==='1',locked:locked==='1',style:style||''};
 }).filter(Boolean);
}
export function referenceBlockStyle(bundle,pixelUnit){
 if(!bundle)return {};const f=bundle.split('.'),out={};
 const font=referenceFont(`${f[0]}.2s.${f[1]||7}.${f[2]||'2s'}.${parseInt(f[3]||0,36)}.${f[4]||0}`,1,pixelUnit);
 if(f[0])out.font=font.font;if(f[1])Object.assign(out,{fontWeight:font.fontWeight,bold:font.bold});
 if(f[2])out.fontStretch=font.fontStretch;
 for(const key of ['italic','smallcaps','uppercase','shadow','outline'])if(font[key])out[key]=font[key];
 if(f[4])out.spacing=clamp(Number(f[4])/10,-20,50)*pixelUnit;
 if(f[5])out.lineHeight=clamp(Number(f[5])/100,.5,4);
 if(/^[a-f0-9]{3}$/i.test(f[6]||''))out.color='#'+[...f[6]].map(c=>c+c).join('');
 else if(/^[a-f0-9]{6,8}$/i.test(f[6]||'')){out.color='#'+f[6].slice(0,6);if(f[6].length===8)out.opacity=parseInt(f[6].slice(6),16)/255}
 if({l:1,c:1,r:1}[f[7]])out.align={l:'left',c:'center',r:'right'}[f[7]];
 return out;
}
function matches(layer,key,project){
 const source={artist:'artist',album:'album',spineText:'spine',spineLogo:'referenceSpineLogo',logo:'referenceLogo',flapTracks:'flapTracks',flapProd:'production',stereo:'stereo',side:'side',production:'production',tracklist:'tracks'}[key];
 if(/^inside\d+$/.test(key))return layer.source==='referenceContents'&&Math.floor((layer.insideIndex??layer.flowIndex)/project.layout.columns)+1===Number(key.slice(6));
 return source&&layer.source===source;
}
export function applyReferenceBlocks(project,params,mode='jcard',{pending=false}={}){
 const entries=parseReferenceBlocks(params.get('bx')),previous=pending?project.referenceFreePlace:null,appliedKeys=new Set(previous?.appliedKeys||[]),baselines=new Map();let applied=previous?.applied||0;const unsupported=[];
 for(const entry of entries){const surface=mode==='label'?({A:'labelA',B:'labelB'}[entry.scope]):({default:'outer',sideB:'inner'}[entry.scope]);if(surface&&!baselines.has(surface+'|'+entry.ref))baselines.set(surface+'|'+entry.ref,project.surfaces[surface].filter(l=>!l.referenceBlockCopy&&matches(l,entry.key,project)).map(l=>clone(l)))}
 for(const entry of entries){
  const identity=entry.ref+'*'+entry.copy;if(appliedKeys.has(identity))continue;
  const surface=mode==='label'?({A:'labelA',B:'labelB'}[entry.scope]):({default:'outer',sideB:'inner'}[entry.scope]);
  if(!surface){unsupported.push(entry.ref);continue}
  const layers=project.surfaces[surface],original=baselines.get(surface+'|'+entry.ref)||[];
  if(!original.length){unsupported.push(entry.ref);continue}
  const targets=entry.copy>1?original.map(l=>({...referenceFlowCopy(l),id:uid(),name:l.name+' · копия '+entry.copy,referenceBlockCopy:entry.copy})):original.map(l=>layers.find(t=>t.id===l.id));
  const W=dimensions(project,surface).w,H=dimensions(project,surface).h,baseWidth=mode==='label'?W:406.4,scale=entry.scale/100;
  const points=original.flatMap(l=>{const r=l.rotation*Math.PI/180;return [[0,0],[l.w,0],[0,l.h],[l.w,l.h]].map(([x,y])=>[l.x+x*Math.cos(r)-y*Math.sin(r),l.y+x*Math.sin(r)+y*Math.cos(r)])});
  const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));
  const width=baseWidth*entry.w/100*scale,factor=width/Math.max(.1,right-left),verticalScale=original.every(l=>l.type==='image')?factor:scale,height=(bottom-top)*verticalScale,angle=entry.rotation*Math.PI/180;
  const cx=mode==='label'?W*entry.x/100:referenceCenterX(project,entry.x),cy=H*entry.y/100;
  const baseX=cx-width/2*Math.cos(angle)+height/2*Math.sin(angle),baseY=cy-width/2*Math.sin(angle)-height/2*Math.cos(angle);
  for(let i=0;i<targets.length;i++){
   const layer=targets[i],originalLayer=original[i],dx=(originalLayer.x-left)*factor,dy=(originalLayer.y-top)*verticalScale,r=originalLayer.rotation*Math.PI/180,vx=originalLayer.w*Math.cos(r)*factor,vy=originalLayer.w*Math.sin(r)*verticalScale,hx=-originalLayer.h*Math.sin(r)*factor,hy=originalLayer.h*Math.cos(r)*verticalScale;
   Object.assign(layer,{x:baseX+dx*Math.cos(angle)-dy*Math.sin(angle),y:baseY+dx*Math.sin(angle)+dy*Math.cos(angle),w:Math.hypot(vx,vy),h:Math.hypot(hx,hy),size:originalLayer.size*scale,rotation:Math.atan2(vy,vx)*180/Math.PI+entry.rotation,visible:originalLayer.visible&&!entry.hidden,locked:entry.locked,referenceBlock:entry.ref},referenceBlockStyle(entry.style,mode==='label'?25.4/72:REFERENCE_UNIT));
  }
  if(entry.copy>1)layers.push(...targets);applied++;appliedKeys.add(identity);
 }
 project.referenceFreePlace={applied,unsupported,appliedKeys:[...appliedKeys],suspended:String(params.get('bx')||'').startsWith('~')};
 return {applied,unsupported};
}
