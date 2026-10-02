export function layerCenter(layer){
 const a=layer.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return {x:layer.x+(layer.w*c-layer.h*s)/2,y:layer.y+(layer.w*s+layer.h*c)/2};
}

export function rotateLayer(layer,rotation){
 const center=layerCenter(layer),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return {x:center.x-(layer.w*c-layer.h*s)/2,y:center.y-(layer.w*s+layer.h*c)/2,rotation};
}

export function dragRotation(layer,start,position,free=false){
 const center=layerCenter(layer),angle=point=>Math.atan2(point.y-center.y,point.x-center.x)*180/Math.PI;
 let rotation=layer.rotation+angle(position)-angle(start);
 if(!free)rotation=Math.round(rotation/45)*45;
 return rotateLayer(layer,rotation);
}

export function dragResize(layer,start,position,keepAspect=false){
 const a=layer.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=position.x-start.x,dy=position.y-start.y;
 const w=layer.w+dx*c+dy*s,h=layer.h-dx*s+dy*c;
 if(!keepAspect)return {w:Math.max(2,w),h:Math.max(2,h)};
 const scale=Math.max(2/Math.min(layer.w,layer.h),(w*layer.w+h*layer.h)/(layer.w**2+layer.h**2));
 return {w:layer.w*scale,h:layer.h*scale};
}

export function dragCrop(layer,start,position,straight=false){
 const a=layer.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=position.x-start.x,dy=position.y-start.y;
 let x=dx*c+dy*s,y=-dx*s+dy*c;
 if(layer.flipX)x=-x;if(layer.flipY)y=-y;
 if(straight){if(Math.abs(x)>=Math.abs(y))y=0;else x=0}
 return {cropX:(layer.cropX||0)+x,cropY:(layer.cropY||0)+y};
}

export function imageLocalPoint(layer,point){
 const a=layer.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=point.x-layer.x,dy=point.y-layer.y;
 const x=dx*c+dy*s,y=-dx*s+dy*c;
 return {x:layer.flipX?layer.w-x:x,y:layer.flipY?layer.h-y:y};
}

export function zoomImageAt(layer,zoom,point){
 const before=Math.max(.1,Math.min(10,Number(layer.cropZoom)||1)),next=Number.isFinite(zoom)?Math.max(.1,Math.min(10,zoom)):before;
 const center={x:layer.w/2+(layer.cropX||0),y:layer.h/2+(layer.cropY||0)},anchor=point?imageLocalPoint(layer,point):center,ratio=next/before;
 return {cropZoom:next,cropX:Math.max(-1000,Math.min(1000,anchor.x+ratio*(center.x-anchor.x)-layer.w/2)),cropY:Math.max(-1000,Math.min(1000,anchor.y+ratio*(center.y-anchor.y)-layer.h/2))};
}

export function wheelImageZoom(zoom,delta,deltaMode=0,pageHeight=600){
 const pixels=delta*(deltaMode===1?16:deltaMode===2?pageHeight:1);
 return Math.max(.1,Math.min(10,(Number(zoom)||1)*Math.exp(-Math.max(-240,Math.min(240,pixels))*.0015)));
}
