import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject} from '../src/model.js';
import {bindExportDialog,exportDialogHtml,cdPrintPaperState} from '../src/export-dialog.js';
import {prepareExport,exportImagePages,exportProject} from '../src/export.js';
import {printLayout} from '../src/print-layout.js';

function project(mode='cd-insert',layout={}){
 const p=createProject();p.editorMode=mode;Object.assign(p.layout,layout);return p;
}
function dialog(p,values={}){
 const defaults={exportSheet:'auto',exportSelection:'all',exportPaper:'a4',exportBleed:'0',exportDpi:'600',exportOffsetX:'0',exportOffsetY:'0',exportCopies:'1',exportDuplex:'long'};
 const fields=Object.fromEntries(['exportSheet','exportSelection','exportPaper','exportBleed','exportDpi','exportOffsetX','exportOffsetY','exportCopies','exportGuides','exportDuplex','exportQuantityLabel','exportLayoutHint'].map(id=>[id,{value:values[id]??defaults[id]??'',checked:false,disabled:false}]));
 fields.exportSelection.options=[{textContent:'Лицевая и оборот'},{textContent:'Только текущая'}];
 bindExportDialog(p,{get:id=>fields[id]});return fields;
}
function printed(p,fields){
 const prepared=prepareExport(p,{paper:fields.exportPaper.value,sheet:fields.exportSheet.value,copies:fields.exportCopies.value,bleed:Number(fields.exportBleed.value),offsetX:Number(fields.exportOffsetX.value),offsetY:Number(fields.exportOffsetY.value),duplexFlip:fields.exportDuplex.value});
 return {prepared,plan:printLayout(prepared.items,prepared.options)};
}

test('opening three-panel CD Insert chooses A3 and the actual export keeps full physical dimensions',()=>{
 const p=project('cd-insert',{cdInsertPanels:3,cdInsertDouble:true}),fields=dialog(p);
 assert.equal(fields.exportPaper.value,'a3');assert.equal(fields.exportPaper.disabled,false);assert.equal(fields.exportDuplex.disabled,false);
 assert.doesNotMatch(fields.exportLayoutHint.textContent,/не помещается/);
 const {prepared,plan}=printed(p,fields);assert.equal(plan.w,420);assert.equal(plan.h,297);assert.equal(plan.pages.length,2);
 assert.ok(Math.abs(prepared.items[0].w-358.817333333333)<1e-6);assert.ok(Math.abs(prepared.items[0].h-120.65)<1e-6);
});

test('paper preview clamps manually typed values exactly like the download callback',()=>{
 const p=project('cd-insert',{cdInsertPanels:1,cdInsertHeight:123.5});
 const bounded={mode:'cd-insert',paper:'a4',sheet:'2up',copies:2,bleed:5,offsetX:0,offsetY:0};
 assert.equal(cdPrintPaperState(p,bounded).fits,true);
 assert.deepEqual(cdPrintPaperState(p,{...bounded,bleed:6}),cdPrintPaperState(p,bounded));
 assert.deepEqual(cdPrintPaperState(p,{...bounded,copies:50,offsetX:21,offsetY:-21}),cdPrintPaperState(p,{...bounded,copies:30,offsetX:20,offsetY:-20}));
});

test('a fitting paper selection is kept when opening the CD export dialog',()=>{
 for(const paper of ['a3','tabloid','custom']){
  const p=project('cd-insert',{cdInsertPanels:3}),fields=dialog(p,{exportPaper:paper});
  assert.equal(fields.exportPaper.value,paper);assert.doesNotMatch(fields.exportLayoutHint.textContent,/не помещается/);assert.doesNotThrow(()=>printed(p,fields));
 }
 const p=project('cd-insert',{cdInsertPanels:2}),fields=dialog(p,{exportPaper:'letter'});
 assert.equal(fields.exportPaper.value,'letter');assert.doesNotThrow(()=>printed(p,fields));
});

test('switching a two-panel CD Insert to two-up defaults to two copies and a fitting A3 sheet',()=>{
 const p=project('cd-insert',{cdInsertPanels:2}),fields=dialog(p);
 assert.equal(fields.exportPaper.value,'a4');assert.equal(fields.exportCopies.value,'1');
 fields.exportSheet.value='2up';fields.exportSheet.onchange();
 assert.equal(fields.exportPaper.value,'a3');assert.equal(fields.exportCopies.value,'2');
 const {prepared,plan}=printed(p,fields);assert.equal(plan.w,297);assert.equal(plan.h,420);assert.equal(plan.pages.length,1);assert.equal(plan.pages[0].length,2);
 assert.equal(prepared.items[0].w,241.3);assert.equal(plan.pages[0][1].y-plan.pages[0][0].y,130.65);
});

test('manual paper is never silently replaced; an invalid choice is explained before download',()=>{
 const p=project('cd-insert',{cdInsertPanels:3}),fields=dialog(p);
 fields.exportPaper.value='a4';fields.exportPaper.onchange();
 assert.equal(fields.exportPaper.value,'a4');assert.match(fields.exportLayoutHint.textContent,/не помещается/);assert.match(fields.exportLayoutHint.textContent,/Выберите A3/);
 fields.exportSheet.value='2up';fields.exportSheet.onchange();assert.equal(fields.exportPaper.value,'a4');assert.match(fields.exportLayoutHint.textContent,/не помещается/);
 fields.exportPaper.value='a3';fields.exportPaper.onchange();assert.equal(fields.exportPaper.value,'a3');assert.doesNotMatch(fields.exportLayoutHint.textContent,/не помещается/);assert.doesNotThrow(()=>printed(p,fields));
});

test('bleed input recalculates fit immediately while preserving the chosen paper',()=>{
 const p=project('cd-insert',{cdInsertPanels:1,cdInsertHeight:132}),fields=dialog(p);
 fields.exportSheet.value='2up';fields.exportSheet.onchange();assert.equal(fields.exportPaper.value,'a4');assert.doesNotThrow(()=>printed(p,fields));
 fields.exportBleed.value='1';fields.exportBleed.oninput();
 assert.equal(fields.exportPaper.value,'a4');assert.match(fields.exportLayoutHint.textContent,/Два макета не помещаются/);assert.match(fields.exportLayoutHint.textContent,/Выберите A3/);assert.throws(()=>printed(p,fields),/Два макета не помещаются/);
 fields.exportBleed.value='0';fields.exportBleed.onchange();assert.doesNotMatch(fields.exportLayoutHint.textContent,/не помещается/);assert.doesNotThrow(()=>printed(p,fields));
});

test('copy and offset input callbacks refresh the CD print warning without resetting quantity',()=>{
 const p=project('cd-label',{cdLabelDiameter:188}),fields=dialog(p,{exportPaper:'a4'});
 fields.exportCopies.value='7';fields.exportCopies.oninput();assert.equal(fields.exportCopies.value,'7');
 fields.exportOffsetX.value='20';fields.exportOffsetX.oninput();assert.match(fields.exportLayoutHint.textContent,/Смещение выводит/);assert.equal(fields.exportPaper.value,'a4');assert.equal(fields.exportCopies.value,'7');
 fields.exportOffsetX.value='0';fields.exportCopies.onchange();assert.doesNotMatch(fields.exportLayoutHint.textContent,/Смещение выводит/);assert.doesNotThrow(()=>printed(p,fields));
});

test('leaving fixed Avery restores manual ordinary settings and warns instead of changing them',()=>{
 const p=project('cd-label',{cdLabelDiameter:190}),fields=dialog(p,{exportPaper:'letter',exportBleed:'2',exportDpi:'300',exportOffsetX:'2',exportOffsetY:'-1'});
 fields.exportPaper.value='letter';fields.exportPaper.onchange();
 fields.exportSheet.value='cd-letter-2up';fields.exportSheet.onchange();assert.equal(fields.exportPaper.value,'letter');assert.equal(fields.exportPaper.disabled,true);assert.equal(fields.exportBleed.value,'0');
 fields.exportSheet.value='cd-2up';fields.exportSheet.onchange();
 assert.equal(fields.exportPaper.value,'letter');assert.equal(fields.exportPaper.disabled,false);assert.equal(fields.exportBleed.value,'2');assert.equal(fields.exportDpi.value,'300');assert.equal(fields.exportOffsetX.value,'2');assert.equal(fields.exportOffsetY.value,'-1');assert.equal(fields.exportCopies.value,'2');assert.match(fields.exportLayoutHint.textContent,/не помещаются/);
});

test('single-sided CD Insert and Tray disable duplex controls; their double-sided versions enable them',()=>{
 for(const [mode,key]of [['cd-insert','cdInsertDouble'],['cd-tray','cdTrayDouble']]){
  const p=project(mode,{[key]:false}),single=dialog(p);assert.equal(single.exportDuplex.disabled,true);
  p.layout[key]=true;const double=dialog(p);assert.equal(double.exportDuplex.disabled,false);
 }
 assert.equal(dialog(project('cd-label')).exportDuplex.disabled,true);
});

test('two-up CD Tray starts with two copies and preserves a fitting ordinary Letter sheet',()=>{
 const p=project('cd-tray'),fields=dialog(p,{exportPaper:'letter'});
 fields.exportSheet.value='2up';fields.exportSheet.onchange();assert.equal(fields.exportCopies.value,'2');assert.equal(fields.exportPaper.value,'letter');assert.equal(printed(p,fields).plan.pages[0].length,2);
});

test('the separate print-ready PNG action appears only for CD Label',()=>{
 assert.match(exportDialogHtml(project('cd-label')),/data-format="cd-print-ready">PNG для печати CD/);
 for(const mode of ['jcard','label','cd-insert','cd-tray'])assert.doesNotMatch(exportDialogHtml(project(mode)),/cd-print-ready/);
});

test('print-ready export normalizes unrelated dialog options without changing the project',()=>{
 const p=project('cd-label'),before=JSON.stringify(p),prepared=prepareExport(p,{cdPrintReady:true,format:'svg',surface:'outer',selection:'all',blank:true,bleed:5,dpi:150,copies:7,guides:true,sheet:'chalkpit-jcard',offsetX:20,offsetY:-20});
 assert.deepEqual(prepared.items.map(item=>item.s),['cdLabel']);
 for(const [key,value]of Object.entries({format:'png',surface:'cdLabel',selection:'current',blank:false,bleed:0,dpi:600,copies:1,guides:false,sheet:'auto',offsetX:0,offsetY:0}))assert.equal(prepared.options[key],value,key);
 assert.equal(JSON.stringify(p),before);
 for(const mode of ['jcard','label','cd-insert','cd-tray'])assert.throws(()=>prepareExport(project(mode),{cdPrintReady:true}),/только.*CD Label/);
});

test('print-ready CD PNG preserves its full 600 dpi frame and clips to the safe Standard or Hub ring',()=>{
 for(const hub of [false,true]){
  const p=project('cd-label',{cdLabelHub:hub});p.surfaces.cdLabel=[];p.settings.bg='#112233';
  const normal=exportImagePages(p,{bleed:0,guides:false})[0],ready=exportImagePages(p,{cdPrintReady:true,bleed:5,guides:true,sheet:'cd-letter-2up'})[0];
  assert.equal(ready.w,normal.w);assert.equal(ready.h,normal.h);assert.equal(ready.dpi,600);
  const render=page=>new Resvg(page.svg,{fitTo:{mode:'width',value:Math.round(page.w/25.4*page.dpi)},font:{loadSystemFonts:false}}).render();
  const a=render(normal),b=render(ready),alpha=(png,radius)=>{const center=png.width/2,x=Math.floor(center+radius/ready.w*png.width),y=Math.floor(center);return png.pixels[(y*png.width+x)*4+3]};
  assert.equal(b.width,2837);assert.equal(b.height,2837);
  assert.equal(alpha(b,0),0);assert.equal(alpha(a,58.3),255);assert.equal(alpha(b,58.3),0);assert.equal(alpha(b,40),255);
  const inner=hub?9:20;assert.equal(alpha(a,inner),255);assert.equal(alpha(b,inner),0);
 }
});

test('the real print-ready export callback downloads one distinct PNG with 600 dpi metadata',async()=>{
 const p=project('cd-label');p.title='Album';p.surfaces.cdLabel=[];
 const original={document:globalThis.document,Image:globalThis.Image,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL},objects=new Map(),downloads=[];let next=0;
 URL.createObjectURL=blob=>{const url='blob:cd-test-'+(++next);objects.set(url,blob);return url};URL.revokeObjectURL=url=>objects.delete(url);
 globalThis.setTimeout=(callback,delay,...args)=>delay===15000?(callback(...args),0):original.setTimeout(callback,delay,...args);
 globalThis.Image=class{set src(url){objects.get(url).text().then(svg=>{this.svg=svg;this.onload()}).catch(error=>this.onerror(error))}};
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:kind=>{
  if(kind==='a'){const link={click:()=>downloads.push({name:link.download,blob:objects.get(link.href)})};return link}
  if(kind==='canvas'){const canvas={width:0,height:0,getContext:()=>({drawImage:image=>{canvas.svg=image.svg}}),toBlob:callback=>callback(new Blob([new Resvg(canvas.svg,{fitTo:{mode:'width',value:canvas.width},font:{loadSystemFonts:false}}).render().asPng()],{type:'image/png'}))};return canvas}
  throw Error('Unexpected document element '+kind);
 }};
 try{
  await exportProject(p,{cdPrintReady:true,format:'png',dpi:150,bleed:5,guides:true,sheet:'cd-letter-2up',copies:5});
  assert.equal(downloads.length,1);assert.equal(downloads[0].name,'Album-cdLabel-print-ready-600dpi.png');assert.equal(downloads[0].blob.type,'image/png');
  const bytes=new Uint8Array(await downloads[0].blob.arrayBuffer());let at=8,physical;
  while(at+12<=bytes.length){const view=new DataView(bytes.buffer,bytes.byteOffset+at),length=view.getUint32(0),type=String.fromCharCode(...bytes.subarray(at+4,at+8));if(type==='pHYs')physical={x:view.getUint32(8),y:view.getUint32(12),unit:bytes[at+16]};at+=length+12}
  assert.deepEqual(physical,{x:23622,y:23622,unit:1});assert.equal(objects.size,0);
 }finally{
  if(original.document===undefined)delete globalThis.document;else globalThis.document=original.document;
  if(original.Image===undefined)delete globalThis.Image;else globalThis.Image=original.Image;
  globalThis.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;
 }
});
