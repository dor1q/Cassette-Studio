import {dimensions,panelRects} from './model.js';
import {isCDMode} from './media-formats.js';
import {CASSETTE_SHELL,CASSETTE_POINT,cassetteArtworkOffset,cassetteDimensions,cassettePrintArea} from './cassette-shell.js';

export const MIN_PREVIEW_SCALE=10,MAX_PREVIEW_SCALE=140;
// The front follows the print template; thickness is an approximate housing depth.
export const CASSETTE_PREVIEW_DEPTH=12;

export function previewCassetteArtwork(project){
 const offset=cassettePrintArea(project.layout.printArea)==='label'?cassetteArtworkOffset('full'):{x:0,y:0},size=cassetteDimensions(project.layout);
 return {...offset,...size};
}

export function previewGeometry(project,mode='jcard'){
 if(isCDMode(mode)){
  if(mode==='cd-label')return {width:300,height:300,depth:3,initialScale:90,faces:null};
  const frontSurface=mode==='cd-insert'?'cdFront':'cdTray',backSurface=mode==='cd-insert'?'cdInside':'cdTrayInside';
  const front=panelRects(project,frontSurface).find(panel=>panel.index===2),back=panelRects(project,backSurface).find(panel=>panel.index===2),spine=panelRects(project,frontSurface).find(panel=>panel.index===0);
  const width=300,height=width*dimensions(project,frontSurface).h/front.w,depth=width*10.4/142;
  return {width,height,depth,initialScale:Math.min(90,340/height*100),faces:{front:{surface:frontSurface,fullWidth:dimensions(project,frontSurface).w,x:front.x,w:front.w},back:{surface:backSurface,fullWidth:dimensions(project,backSurface).w,x:back.x,w:back.w},spine:spine?{surface:frontSurface,fullWidth:dimensions(project,frontSurface).w,x:spine.x,w:spine.w}:null}};
 }
 if(mode==='label'){
  const width=300,shellWidth=CASSETTE_SHELL.width*CASSETTE_POINT;
  return {width,height:width*CASSETTE_SHELL.height/CASSETTE_SHELL.width,depth:width*CASSETTE_PREVIEW_DEPTH/shellWidth,initialScale:100,faces:null};
 }
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
