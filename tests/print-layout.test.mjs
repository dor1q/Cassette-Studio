import test from 'node:test';
import assert from 'node:assert/strict';
import {printLayout} from '../src/print-layout.js';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';
test('12-up sheet preserves size, side order and page overflow',()=>{
 const items=[{w:88.6,h:41.8},{w:88.6,h:41.8}];
 const plan=printLayout(items,{mode:'label',sheet:'12up',copies:7});
 assert.equal(plan.w,215.9);assert.equal(plan.h,279.4);
 assert.deepEqual(plan.pages.map(p=>p.length),[12,2]);
 assert.deepEqual(plan.pages[0].map(p=>p.item),[0,1,0,1,0,1,0,1,0,1,0,1]);
 assert.ok(Math.abs(plan.pages[0][2].y-plan.pages[0][0].y-992*25.4/600)<1e-8);
 const bleed=printLayout([{w:92.6,h:45.8}],{mode:'label',sheet:'12up',bleed:2,copies:12});
 assert.ok(bleed.pages[0].every(pos=>pos.clip));
 assert.ok(bleed.pages[0][0].clip.y+bleed.pages[0][0].clip.h<=bleed.pages[0][2].clip.y+1e-9);
});
test('duplex rotation follows actual page orientation and binding edge',()=>{
 for(const [width,flip,expected] of [[168,'long',0],[168,'short',180],[250,'long',180],[250,'short',0]]){
  const p=printLayout([{w:width,h:102},{w:width,h:102}],{duplexFlip:flip});
  assert.equal(p.pages[0][0].rotation,0);assert.equal(p.pages[1][0].rotation,expected);
 }
});
test('print offsets cannot silently clip artwork',()=>{
 assert.throws(()=>printLayout([{w:200,h:100}],{paper:'custom',offsetX:20}),/Смещение/);
 const p=printLayout([{w:80,h:40}],{mode:'label',offsetX:2,offsetY:-1});
 assert.equal(p.pages[0][0].x,12);assert.equal(p.pages[0][0].y,9);
});
test('image tint survives project load and preserves alpha in export',()=>{
 const p=createProject();p.surfaces.outer=[makeLayer('image',{src:'data:image/png;base64,AA==',tintMode:'solid',tintColor:'#ff0000'})];
 const loaded=migrate(p),r=renderSvg(loaded,'outer');
 assert.equal(loaded.surfaces.outer[0].tintMode,'solid');
 assert.match(r.svg,/feColorMatrix/);assert.match(r.svg,/0 0 0 1 0/);
});
