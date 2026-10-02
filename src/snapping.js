export function snapMove(layer,x,y,{w,h},panels=[],others=[],tolerance=1){
 const xs=[0,w/2,w],ys=[0,h/2,h];
 for(const p of panels)xs.push(p.x,p.x+p.w/2,p.x+p.w);
 for(const o of others)if(o.visible&&o.id!==layer.id&&!o.rotation){xs.push(o.x,o.x+o.w/2,o.x+o.w);ys.push(o.y,o.y+o.h/2,o.y+o.h)}
 const closest=(value,extent,targets)=>{let delta=tolerance+1;for(const own of [0,extent/2,extent])for(const target of targets){const d=target-value-own;if(Math.abs(d)<Math.abs(delta))delta=d}return Math.abs(delta)<=tolerance?value+delta:value};
 return layer.rotation?{x:Math.round(x),y:Math.round(y)}:{x:closest(x,layer.w,xs),y:closest(y,layer.h,ys)};
}
