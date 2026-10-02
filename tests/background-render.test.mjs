import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';

// A real two-pixel PNG: opaque red on the left and opaque blue on the right.
const redBlue='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=';
function background(props={}){
 return makeLayer('image',{name:'Pattern',category:'background',src:redBlue,x:0,y:0,w:60,h:10,fit:'stretch',imageTile:true,tileWidth:10,tileHeight:10,...props});
}
function rendered(project,surface='outer'){
 const output=renderSvg(project,surface,{guides:false});
 const image=new Resvg(output.svg,{fitTo:{mode:'width',value:Math.round(output.w*10)}}).render();
 const scale=image.width/output.w;
 return {svg:output.svg,pixel(x,y){
  const px=Math.floor(x*scale),py=Math.floor(y*scale);
  assert.ok(px>=0&&px<image.width&&py>=0&&py<image.height,'sample lies inside the rendered surface');
  const offset=(py*image.width+px)*4;
  return Array.from(image.pixels.slice(offset,offset+4));
 }};
}
function red(pixel){assert.ok(pixel[0]>pixel[2]*2&&pixel[0]>120,`expected red, got ${pixel}`);assert.equal(pixel[3],255)}
function blue(pixel){assert.ok(pixel[2]>pixel[0]*2&&pixel[2]>120,`expected blue, got ${pixel}`);assert.equal(pixel[3],255)}

test('a repeated image paints several red-blue tiles instead of stretching one image over the layer',()=>{
 const project=createProject();project.surfaces.outer=[background()];
 const repeated=rendered(project);
 for(const x of [2,12,22,42])red(repeated.pixel(x,5));
 for(const x of [8,18,28,48])blue(repeated.pixel(x,5));
 project.surfaces.outer[0].imageTile=false;
 const single=rendered(project);
 red(single.pixel(8,5));blue(single.pixel(48,5));
 assert.notDeepEqual(repeated.pixel(8,5),single.pixel(8,5));
});

test('moving a repeated image shifts the motif without changing its tile size',()=>{
 const project=createProject();project.surfaces.outer=[background()];
 const before=rendered(project);red(before.pixel(12,5));blue(before.pixel(18,5));
 project.surfaces.outer[0].cropX=5;
 const shifted=rendered(project);
 blue(shifted.pixel(12,5));red(shifted.pixel(18,5));blue(shifted.pixel(22,5));
});

test('repeated cassette backgrounds respect the central window and diagonal top corners',()=>{
 const project=createProject(),layout=project.layout;
 for(const surface of ['labelA','labelB']){
  project.surfaces[surface]=[background({w:layout.labelW,h:layout.labelH})];
  const image=rendered(project,surface),cx=layout.labelW/2+(layout.holeOffsetX||0),cy=layout.holeY+layout.holeH/2;
  for(const [x,y] of [[cx,cy],[cx-12,cy],[cx+12,cy],[.3,.3],[layout.labelW-.3,.3]])assert.equal(image.pixel(x,y)[3],0,surface+' cutout');
  for(const [x,y] of [[10,10],[.3,layout.labelH-.3],[layout.labelW-.3,layout.labelH-.3]])assert.equal(image.pixel(x,y)[3],255,surface+' printed area');
 }
});

test('independent cassette backgrounds retain different tile geometry and position after JSON reopening',()=>{
 const project=createProject();project.layout.sync=false;
 project.surfaces.labelA=[background({w:88.6,h:41.8,tileWidth:10,cropX:0,opacity:1})];
 project.surfaces.labelB=[background({w:88.6,h:41.8,tileWidth:20,cropX:5,opacity:.7,blur:.2})];
 const restored=migrate(JSON.parse(JSON.stringify(project)));
 assert.equal(restored.layout.sync,false);
 for(const surface of ['labelA','labelB'])for(const key of ['src','imageTile','tileWidth','tileHeight','cropX','cropY','cropZoom','opacity','blur'])assert.equal(restored.surfaces[surface][0][key],project.surfaces[surface][0][key]);
 blue(rendered(restored,'labelA').pixel(8,5));
 assert.notDeepEqual(rendered(restored,'labelA').pixel(8,5),rendered(restored,'labelB').pixel(8,5));
 restored.surfaces.labelA[0].tileWidth=30;
 assert.equal(restored.surfaces.labelB[0].tileWidth,20);
});

test('background blur produces a finite Gaussian SVG filter and survives a JSON round trip',()=>{
 const project=createProject();project.surfaces.outer=[background({blur:1.25})];
 const restored=migrate(JSON.parse(JSON.stringify(project))),image=rendered(restored);
 assert.equal(restored.surfaces.outer[0].blur,1.25);
 assert.match(image.svg,/<feGaussianBlur\b/);
 const deviations=[...image.svg.matchAll(/stdDeviation="([^"]+)"/g)].map(match=>Number(match[1]));
 assert.ok(deviations.some(value=>Number.isFinite(value)&&value>0&&value<=20));
 assert.doesNotMatch(image.svg,/\b(?:NaN|Infinity|undefined)\b/);
 project.surfaces.outer[0].blur=0;
 assert.doesNotMatch(renderSvg(project,'outer',{guides:false}).svg,/<feGaussianBlur\b/);
});

test('untrusted tile sizes and blur are normalized to finite rendering bounds',()=>{
 for(const [tileWidth,tileHeight,blur] of [[-5,99999,999],[Infinity,-Infinity,NaN],['bad',null,-4]]){
  const project=createProject();project.surfaces.outer=[background({tileWidth,tileHeight,blur,imageTile:'invalid'})];
  const layer=migrate(project).surfaces.outer[0];
  for(const key of ['tileWidth','tileHeight'])assert.ok(Number.isFinite(layer[key])&&layer[key]>=.1&&layer[key]<=1500,key+' bounded');
  assert.ok(Number.isFinite(layer.blur)&&layer.blur>=0&&layer.blur<=20);
  assert.equal(typeof layer.imageTile,'boolean');
 }
});

test('a newly imported album cover stays above existing background images and below text',()=>{
 const project=createProject(),front=project.layout.flap+project.layout.spine;
 project.surfaces.outer=[background({x:front,w:project.layout.front,h:project.layout.height}),makeLayer('text',{name:'Caption',text:'Heading',x:front+4,y:2})];
 for(const surface of ['labelA','labelB'])project.surfaces[surface]=[background({w:project.layout.labelW,h:project.layout.labelH}),makeLayer('text',{name:'Caption',text:'Heading'})];
 applyAlbumArt(project,redBlue);
 for(const surface of ['outer','labelA','labelB']){
  const list=project.surfaces[surface],cover=albumArtLayer(project,surface);
  assert.equal(list[0].category,'background');assert.ok(list.indexOf(cover)>0);assert.ok(list.indexOf(cover)<list.findIndex(layer=>layer.type==='text'));
 }
 const cover=albumArtLayer(project,'outer');
 Object.assign(cover,{fit:'stretch',opacity:1});
 // At this point the pattern is blue, but the larger cover's left half is red.
 red(rendered(project).pixel(front+8,15));
 applyAlbumArt(project,redBlue);
 assert.equal(project.surfaces.outer.filter(layer=>layer.category==='albumCover').length,1);
 assert.equal(project.surfaces.outer[0].category,'background');
});
