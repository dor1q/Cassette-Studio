import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,dimensions,migrate} from '../src/model.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';
import {setCassettePrintArea} from '../src/cassette-shell.js';
import {restoreReferenceCover} from '../src/reference-images.js';
import {renderSvg} from '../src/render.js';

const image='data:image/png;base64,AA==';
const frame=layer=>({x:layer.x,y:layer.y,w:layer.w,h:layer.h});

test('new album artwork covers the whole active cassette body footprint on both sides',()=>{
 for(const area of ['label','body','full']){
  const p=createProject();setCassettePrintArea(p,area);
  const before=structuredClone(p.surfaces);
  applyAlbumArt(p,image);
  for(const surface of ['labelA','labelB']){
   const size=dimensions(p,surface),cover=albumArtLayer(p,surface);
   assert.deepEqual(frame(cover),{x:0,y:0,w:size.w,h:size.h});
   assert.equal(cover.fit,'meet');assert.equal(cover.cropZoom,1);
   assert.deepEqual(p.surfaces[surface].slice(1),before[surface]);
  }
  assert.deepEqual(frame(albumArtLayer(p,'outer')),{x:p.layout.flap+p.layout.spine,y:0,w:p.layout.front,h:p.layout.height});
  const saved=migrate(JSON.parse(JSON.stringify(p)));
  for(const surface of ['labelA','labelB']){
   assert.deepEqual(frame(albumArtLayer(saved,surface)),frame(albumArtLayer(p,surface)));
   assert.match(renderSvg(saved,surface,{guides:false}).svg,/preserveAspectRatio="xMidYMid meet"/);
  }
 }
});

test('body artwork replacement keeps a manually positioned frame and respects the chosen side',()=>{
 const p=createProject();setCassettePrintArea(p,'full');applyAlbumArt(p,image);
 const cover=albumArtLayer(p,'labelA'),other=structuredClone(p.surfaces.labelB),outer=structuredClone(p.surfaces.outer);
 Object.assign(cover,{x:11,y:7,w:54,h:39,rotation:13,opacity:.23,cropZoom:2,cropX:9,cropY:-3});
 const before=frame(cover);applyAlbumArt(p,'data:image/png;base64,BB==','A');
 assert.deepEqual(frame(cover),before);assert.equal(cover.rotation,13);assert.equal(cover.opacity,.23);
 assert.equal(cover.cropZoom,1);assert.equal(cover.cropX,0);assert.equal(cover.cropY,0);
 assert.deepEqual(p.surfaces.labelB,other);assert.deepEqual(p.surfaces.outer,outer);
 assert.equal(p.surfaces.labelA.filter(l=>l.category==='albumCover').length,1);
});

test('reference cover restoration in an existing body project fills the body on both faces',async()=>{
 for(const area of ['body','full']){
  const p=createProject();setCassettePrintArea(p,area);
  const params=new URLSearchParams({cp:'https://example.com/album.png',pf:'f'});
  const result=await restoreReferenceCover(p,params,async()=>({src:image}),'label',[],async()=>[600,600]);
  assert.equal(result.handled,true);assert.equal(result.restored,1);assert.equal(result.missing,0);
  for(const surface of ['labelA','labelB']){
   const size=dimensions(p,surface),cover=albumArtLayer(p,surface);
   assert.deepEqual(frame(cover),{x:0,y:0,w:size.w,h:size.h});
   assert.equal(cover.fit,'meet');assert.equal(cover.referenceAssetKey,'https://example.com/album.png');
  }
  assert.equal(p.surfaces.outer.some(l=>l.category==='albumCover'),false);
 }
});

test('restoring label coordinates before the print-area change expands only the cover',async()=>{
 const p=createProject(),text=structuredClone(p.surfaces.labelA[0]);
 const result=await restoreReferenceCover(p,new URLSearchParams({cp:'https://example.com/album.png',pf:'f'}),async()=>({src:image}),'label',[],async()=>[600,600]);
 assert.equal(result.restored,1);
 setCassettePrintArea(p,'full');
 const size=dimensions(p,'labelA'),cover=albumArtLayer(p,'labelA');
 assert.deepEqual(frame(cover),{x:0,y:0,w:size.w,h:size.h});
 assert.equal(p.surfaces.labelA[1].w,text.w);assert.equal(p.surfaces.labelA[1].h,text.h);
 assert.ok(p.surfaces.labelA[1].x>text.x);assert.ok(p.surfaces.labelA[1].y>text.y);
});
