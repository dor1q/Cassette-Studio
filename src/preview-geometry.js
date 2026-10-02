import {dimensions,panelRects} from './model.js';

export const MIN_PREVIEW_SCALE=10,MAX_PREVIEW_SCALE=140;

export function previewGeometry(project,mode='jcard'){
 if(mode==='label')return {width:300,height:190,depth:56,initialScale:100,faces:null};
 const front=panelRects(project,'outer').find(r=>r.index===2),back=panelRects(project,'inner').find(r=>r.index===2),spine=panelRects(project,'outer').find(r=>r.index===1);
 const width=300,height=width*project.layout.height/front.w,depth=width*spine.w/front.w;
 return {width,height,depth,initialScale:Math.min(65,340/height*100),faces:{
  front:{surface:'outer',fullWidth:dimensions(project,'outer').w,x:front.x,w:front.w},
  back:{surface:'inner',fullWidth:dimensions(project,'inner').w,x:back.x,w:back.w},
  spine:{surface:'outer',fullWidth:dimensions(project,'outer').w,x:spine.x,w:spine.w},
 }};
}

export function previewCrop(canvas,face){
 const sourceX=canvas.width*face.x/face.fullWidth,sourceWidth=canvas.width*face.w/face.fullWidth;
 return {sourceX,sourceWidth,width:Math.max(1,Math.round(sourceWidth)),height:canvas.height};
}

export function previewFitScale(geometry,width,height){
 return Math.max(MIN_PREVIEW_SCALE,Math.min(MAX_PREVIEW_SCALE,geometry.initialScale,(width-40)/geometry.width*100,(height-30)/geometry.height*100));
}
