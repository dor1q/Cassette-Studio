import {dimensions,panelRects} from './model.js';
import {cassetteCutPath} from './cassette-template.js';
import {isCDSurface} from './media-formats.js';
import {cdCutPath} from './cd-layout.js';
import {WILD_REMIX_KIT,remixPart} from './overlay-remix-kit.js';

export const REMIX_RENDER_VERSION=1,REMIX_MAX_SIDE=4096,REMIX_MAX_PIXELS=12_000_000;
const DPI=600,rounded=n=>Math.round(n*1e6)/1e6;
export function remixSeed(value=1){const n=Number(value);return Number.isFinite(n)?Math.trunc(n)>>>0:1}
export function remixHash(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0')}
export function remixGeometry(project,surface='outer'){
 if(!['outer','inner','labelA','labelB'].includes(surface)&&!isCDSurface(surface))throw Error('Неизвестная сторона Remix');
 const d=dimensions(project,surface);
 if(!Number.isFinite(d.w)||!Number.isFinite(d.h)||d.w<=0||d.h<=0||d.w>1200||d.h>500)throw Error('Некорректный размер макета Remix');
 const label=surface.startsWith('label');
 const folds=label?[]:panelRects(project,surface).slice(1).map(panel=>[panel.x,0,panel.x,d.h]);
 const outline=isCDSurface(surface)?cdCutPath(project,surface):label?cassetteCutPath(project.layout):`M0 0H${d.w}V${d.h}H0Z`;
 const result={width:d.w,height:d.h,folds,outline,unit:'mm'};
 result.signature=remixHash(JSON.stringify(result));return result;
}
export function remixRectangle(ratio=1.65){
 const n=Number(ratio);if(!Number.isFinite(n)||n<=0||n<.05||n>20)throw Error('Некорректные пропорции Remix');
 const width=104*Math.min(1,n),height=width/n,result={width,height,folds:[],outline:`M0 0H${width}V${height}H0Z`,unit:'mm'};
 result.signature=remixHash(JSON.stringify(result));return result;
}
function random(seed){let state=remixSeed(seed)||0x6d2b79f5;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}}
export function planRemix(geometry,seed=1,{availability=WILD_REMIX_KIT.parts.map(part=>part.id),maxSide=REMIX_MAX_SIDE}={}){
 if(!geometry||!Number.isFinite(geometry.width)||!Number.isFinite(geometry.height)||geometry.width<=0||geometry.height<=0||geometry.width>1200||geometry.height>500||typeof geometry.outline!=='string'||geometry.outline.length>100000||!Array.isArray(geometry.folds)||geometry.folds.length>30||geometry.folds.some(line=>!Array.isArray(line)||line.length!==4||line.some(n=>!Number.isFinite(n))))throw Error('Некорректная геометрия Remix');
 const names=[...new Set(availability)].filter(id=>remixPart(id)).sort();if(!names.length)throw Error('Нет частей для Remix');
 const rand=random(seed),between=(a,b)=>a+(b-a)*rand(),pick=prefix=>{const ids=names.filter(id=>id.startsWith(prefix));return ids.length?ids[Math.floor(rand()*ids.length)]:null};
 const logicalWidth=geometry.width*DPI/25.4,logicalHeight=geometry.height*DPI/25.4;
 const cap=Math.min(REMIX_MAX_SIDE,Math.max(256,Number(maxSide)||REMIX_MAX_SIDE)),scale=Math.min(1,cap/Math.max(logicalWidth,logicalHeight),Math.sqrt(REMIX_MAX_PIXELS/(logicalWidth*logicalHeight)));
 const width=Math.max(1,Math.round(logicalWidth*scale)),height=Math.max(1,Math.round(logicalHeight*scale));
 const ops=[],once=new Set(),folds=geometry.folds.map(line=>line.map(n=>n*DPI/25.4));
 const stamp=(kind,id,x,y,w,h,extra={})=>{
  if(!id||ops.length>=256)return;
  const part=remixPart(id);if(WILD_REMIX_KIT.once.includes(id)){if(once.has(id))return;once.add(id)}
  ops.push({kind,id,x:rounded(x),y:rounded(y),w:rounded(w),h:rounded(h),source:{x:0,y:0,w:part.width,h:part.height},rotation:0,flipX:false,flipY:false,alpha:1,featherX:0,featherY:0,...extra});
 };
 // Place independent real edge strips around every physical outside edge.
 const edges=[[0,0,logicalWidth,0],[logicalWidth,0,logicalWidth,logicalHeight],[logicalWidth,logicalHeight,0,logicalHeight],[0,logicalHeight,0,0]];
 for(const [x1,y1,x2,y2]of edges){
  const length=Math.hypot(x2-x1,y2-y1),angle=Math.atan2(y2-y1,x2-x1),dx=(x2-x1)/length,dy=(y2-y1)/length;
  for(let start=0;start<length;){
   const id=pick('edge-');if(!id)break;const part=remixPart(id),piece=Math.min(length-start,between(650,1400),part.width),thickness=part.height;
   const mid=start+piece/2;
   stamp('edge',id,x1+dx*mid-dy*thickness/2,y1+dy*mid+dx*thickness/2,piece,thickness,{rotation:angle,flipX:rand()<.5,flipY:true,featherX:Math.min(75,piece/4),featherY:35,source:{x:between(0,part.width-piece),y:0,w:piece,h:thickness}});
   start+=Math.max(1,piece-Math.min(50,piece*.1));if(length-start<1)break;
  }
 }
 // Creases follow the current surface's actual folds, including mirrored panels.
 for(const [x1,y1,x2,y2]of folds){
  const vertical=Math.abs(y2-y1)>=Math.abs(x2-x1),id=pick(vertical?'crease-v-':'crease-h-');if(!id)continue;
  const part=remixPart(id),length=Math.hypot(x2-x1,y2-y1),thickness=vertical?part.width:part.height;
  stamp('fold',id,(x1+x2)/2,(y1+y2)/2,vertical?thickness:length,vertical?length:thickness,{rotation:Math.atan2(y2-y1,x2-x1)-(vertical?Math.PI/2:0),flipX:rand()<.5,flipY:rand()<.5,alpha:between(.85,1),featherX:vertical?35:100,featherY:vertical?100:35});
  const branches=Math.min(6,Math.max(1,Math.round(length/850)));
  for(let i=0;i<branches;i++){
   const id=pick('branch-');if(!id)break;const part=remixPart(id),t=between(.1,.9),sign=rand()<.5?-1:1,size=between(.75,1.15),w=part.width*size,h=part.height*size;
   const x=x1+(x2-x1)*t+(vertical?sign*w/2:0),y=y1+(y2-y1)*t+(vertical?0:sign*w/2);
   if(x-w/2<0||x+w/2>logicalWidth||y-h/2<0||y+h/2>logicalHeight)continue;
   stamp('branch',id,x,y,w,h,{rotation:vertical?(sign===1?0:Math.PI):(sign===1?Math.PI/2:-Math.PI/2),flipY:rand()<.5,alpha:between(.8,1),featherX:12,featherY:12,fold:[x1,y1,x2,y2]});
  }
 }
 const area=geometry.width*geometry.height/(25.4*25.4),scuffs=Math.min(45,Math.max(2,Math.round(area*between(.35,.55))));
 for(let i=0;i<scuffs;i++){
  const id=pick('scuff-');if(!id)break;const part=remixPart(id),size=between(.55,1.25),nearFold=folds.length&&rand()<.35,fold=nearFold?folds[Math.floor(rand()*folds.length)]:null;
  const x=fold?Math.max(0,Math.min(logicalWidth,fold[0]+between(-280,280))):between(0,logicalWidth),y=between(0,logicalHeight);
  stamp('scuff',id,x,y,part.width*size,part.height*size,{rotation:between(-Math.PI,Math.PI),flipX:rand()<.5,flipY:rand()<.5,alpha:between(.45,.95),featherX:35,featherY:35});
 }
 const boundaries=[0,...folds.filter(f=>f[0]===f[2]).map(f=>f[0]),logicalWidth].sort((a,b)=>a-b);
 const scratchIds=names.filter(id=>id.startsWith('scratch-')),pool=[...scratchIds];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 for(let i=0;i<boundaries.length-1;i++){
  const left=boundaries[i],span=boundaries[i+1]-left;if(span<600)continue;
  const id=pool.length?pool.shift():pick('scratch-');if(!id)continue;const part=remixPart(id),size=Math.min(between(.6,1.05),span*.75/Math.max(part.width,part.height));
  stamp('scratch',id,left+span*between(.25,.75),logicalHeight*between(.25,.75),part.width*size,part.height*size,{rotation:between(-Math.PI,Math.PI),flipX:rand()<.5,flipY:rand()<.5,alpha:between(.8,1),featherX:15,featherY:15});
 }
 const usedParts=[...new Set([...ops.map(op=>op.id),...(names.includes('grain')?['grain']:[])])].sort();
 const plan={version:REMIX_RENDER_VERSION,seed:remixSeed(seed),geometry,width,height,logicalWidth,logicalHeight,scale,maxSide:cap,availability:names,grain:names.includes('grain')?'grain':null,grainAlpha:.24,ops,usedParts};
 plan.signature='remix-'+remixHash(JSON.stringify(plan));return plan;
}
