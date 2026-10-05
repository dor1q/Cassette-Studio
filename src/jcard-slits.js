import {dimensions} from './model.js';
const unit=25.4/600;
export function jcardSlitPaths(project,surface){
 const layout=project.layout;if(!layout.backSlits||layout.flapShape!=='extended'||!['outer','inner'].includes(surface))return [];
 const mirrored=surface==='inner',W=dimensions(project,surface).w,flap=layout.flap;
 const cx=(mirrored?W-flap:0)+flap*(mirrored?.5504:.4496);
 return [.2971,.7171].map(y=>{
  const cy=layout.height*y;
  const vertices=[[-17.5,-86,12],[17.5,-86,12],[17.5,-17.5,14],[136,-17.5,12],[136,17.5,12],[17.5,17.5,14],[17.5,86,12],[-17.5,86,12],[-17.5,17.5,14],[-136,17.5,12],[-136,-17.5,12],[-17.5,-17.5,14]];
  const corners=vertices.map(([x,y,r],i)=>{
   const previous=vertices[(i+vertices.length-1)%vertices.length],next=vertices[(i+1)%vertices.length];
   const point=(p)=>{const distance=Math.hypot(p[0]-x,p[1]-y);return [cx+(x+(p[0]-x)*r/distance)*unit,cy+(y+(p[1]-y)*r/distance)*unit]};
   return {start:point(previous),end:point(next),radius:r*unit,sweep:(x-previous[0])*(next[1]-y)-(y-previous[1])*(next[0]-x)>0?1:0};
  });
  const point=p=>p.map(n=>n.toFixed(5)).join(' ');
  return 'M'+point(corners[0].start)+corners.map((c,i)=>` A${c.radius.toFixed(5)} ${c.radius.toFixed(5)} 0 0 ${c.sweep} ${point(c.end)} L${point(corners[(i+1)%corners.length].start)}`).join('')+' Z';
 });
}
