import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,dimensions,makeLayer,panelRects} from '../src/model.js';
import {setCassettePrintArea} from '../src/cassette-shell.js';
import {renderSvg} from '../src/render.js';
import {productionChoices,productionPages,productionPanelMap,productionTemplate,PRODUCTION_BLEED} from '../src/production-print.js';

const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const colors=['#ff0000','#00ff00','#0000ff','#ffff00','#00ffff','#ff00ff','#999999','#111111'];
function project(panels=3){const p=createProject();p.layout.panels=panels;p.layout.referenceTemplate=true;for(const s of ['outer','inner'])p.surfaces[s]=panelRects(p,s).map(r=>makeLayer('shape',{x:r.x,y:0,w:r.w,h:p.layout.height,color:colors[r.index]}));return p}
function items(p){return ['outer','inner'].map(s=>({s,...renderSvg(p,s,{guides:false,bleed:PRODUCTION_BLEED})}))}
function rendered(page,width=1400){const r=new Resvg(page.svg,{fitTo:{mode:'width',value:width},font:{loadSystemFonts:false}}).render();return {pixel(x,y){const px=Math.floor(x*r.width/page.pixelWidth),py=Math.floor(y*r.height/page.pixelHeight);return Array.from(r.pixels.subarray((py*r.width+px)*4,(py*r.width+px)*4+4))}}}

test('single production templates retain their published physical trim and page size',()=>{
 const p=project(3),page=productionPages(p,items(p))[0];
 close(page.w,108.585);close(page.h,105.57933333333334);
 close(page.trim.w*25.4/600,104.648);close(page.trim.h*25.4/600,102.06566666666667);
 assert.match(page.svg,/width="108\.585mm"/);assert.match(page.svg,/viewBox="0 0 2565 2494"/);
 const template=productionTemplate(3);template.edges[0]=10;assert.equal(productionTemplate(3).edges[0],0);
});

test('all supported panel counts map every physical panel without gaps on both sides',()=>{
 for(let count=3;count<=8;count++)for(const surface of ['outer','inner']){
  const p=project(count),map=productionPanelMap(p,surface),panels=[...map.panels].sort((a,b)=>a.target.x-b.target.x);
  assert.equal(panels.length,count);close(panels[0].target.x,map.trim.x);
  close(panels.at(-1).target.x+panels.at(-1).target.w,map.trim.x+map.trim.w);
  for(let i=0;i<count;i++){
   const panel=panels[i];assert.ok(panel.source.w>0&&panel.target.w>0);close(panel.target.y,map.trim.y);close(panel.target.h,map.trim.h);
   if(i)close(panels[i-1].target.x+panels[i-1].target.w,panel.target.x);
  }
  close(map.panels.reduce((sum,r)=>sum+r.source.w,0),dimensions(p,surface).w);
 }
});

test('production rendering keeps colored artwork in its panel on the reverse',()=>{
 const p=project(4),pages=productionPages(p,items(p));
 for(const page of pages){const image=rendered(page);for(const panel of page.panels){
  const point=image.pixel(panel.target.x+panel.target.w/2,panel.target.y+panel.target.h/2),hex='#'+point.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
  assert.equal(hex,colors[panel.index],`${page.s} panel ${panel.index}`);assert.equal(point[3],255);
 }}
});

test('single template duplex orientation follows binding edge and repeats complete pairs',()=>{
 const p=project(4);
 for(const [duplexFlip,rotation]of [['long',180],['short',0]]){
  const pages=productionPages(p,items(p),{copies:3,duplexFlip});
  assert.deepEqual(pages.map(page=>page.s),['outer','inner','outer','inner','outer','inner']);
  assert.deepEqual(pages.map(page=>page.rotation),[0,rotation,0,rotation,0,rotation]);
  assert.equal(pages[0].svg,pages[2].svg);
 }
});

test('SRA3 contains eight front cards per sheet at the published print coordinates',()=>{
 const p=project(3),pages=productionPages(p,items(p),{sheet:'chalkpit-jcard-8up',copies:2});
 assert.equal(pages.length,2);assert.deepEqual(pages.map(page=>page.s),['outer','outer']);
 for(const page of pages){close(page.w,320.04);close(page.h,450.00333333333333);assert.equal(page.dpi,300);assert.equal(page.seats.length,8);assert.equal(page.rotation,0);
  const image=rendered(page,1600);
  for(const seat of page.seats){assert.ok(seat.x-seat.bleed>=0&&seat.y-seat.bleed>=0);assert.ok(seat.x+seat.w+seat.bleed<page.pixelWidth&&seat.y+seat.h+seat.bleed<page.pixelHeight);assert.deepEqual(image.pixel(seat.x+seat.w*.85,seat.y+seat.h*.5),[0,0,255,255]);}
 }
 assert.throws(()=>productionPages(p,items(p).slice(1),{sheet:'chalkpit-jcard-8up'}),/только внешнюю сторону/);
});

test('cassette jig contains four shells with fixed openings and separate A/B sheets',()=>{
 const p=project();setCassettePrintArea(p,'full');p.settings.bg=p.settings.bgB='#0000ff';p.surfaces.labelA=[];p.surfaces.labelB=[];
 const input=['labelA','labelB'].map(s=>({s,...renderSvg(p,s,{guides:false})})),pages=productionPages(p,input,{sheet:'chalkpit-cassette-4up',copies:2});
 assert.deepEqual(pages.map(page=>page.s),['labelA','labelB','labelA','labelB']);
 for(const page of pages){close(page.w,592.982*25.4/72);close(page.h,409.358*25.4/72);assert.equal(page.dpi,600);assert.equal(page.seats.length,4);
  const image=rendered(page,1500);
  for(const seat of page.seats){assert.ok(seat.x>=0&&seat.y>=0);assert.ok(seat.x+seat.w<page.pixelWidth+1&&seat.y+seat.h<page.pixelHeight+1);
   assert.deepEqual(image.pixel(seat.x+seat.w*.5,seat.y+seat.h*.15),[0,0,255,255]);
   assert.deepEqual(image.pixel(seat.x+seat.w*.5,seat.y+seat.h*.46),[255,255,255,255]);
  }
 }
});

test('production choices reject incompatible physical formats instead of silently stretching a jig',()=>{
 const p=project(4);assert.deepEqual(productionChoices(p).map(c=>c.value),['chalkpit-jcard']);
 p.layout.spine=14;assert.deepEqual(productionChoices(p),[]);assert.throws(()=>productionPages(p,items(p)),/корешок/);
 const q=project(3);assert.deepEqual(productionChoices(q,'label'),[]);
 assert.throws(()=>productionPages(q,[{s:'labelA',...renderSvg(q,'labelA')}]),/Сторона макета/);
 setCassettePrintArea(q,'body');assert.equal(productionChoices(q,'label')[0].value,'chalkpit-cassette-4up');
 assert.throws(()=>productionPages(q,[{s:'labelA',w:88.6,h:41.8,svg:'<svg/>'}],{sheet:'chalkpit-cassette-4up'}),/100,6/);
});
