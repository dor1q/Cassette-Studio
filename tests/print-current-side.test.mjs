import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,makeLayer} from '../src/model.js';
import {composePrintSheetSvg,exportImagePages,prepareExport} from '../src/export.js';
import {printLayout} from '../src/print-layout.js';

function plain(){
 const project=createProject();project.layout.double=true;project.layout.panels=3;
 for(const surface of Object.keys(project.surfaces))project.surfaces[surface]=[];
 return project;
}

test('current inside uses the same duplex rotation as the inside of a complete J-card pair',()=>{
 for(const [width,duplexFlip,rotation]of [[168,'long',0],[168,'short',180],[250,'long',180],[250,'short',0]]){
  const inside={s:'inner',w:width,h:102},outside={...inside,s:'outer'};
  const current=printLayout([inside],{duplexFlip}),pair=printLayout([outside,inside],{duplexFlip});
  assert.equal(current.pages[0][0].rotation,rotation);
  assert.equal(current.pages[0][0].rotation,pair.pages[1][0].rotation);
  assert.equal(printLayout([outside],{duplexFlip}).pages[0][0].rotation,0);
 }
});

test('named J-card surfaces keep their rotation when selected or reordered',()=>{
 const items=[{s:'inner',w:168,h:102},{s:'outer',w:168,h:102}];
 const plan=printLayout(items,{sheet:'2up',copies:3,duplexFlip:'short'});
 assert.deepEqual(plan.pages.map(page=>page.map(pos=>pos.rotation)),[[180,180],[0,0],[180],[0]]);
 assert.deepEqual(plan.pages.map(page=>page.map(pos=>pos.item)),[[0,0],[1,1],[0],[1]]);
});

test('current inside sheet image rotates corner artwork once without guides or clipping',()=>{
 const project=plain();project.settings.bgInside='#ff0000';
 project.surfaces.inner=[makeLayer('shape',{shape:'rect',x:0,y:0,w:12,h:9,color:'#0000ff'})];
 const options={surface:'inner',selection:'current',sheet:'2up',copies:1,duplexFlip:'short',bleed:0};
 const prepared=prepareExport(project,options),plan=printLayout(prepared.items,prepared.options);
 const exported=exportImagePages(project,options);
 assert.equal(exported.length,1);assert.equal(plan.pages[0][0].rotation,180);
 assert.equal(exported[0].svg,composePrintSheetSvg(prepared.items,plan.pages[0],plan.w,plan.h));
 assert.doesNotMatch(exported[0].svg,/stroke="(?:#91958a|#999|#aaa)"/);
 const image=new Resvg(exported[0].svg,{fitTo:{mode:'width',value:840},font:{loadSystemFonts:false}}).render();
 const pixels=image.pixels,pixel=(x,y)=>{
  const index=(Math.floor(y*image.height/plan.h)*image.width+Math.floor(x*image.width/plan.w))*4;
  return Array.from(pixels.subarray(index,index+4));
 };
 const position=plan.pages[0][0],item=prepared.items[0];
 assert.deepEqual(pixel(position.x+item.w-6,position.y+item.h-4),[0,0,255,255]);
 assert.deepEqual(pixel(position.x+6,position.y+4),[255,0,0,255]);
 assert.deepEqual(pixel(position.x-2,position.y+4),[255,255,255,255]);
});
