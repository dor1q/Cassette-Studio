import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject} from '../src/model.js';
import {setCassettePrintArea} from '../src/cassette-shell.js';
import {composePrintSheetSvg,exportImagePages,exportProject,orientedPageSvg,pngWithDpi,prepareExport} from '../src/export.js';
import {printLayout} from '../src/print-layout.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function plain(){const p=createProject();for(const s of Object.keys(p.surfaces))p.surfaces[s]=[];p.settings.bg='#ff0000';p.settings.bgB='#0000ff';return p}
function image(svg,w,h){const result=new Resvg(svg,{fitTo:{mode:'width',value:1200},font:{loadSystemFonts:false}}).render();return (x,y)=>{const i=(Math.floor(y*result.height/h)*result.width+Math.floor(x*result.width/w))*4;return Array.from(result.pixels.subarray(i,i+4))}}
function chunks(bytes){const records=[];for(let i=8;i<bytes.length;){const length=new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0);records.push({type:String.fromCharCode(...bytes.subarray(i+4,i+8)),data:bytes.subarray(i+8,i+8+length),raw:bytes.subarray(i,i+12+length)});i+=12+length}return records}
const samplePng=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',{font:{loadSystemFonts:false}}).render().asPng();

test('12-up PNG/SVG preparation produces Letter pages with the same A/B order as PDF',()=>{
 const p=plain(),pages=exportImagePages(p,{mode:'label',sheet:'12up',bleed:2,copies:7,guides:false});
 assert.equal(pages.length,2);for(const page of pages){close(page.w,215.9);close(page.h,279.4);assert.equal(page.dpi,300)}
 const pixel=image(pages[0].svg,pages[0].w,pages[0].h),unit=25.4/600;
 for(const y of [824,1816,2808,3800,4792,5783]){assert.deepEqual(pixel(1352*unit,y*unit-10),[255,0,0,255]);assert.deepEqual(pixel(3745*unit,y*unit-10),[0,0,255,255])}
 assert.deepEqual(image(pages[1].svg,pages[1].w,pages[1].h)(1352*unit,1816*unit-10),[255,255,255,255]);
 assert.equal((pages[0].svg.match(/clipPath id="print-sheet-cell-/g)||[]).length,12);
});

test('no-bleed sheets and shell production override incompatible user bleed consistently',()=>{
 const p=plain(),normal=prepareExport(p,{mode:'label',sheet:'12up-trim',bleed:3});
 assert.equal(normal.options.bleed,0);assert.equal(normal.items[0].w,88.6);assert.equal(normal.items[0].h,41.8);
 const page=exportImagePages(p,{mode:'label',sheet:'12up-trim',bleed:3,copies:6})[0];assert.doesNotMatch(page.svg,/print-sheet-cell-/);
 setCassettePrintArea(p,'full');const shell=prepareExport(p,{mode:'label',sheet:'chalkpit-cassette-4up',bleed:3});assert.equal(shell.options.bleed,0);assert.equal(shell.items[0].dpi,600);
});

test('SRA3 exports the front even if the inspector is on the inside; production offsets are rejected',()=>{
 const p=plain();p.layout.panels=3;p.layout.double=true;
 const pages=exportImagePages(p,{sheet:'chalkpit-jcard-8up',selection:'current',surface:'inner',copies:2});
 assert.equal(pages.length,2);assert.ok(pages.every(page=>page.s==='outer'&&page.dpi===300));
 assert.throws(()=>prepareExport(p,{sheet:'chalkpit-jcard',offsetY:.2}),/позиции фиксированы/);
});

test('reverse production image export rotates the artwork once, using its own pixel viewBox',()=>{
 const p=plain();p.layout.panels=3;p.layout.double=true;p.settings.bgInside='#00ff00';
 const pages=prepareExport(p,{sheet:'chalkpit-jcard',duplexFlip:'long'}).items;
 assert.equal(pages[1].rotation,180);
 const oriented=orientedPageSvg(pages[1]);assert.match(oriented,/rotate\(180 1282\.5 1247\)/);
 const exported=exportImagePages(p,{sheet:'chalkpit-jcard',duplexFlip:'long'});assert.equal(exported[1].rotation,0);assert.equal(exported[1].svg,oriented);
 const original=image(pages[1].svg,pages[1].pixelWidth,pages[1].pixelHeight),rotated=image(oriented,pages[1].pixelWidth,pages[1].pixelHeight);
 assert.deepEqual(rotated(200,200),original(pages[1].pixelWidth-200,pages[1].pixelHeight-200));
});

test('generic sheet composition applies PDF clipping and duplex rotation in physical coordinates',()=>{
 const items=[{w:80,h:40,svg:'<svg width="80mm" height="40mm" viewBox="0 0 80 40"><rect width="80" height="40" fill="red"/><rect width="20" height="10" fill="blue"/></svg>'}];
 const page=[{item:0,x:10,y:20,rotation:180,clip:{x:10,y:20,w:80,h:40}}],svg=composePrintSheetSvg(items,page,210,297),pixel=image(svg,210,297);
 assert.deepEqual(pixel(80,55),[0,0,255,255]);assert.deepEqual(pixel(20,25),[255,0,0,255]);assert.deepEqual(pixel(9,20),[255,255,255,255]);
 assert.match(svg,/viewBox="0 0 210 297"/);
 const plan=printLayout([{w:168,h:102},{w:168,h:102}],{sheet:'2up',copies:2,duplexFlip:'short'});assert.equal(plan.pages[1][0].rotation,180);
});

test('PNG resolution metadata keeps image data readable and replaces an existing resolution',async()=>{
 const source=new Blob([samplePng],{type:'image/png'}),output=await pngWithDpi(source,600),bytes=new Uint8Array(await output.arrayBuffer()),records=chunks(bytes),physical=records.filter(chunk=>chunk.type==='pHYs');
 assert.equal(physical.length,1);assert.equal(new DataView(physical[0].data.buffer,physical[0].data.byteOffset,9).getUint32(0),23622);assert.equal(physical[0].data[8],1);
 assert.deepEqual(records.filter(c=>c.type==='IDAT').map(c=>Array.from(c.data)),chunks(samplePng).filter(c=>c.type==='IDAT').map(c=>Array.from(c.data)));
 const replaced=chunks(new Uint8Array(await (await pngWithDpi(output,300)).arrayBuffer()));assert.equal(replaced.filter(c=>c.type==='pHYs').length,1);
 assert.equal(new DataView(replaced.find(c=>c.type==='pHYs').data.buffer,replaced.find(c=>c.type==='pHYs').data.byteOffset,9).getUint32(0),11811);
 const rendered=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><image href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}" width="8" height="8"/></svg>`,{font:{loadSystemFonts:false}}).render();assert.deepEqual(Array.from(rendered.pixels.subarray(0,4)),[255,0,0,255]);
 await assert.rejects(pngWithDpi(new Blob(['broken']),300),/PNG/);await assert.rejects(pngWithDpi(source,NaN),/разрешение/);
});

test('production downloads use unique page names and actual 600 dpi; clipboard reports page count',async()=>{
 const saved={},downloads=[],sizes=[],blobs=new Map();let sequence=0,clipboard=[];
 for(const key of ['document','Image','ClipboardItem','navigator','setTimeout'])saved[key]=Object.getOwnPropertyDescriptor(globalThis,key);
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 try{
  URL.createObjectURL=blob=>{const url='blob:test-'+sequence++;blobs.set(url,blob);return url};URL.revokeObjectURL=()=>{};
  globalThis.setTimeout=()=>0;
  globalThis.document={fonts:{ready:Promise.resolve()},createElement(type){if(type==='a')return {click(){downloads.push({name:this.download,blob:blobs.get(this.href)})}};assert.equal(type,'canvas');return {width:0,height:0,getContext(){return {drawImage(){}}},toBlob(callback){sizes.push([this.width,this.height]);callback(new Blob([samplePng],{type:'image/png'}))}}}};
  globalThis.Image=class{set src(url){this.url=url;queueMicrotask(()=>this.onload())}};
  globalThis.ClipboardItem=class{constructor(data){this.data=data}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async write(items){clipboard=items}}}});
  const p=plain();p.layout.panels=3;p.layout.double=true;
  await exportProject(p,{format:'png',sheet:'chalkpit-jcard',copies:2,dpi:150});
  assert.equal(downloads.length,4);assert.equal(new Set(downloads.map(d=>d.name)).size,4);assert.ok(downloads.every(d=>d.name.endsWith('-600dpi.png')));assert.deepEqual(sizes,Array(4).fill([2565,2494]));
  const result=await exportProject(p,{format:'clipboard',sheet:'chalkpit-jcard',copies:2});assert.deepEqual(result,{copiedPages:1,totalPages:4});assert.equal(clipboard.length,1);assert.equal(clipboard[0].data['image/png'].type,'image/png');
  globalThis.ClipboardItem=undefined;await assert.rejects(exportProject(p,{format:'clipboard'}),/Сохраните PNG/);
 }finally{
  URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;for(const [key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
 }
});
