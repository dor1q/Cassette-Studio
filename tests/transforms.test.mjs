import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLayer} from '../src/model.js';
import {layerCenter,rotateLayer,dragRotation,dragResize,dragCrop,imageLocalPoint,zoomImageAt,wheelImageZoom} from '../src/transforms.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('rotation keeps the layer center fixed for arbitrary starting angles',()=>{
 const layer=makeLayer('image',{x:24,y:17,w:53,h:70,rotation:30}),center=layerCenter(layer);
 for(const angle of [-90,0,45,135,360]){
  const next={...layer,...rotateLayer(layer,angle)},actual=layerCenter(next);
  near(actual.x,center.x);near(actual.y,center.y);assert.equal(next.w,layer.w);assert.equal(next.h,layer.h);
 }
});

test('rotation drag has no initial jump and snaps to 45 degrees unless free',()=>{
 const layer=makeLayer('shape',{x:0,y:0,w:20,h:20,rotation:0}),start={x:10,y:-5},angle=20*Math.PI/180,position={x:10+15*Math.sin(angle),y:10-15*Math.cos(angle)};
 near(dragRotation(layer,start,start,true).rotation,0);
 near(dragRotation(layer,start,position,true).rotation,20);
 assert.equal(dragRotation(layer,start,position).rotation,0);
 const other={x:10+15*Math.sin(Math.PI/6),y:10-15*Math.cos(Math.PI/6)};
 assert.equal(dragRotation(layer,start,other).rotation,45);
});

test('resizing rotated artwork keeps its ratio and anchor when requested',()=>{
 const layer=makeLayer('image',{x:10,y:20,w:40,h:20,rotation:90});
 const size=dragResize(layer,{x:0,y:0},{x:-10,y:20},true);
 near(size.w,60);near(size.h,30);
 const free=dragResize(layer,{x:0,y:0},{x:-3,y:20},false);
 near(free.w,60);near(free.h,23);
});

test('crop dragging uses frame coordinates and Shift constrains direction',()=>{
 const layer=makeLayer('image',{rotation:90,cropX:2,cropY:4});
 const crop=dragCrop(layer,{x:0,y:0},{x:3,y:8});near(crop.cropX,10);near(crop.cropY,1);
 const straight=dragCrop(layer,{x:0,y:0},{x:3,y:8},true);near(straight.cropX,10);near(straight.cropY,4);
 const mirrored=dragCrop({...layer,flipX:true,flipY:true},{x:0,y:0},{x:3,y:8});near(mirrored.cropX,-6);near(mirrored.cropY,7);
});

const imageToWorld=(layer,point)=>{
 const a=(layer.cropRotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=point.x-layer.w/2,dy=point.y-layer.h/2;
 let x=layer.w/2+(layer.cropX||0)+(dx*c-dy*s)*layer.cropZoom,y=layer.h/2+(layer.cropY||0)+(dx*s+dy*c)*layer.cropZoom;
 if(layer.flipX)x=layer.w-x;if(layer.flipY)y=layer.h-y;
 const r=layer.rotation*Math.PI/180;return {x:layer.x+x*Math.cos(r)-y*Math.sin(r),y:layer.y+x*Math.sin(r)+y*Math.cos(r)};
};

test('zoom keeps the image detail under the pointer stable for rotated and mirrored covers',()=>{
 for(const rotation of [0,30,90,-45])for(const flipX of [false,true])for(const flipY of [false,true]){
  const layer=makeLayer('image',{x:40,y:15,w:65,h:101,rotation,flipX,flipY,cropZoom:1.3,cropX:8,cropY:-3,cropRotation:20});
  const detail={x:28,y:38},pointer=imageToWorld(layer,detail),next={...layer,...zoomImageAt(layer,2.2,pointer)},actual=imageToWorld(next,detail);
  near(actual.x,pointer.x);near(actual.y,pointer.y);assert.equal(next.x,layer.x);assert.equal(next.y,layer.y);assert.equal(next.w,layer.w);assert.equal(next.h,layer.h);
 }
});

test('centered slider zoom retains image position and cannot exceed saved project limits',()=>{
 const layer=makeLayer('image',{cropZoom:1,cropX:12,cropY:-5});
 const next=zoomImageAt(layer,1.5);near(next.cropX,12);near(next.cropY,-5);near(next.cropZoom,1.5);
 assert.equal(zoomImageAt(layer,100).cropZoom,10);assert.equal(zoomImageAt(layer,-1).cropZoom,.1);assert.equal(zoomImageAt(layer,NaN).cropZoom,1);
 const rotated=makeLayer('image',{x:10,y:20,w:40,h:20,rotation:90,flipX:true});
 const local=imageLocalPoint(rotated,{x:5,y:50});near(local.x,10);near(local.y,5);
});

test('mouse and trackpad wheel deltas share consistent zoom direction and bounded steps',()=>{
 assert.ok(wheelImageZoom(1,-120)>1);assert.ok(wheelImageZoom(1,120)<1);
 near(wheelImageZoom(1,2,1),wheelImageZoom(1,32,0));near(wheelImageZoom(1,1,2,120),wheelImageZoom(1,120,0));
 near(wheelImageZoom(1,100000),wheelImageZoom(1,240));assert.equal(wheelImageZoom(10,-120),10);assert.equal(wheelImageZoom(.1,120),.1);
});
