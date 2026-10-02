import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,panelRects,migrate} from '../src/model.js';
import {previewGeometry,previewCrop,previewFitScale} from '../src/preview-geometry.js';

test('J-card preview preserves the actual front and spine proportions',()=>{
 const p=createProject(),g=previewGeometry(p);
 assert.ok(Math.abs(g.width/g.height-p.layout.front/p.layout.height)<1e-12);
 assert.ok(Math.abs(g.depth/g.width-p.layout.spine/p.layout.front)<1e-12);
 assert.equal(g.faces.front.x,p.layout.flap+p.layout.spine);
 assert.equal(g.faces.spine.x,p.layout.flap);
});

test('reference reverse panel is cropped from its mirrored location for 3..8 panels',()=>{
 for(let panels=3;panels<=8;panels++){
  const p=createProject();importReference(p,`https://vhs.texs.org/en/jcard?face=p${panels}&ds=1&eb=1&sw=250`);
  const g=previewGeometry(p),r=panelRects(p,'inner').find(r=>r.index===2);
  assert.equal(g.faces.back.x,r.x);assert.equal(g.faces.back.w,r.w);
  assert.equal(g.faces.back.fullWidth,g.faces.front.fullWidth);
  if(panels!==4)assert.notEqual(g.faces.back.x,g.faces.front.x);
 }
});

test('ordinary J-card reverse retains its unmirrored coordinates',()=>{
 const p=createProject();p.layout.panels=6;p.layout.double=true;
 const g=previewGeometry(p);assert.equal(g.faces.front.x,g.faces.back.x);
});

test('small or tall custom front panels fit in the initial preview',()=>{
 const p=createProject();Object.assign(p.layout,{front:50,height:130,spine:25.4});
 const g=previewGeometry(p);assert.equal(g.height,780);assert.equal(g.depth,152.4);
 assert.equal(g.height*g.initialScale/100,340);assert.ok(g.initialScale>=40);
});

test('preview image crops retain subpixel boundaries and never produce a zero-width spine',()=>{
 const face={fullWidth:168.3,x:25.4,w:6.35},crop=previewCrop({width:663,height:400},face);
 assert.equal(crop.sourceX,663*25.4/168.3);assert.equal(crop.sourceWidth,663*6.35/168.3);
 assert.equal(crop.height,400);assert.equal(previewCrop({width:1,height:1},face).width,1);
});

test('preview geometry is stable after reopening a saved reference project',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p8&ds=1&sb=1&sw=500');
 assert.deepEqual(previewGeometry(p),previewGeometry(migrate(JSON.parse(JSON.stringify(p)))));
});

test('a tall custom J-card fits the visible stage on small screens',()=>{
 const p=createProject();Object.assign(p.layout,{front:50,height:130});const g=previewGeometry(p);
 for(const [w,h]of [[660,268],[320,160]]){
  const scale=previewFitScale(g,w,h);
  assert.ok(g.width*scale/100<=w-40);assert.ok(g.height*scale/100<=h-30+.001);
  assert.ok(scale>=10&&scale<=140);
 }
});

test('fitting cassette previews preserves nominal scale when space is available',()=>{
 const g=previewGeometry(createProject(),'label');
 assert.equal(previewFitScale(g,660,380),100);
 assert.equal(previewFitScale(g,240,380),200/300*100);
});
