import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {CASSETTE_SHELL,CASSETTE_POINT,setCassettePrintArea} from '../src/cassette-shell.js';
import {previewGeometry,previewCassetteArtwork,CASSETTE_PREVIEW_DEPTH} from '../src/preview-geometry.js';
import {cassetteFaceSvg,PREVIEW_REELS,svgImageUrl} from '../src/preview-cassette.js';

const blue=[34,68,204,255],red=[204,34,68,255];
function plain(){const p=createProject();p.surfaces.labelA=[];p.surfaces.labelB=[];p.settings.bg='#2244cc';p.settings.bgB='#cc2244';return p}
function rendered(svg){
 const box=svg.match(/\bviewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
 const image=new Resvg(svg,{fitTo:{mode:'width',value:1000},font:{loadSystemFonts:false}}).render();
 return {png:'data:image/png;base64,'+image.asPng().toString('base64'),pixel(x,y){
  const px=Math.floor((x-box[0])*image.width/box[2]),py=Math.floor((y-box[1])*image.height/box[3]);
  assert.ok(px>=0&&px<image.width&&py>=0&&py<image.height,'sample lies inside the preview');
  return Array.from(image.pixels.subarray((py*image.width+px)*4,(py*image.width+px)*4+4));
 }};
}
function housing(p,side){const art=rendered(renderSvg(p,side,{guides:false}).svg);return {art,face:rendered(cassetteFaceSvg(p,side,art.png))}}

test('cassette preview follows physical shell proportions with a plausible housing thickness',()=>{
 const p=plain(),before=JSON.stringify(p),g=previewGeometry(p,'label');
 assert.ok(Math.abs(g.width/g.height-CASSETTE_SHELL.width/CASSETTE_SHELL.height)<1e-12);
 assert.ok(Math.abs(g.depth/g.width-CASSETTE_PREVIEW_DEPTH/(CASSETTE_SHELL.width*CASSETTE_POINT))<1e-12);
 assert.ok(g.depth<g.width/7,'cassette is thinner than the old deep cuboid');
 assert.equal(JSON.stringify(p),before);
});

test('label and direct shell artwork retain the exact printable coordinate system',()=>{
 const p=plain(),label=previewCassetteArtwork(p);
 assert.deepEqual(label,{x:CASSETTE_SHELL.labelX*CASSETTE_POINT,y:CASSETTE_SHELL.labelY*CASSETTE_POINT,w:p.layout.labelW,h:p.layout.labelH});
 for(const area of ['body','full']){
  setCassettePrintArea(p,area);
  assert.deepEqual(previewCassetteArtwork(p),{x:0,y:0,w:CASSETTE_SHELL.width*CASSETTE_POINT,h:CASSETTE_SHELL.height*CASSETTE_POINT});
 }
});

test('mechanisms show through the actual transparent label window while each printed side retains its own artwork',()=>{
 const p=plain(),placement=previewCassetteArtwork(p),center={x:p.layout.labelW/2+(p.layout.holeOffsetX||0),y:p.layout.holeY+p.layout.holeH/2};
 for(const [side,color]of [['labelA',blue],['labelB',red]]){
  const {art,face}=housing(p,side);
  assert.equal(art.pixel(center.x,center.y)[3],0,'printable window stays transparent');
  assert.deepEqual(face.pixel(placement.x+10,placement.y+7),color,'artwork is placed without a new crop or tint');
  assert.equal(face.pixel(placement.x+center.x,placement.y+center.y)[3],255,'housing is visible through the artwork opening');
  assert.notDeepEqual(face.pixel(placement.x+center.x,placement.y+center.y),color);
  for(const reel of PREVIEW_REELS){
   const hub=face.pixel(reel.x+4,reel.y);assert.ok(hub[0]>70&&hub[1]>70&&hub[2]>70,'reel hub is visible under the label window');
  }
 }
});

test('turning off the label opening covers the mechanisms with the actual artwork',()=>{
 const p=plain();p.layout.hole=false;
 const {face}=housing(p,'labelA');
 for(const reel of PREVIEW_REELS)assert.deepEqual(face.pixel(reel.x,reel.y),blue);
});

test('direct shell print previews keep the physical reel openings and transparent rounded outer corners',()=>{
 const p=plain();
 for(const area of ['body','full']){
  setCassettePrintArea(p,area);const {art,face}=housing(p,'labelA');
  for(const reel of PREVIEW_REELS){
   assert.equal(art.pixel(reel.x,reel.y)[3],0);
   assert.notDeepEqual(face.pixel(reel.x+4,reel.y),blue,'reel is visible through the print mask');
  }
  assert.equal(face.pixel(.08,.08)[3],0,'housing corner is clipped rather than filled as a rectangle');
 }
});

test('a transparent custom label keeps its actual dimensions and placement on the shell',()=>{
 const p=plain();p.layout.labelW=78;p.layout.labelH=35;p.layout.hole=false;
 const placement=previewCassetteArtwork(p),{face}=housing(p,'labelA');
 assert.equal(placement.w,78);assert.equal(placement.h,35);
 assert.deepEqual(face.pixel(placement.x+77,placement.y+20),blue);
 assert.notDeepEqual(face.pixel(placement.x+79,placement.y+20),blue,'housing stays visible outside the smaller label');
});

test('preview SVG image URLs preserve the full artwork, colors and resource IDs after encoding',()=>{
 const p=plain(),svg=cassetteFaceSvg(p,'labelB',rendered(renderSvg(p,'labelB',{guides:false}).svg).png);
 const decoded=decodeURIComponent(svgImageUrl(svg).split(',').slice(1).join(','));
 assert.equal(decoded,svg);
 assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
 assert.match(svg,/data-preview-artwork="labelB"/);
 const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const [,id]of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(id),'local preview resource '+id+' exists');
});
