import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {jsPDF} from 'jspdf';
import {createProject,dimensions} from '../src/model.js';
import {resetCDSurfaces} from '../src/cd-layout.js';
import {surfaceSet,prepareExport,exportImagePages,raster} from '../src/export.js';
import {productionChoices} from '../src/production-print.js';
import {printLayout} from '../src/print-layout.js';
import {writePrintPages} from '../src/print-pdf.js';
import {printShopSpecs,printShopLetter} from '../src/print-shop-letter.js';
import {exportDialogHtml,exportControlState,bindExportDialog} from '../src/export-dialog.js';

const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function project(mode){
 const p=createProject();p.editorMode=mode;resetCDSurfaces(p);p.settings.bg='#112233';p.settings.bgInside='#ddeeff';
 for(const surface of ['cdLabel','cdFront','cdInside','cdTray','cdTrayInside'])p.surfaces[surface]=[];
 return p;
}
const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').render().asPng();
const canvas={toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')};

test('CD exports use their project mode, exact physical surface and 600 dpi defaults',()=>{
 for(const [mode,surface]of [['cd-label','cdLabel'],['cd-insert','cdFront'],['cd-tray','cdTray']]){
  const p=project(mode),prepared=prepareExport(p),frames=exportImagePages(p);
  assert.deepEqual(prepared.items.map(item=>item.s),[surface]);assert.equal(prepared.options.mode,mode);assert.equal(prepared.options.surface,surface);assert.equal(prepared.options.dpi,600);
  assert.equal(frames.length,1);assert.equal(frames[0].dpi,600);const d=dimensions(p,surface);near(frames[0].w,d.w);near(frames[0].h,d.h);
 }
});

test('CD all/current selection includes only its enabled family faces and validates explicit sides',()=>{
 const p=project('cd-insert');assert.deepEqual(surfaceSet(p),['cdFront']);assert.deepEqual(surfaceSet(p,'cd-insert','cdInside','current'),['cdInside']);
 p.layout.cdInsertDouble=true;assert.deepEqual(surfaceSet(p),['cdFront','cdInside']);
 p.editorMode='cd-tray';assert.deepEqual(surfaceSet(p),['cdTray']);p.layout.cdTrayDouble=true;assert.deepEqual(surfaceSet(p),['cdTray','cdTrayInside']);assert.deepEqual(surfaceSet(p,'cd-tray','cdTrayInside','current'),['cdTrayInside']);
 assert.throws(()=>surfaceSet(p,'cd-tray','cdLabel','current'),/не относится/);assert.throws(()=>prepareExport(p,{selection:'current',surface:'outer'}),/не относится/);
});

test('CD exports and print specifications reject cassette production and 12-up templates',()=>{
 for(const mode of ['cd-label','cd-insert','cd-tray'])for(const sheet of ['chalkpit-jcard','chalkpit-jcard-8up','chalkpit-cassette-4up','12up','12up-trim']){
  const p=project(mode);assert.throws(()=>prepareExport(p,{sheet}),/кассет/);assert.throws(()=>printShopSpecs(p,{sheet}),/кассет/);
 }
 assert.throws(()=>prepareExport(project('cd-insert'),{sheet:'cd-letter-2up'}),/CD Label/);
 for(const mode of ['cd-label','cd-insert','cd-tray'])assert.deepEqual(productionChoices(project(mode),mode),[]);
});

test('600 dpi A3 raster sheets pass the size guard while oversized sheets are rejected before drawing',async()=>{
 const originalDocument=globalThis.document,originalImage=globalThis.Image,canvases=[];let draws=0;
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>{const c={width:0,height:0,getContext:()=>({drawImage:()=>draws++})};canvases.push(c);return c}};
 globalThis.Image=class{set src(_value){queueMicrotask(()=>this.onload())}};
 try{
  const page=await raster('<svg/>',420,297,600);assert.equal(page.width,9921);assert.equal(page.height,7016);assert.equal(page.width*page.height,69605736);assert.equal(draws,1);
  await assert.rejects(raster('<svg/>',500,400,600),/Слишком большой макет/);assert.equal(draws,1);assert.equal(canvases.length,2);
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalImage===undefined)delete globalThis.Image;else globalThis.Image=originalImage}
});

test('CD Label PNG artwork keeps a transparent center and corners at its real 600 dpi size',()=>{
 const page=exportImagePages(project('cd-label'),{bleed:2})[0],size=Math.round(page.w/25.4*page.dpi);
 const rendered=new Resvg(page.svg,{fitTo:{mode:'width',value:size},font:{loadSystemFonts:false}}).render(),pixels=rendered.pixels;
 const alpha=(x,y)=>pixels[(Math.floor(y)*rendered.width+Math.floor(x))*4+3],center=rendered.width/2;
 assert.equal(rendered.width,size);assert.equal(rendered.height,size);assert.equal(alpha(center,center),0);assert.equal(alpha(0,0),0);assert.equal(alpha(center,center*.6),255);
 near(page.w,dimensions(project('cd-label'),'cdLabel').w+4);assert.equal(page.dpi,600);
});

test('OL1200 / Avery 8692 exports use measured Letter seat centers without changing artwork size',()=>{
 const p=project('cd-label'),prepared=prepareExport(p,{sheet:'cd-letter-2up',paper:'a4',bleed:5,dpi:150,copies:3});
 assert.equal(prepared.options.paper,'letter');assert.equal(prepared.options.bleed,0);assert.equal(prepared.options.dpi,600);
 const plan=printLayout(prepared.items,prepared.options);near(plan.w,215.9);near(plan.h,279.4);assert.deepEqual(plan.pages.map(page=>page.length),[2,1]);
 for(const [slot,pos]of plan.pages[0].entries()){
  const item=prepared.items[pos.item];near(pos.x+item.w/2,2550*25.4/600);near(pos.y+item.h/2,[1648,4935][slot]*25.4/600);assert.equal(pos.rotation,0);
 }
 const images=exportImagePages(p,{sheet:'cd-letter-2up',copies:3});assert.equal(images.length,2);assert.match(images[0].svg,/width="215.9mm" height="279.4mm"/);assert.equal(images[0].dpi,600);
 assert.throws(()=>prepareExport(p,{sheet:'cd-letter-2up',offsetX:1}),/позиции фиксированы/);
 p.layout.cdLabelDiameter=100;assert.throws(()=>exportImagePages(p,{sheet:'cd-letter-2up'}),/стандартный CD Label/);
});

test('generic CD 2-up supports A4 and Letter with complete copy counts',()=>{
 const p=project('cd-label');for(const paper of ['a4','letter']){
  const prepared=prepareExport(p,{sheet:'cd-2up',paper,copies:5,bleed:2}),plan=printLayout(prepared.items,prepared.options);
  assert.deepEqual(plan.pages.map(page=>page.length),[2,2,1]);for(const page of plan.pages)for(const pos of page){const item=prepared.items[pos.item];near(pos.x+item.w/2,plan.w/2);assert.ok(pos.y>=10);assert.ok(pos.y+item.h<=plan.h-10+1e-6)}
 }
});

test('two-panel CD Insert fits landscape A4 and its duplex faces share the same paper positions',()=>{
 const p=project('cd-insert');p.layout.cdInsertDouble=true;p.layout.cdInsertPanels=2;
 for(const [duplexFlip,rotation]of [['long',180],['short',0]]){
  const prepared=prepareExport(p,{duplexFlip,copies:2}),plan=printLayout(prepared.items,prepared.options);near(plan.w,297);near(plan.h,210);near(prepared.items[0].w,241.3);near(prepared.items[0].h,120.65);
  assert.equal(plan.pages.length,4);for(let page=0;page<4;page+=2){const front=plan.pages[page][0],back=plan.pages[page+1][0];near(front.x,back.x);near(front.y,back.y);assert.equal(front.rotation,0);assert.equal(back.rotation,rotation)}
 }
});

test('three-panel CD Insert requires A3 or custom paper and writes a PDF at the exact plan size',()=>{
 const p=project('cd-insert');p.layout.cdInsertPanels=3;p.layout.cdInsertDouble=true;
 const prepared=prepareExport(p);assert.throws(()=>printLayout(prepared.items,prepared.options),/не помещается/);
 for(const paper of ['a3','custom']){
  const plan=printLayout(prepared.items,{...prepared.options,paper}),items=prepared.items.map(item=>({...item,canvas}));
  if(paper==='a3'){near(plan.w,420);near(plan.h,297)}else{near(plan.w,358.817333333333+20);near(plan.h,120.65+20)}
  const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],orientation:plan.w>plan.h?'landscape':'portrait',compress:false});let rotations=0;
  writePrintPages(doc,items,plan,source=>{rotations++;return source});near(doc.internal.pageSize.getWidth(),plan.w);near(doc.internal.pageSize.getHeight(),plan.h);assert.equal(doc.getNumberOfPages(),2);assert.equal(rotations,1);assert.equal((doc.output().match(/\/I\d+ Do/g)||[]).length,2);
 }
});

test('current CD Insert inside follows the same duplex rotation as a complete pair',()=>{
 const p=project('cd-insert');p.layout.cdInsertPanels=1;p.layout.cdInsertDouble=true;
 for(const [duplexFlip,rotation]of [['long',0],['short',180]]){
  const pair=prepareExport(p,{duplexFlip}),only=prepareExport(p,{duplexFlip,selection:'current',surface:'cdInside'}),a=printLayout(pair.items,pair.options),b=printLayout(only.items,only.options);
  near(a.pages[1][0].x,b.pages[0][0].x);near(a.pages[1][0].y,b.pages[0][0].y);assert.equal(b.pages[0][0].rotation,rotation);
 }
});

test('CD Tray with an inside prints page pairs, with matching folds and accurate optional spine sizes',()=>{
 const p=project('cd-tray');p.layout.cdTrayDouble=true;
 const prepared=prepareExport(p,{copies:3,sheet:'2up',duplexFlip:'short'}),plan=printLayout(prepared.items,prepared.options);assert.equal(plan.pages.length,4);assert.deepEqual(plan.pages.map(page=>page.length),[2,2,1,1]);
 for(let page=0;page<4;page+=2)for(const [slot,front]of plan.pages[page].entries()){const back=plan.pages[page+1][slot];near(front.x,back.x);near(front.y,plan.h-prepared.items[1].h-back.y);assert.equal(back.rotation,180)}
 const details=printShopSpecs(p,{copies:3,sheet:'2up',duplexFlip:'short'});assert.equal(details.pageCount,4);assert.equal(details.duplex,true);assert.deepEqual(details.surfaces,['cdTray','cdTrayInside']);near(details.finished.w,150.876);near(details.finished.h,2787*25.4/600);assert.equal(details.cd.spines.length,2);near(details.cd.spines[0],6.773333333333);near(details.cd.folds[0],6.773333333333);
 p.layout.cdTrayLeftSpine=false;const smaller=printShopSpecs(p);near(smaller.finished.w,150.876-6.773333333333);assert.equal(smaller.cd.spines.length,1);assert.equal(smaller.cd.folds.length,1);
});

test('CD print specifications match exported plans and name circles, folds and spines',()=>{
 for(const [mode,options]of [['cd-label',{sheet:'cd-letter-2up',copies:4}],['cd-insert',{paper:'a3',copies:2}],['cd-tray',{copies:2}]]){
  const p=project(mode);if(mode==='cd-insert'){p.layout.cdInsertPanels=3;p.layout.cdInsertDouble=true}if(mode==='cd-tray')p.layout.cdTrayDouble=true;
  const prepared=prepareExport(p,options),plan=printLayout(prepared.items,prepared.options),details=printShopSpecs(p,options),letter=printShopLetter(p,{...options,includeQr:false});
  near(details.page.w,plan.w);near(details.page.h,plan.h);assert.equal(details.pageCount,plan.pages.length);assert.deepEqual(details.surfaces,prepared.items.map(item=>item.s));assert.equal(details.dpi,600);
  assert.match(letter.svg,new RegExp(mode==='cd-label'?'CD Label':mode==='cd-insert'?'CD Insert':'CD Tray'));assert.doesNotMatch(letter.svg,/Cassette · наклейки/);
  if(mode==='cd-label'){assert.match(letter.svg,/Отверстие/);near(details.cd.holeDiameter,36.9)}else assert.match(letter.svg,/Сгибы от левого края/);
 }
 const hub=project('cd-label');hub.layout.cdLabelHub=true;near(printShopSpecs(hub).cd.holeDiameter,14.957778);
});

test('CD export dialogs expose only relevant layouts and default to 600 dpi',()=>{
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const html=exportDialogHtml(project(mode));assert.doesNotMatch(html,/chalkpit|value="12up"/);assert.match(html,/id="exportDpi"><option>600<\/option>/);
  if(mode==='cd-label'){assert.match(html,/OL1200 \/ Avery 8692/);assert.match(html,/value="cd-2up"/)}else assert.match(html,/value="2up"/);
 }
 const p=project('cd-label'),state=exportControlState(p,{sheet:'cd-letter-2up'});assert.equal(state.paper,'letter');assert.equal(state.bleed,0);assert.equal(state.dpi,600);assert.equal(state.copies,2);assert.equal(state.fixedOffset,true);
});

test('CD Letter controls reset fixed values and restore custom settings after leaving the preset',()=>{
 const p=project('cd-label'),values={exportSheet:'auto',exportSelection:'all',exportPaper:'a4',exportBleed:'2',exportDpi:'300',exportOffsetX:'2',exportOffsetY:'-1',exportCopies:'1'};
 const fields=Object.fromEntries(['exportSheet','exportSelection','exportPaper','exportBleed','exportDpi','exportOffsetX','exportOffsetY','exportCopies','exportGuides','exportDuplex','exportQuantityLabel','exportLayoutHint'].map(id=>[id,{value:values[id]||'',checked:false,disabled:false}]));
 bindExportDialog(p,{get:id=>fields[id]});fields.exportSheet.value='cd-letter-2up';fields.exportSheet.onchange();assert.equal(fields.exportPaper.value,'letter');assert.equal(fields.exportPaper.disabled,true);assert.equal(fields.exportDpi.value,'600');assert.equal(fields.exportDpi.disabled,true);assert.equal(fields.exportBleed.value,'0');assert.equal(fields.exportCopies.value,'2');assert.equal(fields.exportOffsetX.value,'0');assert.equal(fields.exportDuplex.disabled,true);
 fields.exportSheet.value='cd-2up';fields.exportSheet.onchange();assert.equal(fields.exportPaper.value,'a4');assert.equal(fields.exportPaper.disabled,false);assert.equal(fields.exportDpi.value,'300');assert.equal(fields.exportDpi.disabled,false);assert.equal(fields.exportBleed.value,'2');assert.equal(fields.exportOffsetX.value,'2');assert.equal(fields.exportOffsetY.value,'-1');
});
