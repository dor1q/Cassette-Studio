import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
import {clone,createProject,makeLayer} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {pngWithDpi} from '../src/export.js';

// Run the actual application callback. Native SVG rendering supplies the PNG;
// only the canvas/clipboard/download boundary is replaced, without a browser.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const callback=app.slice(app.indexOf('async function exportDecals('),app.indexOf("\n$('copyImage').onclick="));
assert.match(callback,/async function exportDecals/);
const artwork=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00ff00"/><rect width="4" height="4" fill="#ff0000"/></svg>',{font:{loadSystemFonts:false}}).render().asPng();
const source='data:image/png;base64,'+artwork.toString('base64');
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}}
function project(){
 const p=createProject();p.layout.panels=3;
 for(const surface of Object.keys(p.surfaces))p.surfaces[surface]=[];
 p.surfaces.outer=[
  makeLayer('image',{name:'Excluded background',category:'background',src:source,x:0,y:0,w:100,h:100}),
  makeLayer('image',{name:'Decal',category:'decals',src:source,x:10,y:10,w:20,h:20,fit:'stretch'}),
  makeLayer('image',{name:'Studio logo',category:'studio',src:source,x:40,y:10,w:10,h:10,fit:'stretch'}),
  makeLayer('text',{name:'Excluded title',text:'Title',x:60,y:10,w:30,h:15,color:'#0000ff'})
 ];
 p.surfaces.labelB=[makeLayer('image',{name:'Other surface decal',category:'decals',src:source,x:3,y:3,w:20,h:20})];
 return p;
}
function harness(initial,{wait}={}){
 const calls={renders:[],downloads:[],clipboard:[],toasts:[],raw:[]};
 const render=(project,surface,options)=>{calls.renders.push({project:clone(project),surface,options});return renderSvg(project,surface,options)};
 const raster=async(svg,w,h,dpi)=>{
  const png=new Resvg(svg,{fitTo:{mode:'width',value:Math.round(w/25.4*dpi)},font:{loadSystemFonts:false}}).render().asPng();
  const raw=new Blob([png],{type:'image/png'});calls.raw.push({blob:raw,w,h,dpi});
  if(wait)await wait.promise;
  return {toBlob:callback=>callback(raw)};
 };
 const navigator={clipboard:{write:async items=>calls.clipboard.push(...items)}};
 const ClipboardItem=class{constructor(data){this.data=data}};
 return new Function('initial','clone','renderSvg','raster','pngWithDpi','navigator','ClipboardItem','calls',`
  let p=initial,surface='outer';
  const toast=message=>calls.toasts.push(message),download=(blob,name)=>calls.downloads.push({blob,name});
  ${callback}
  return {run:exportDecals,state:()=>({p,surface}),setSurface:next=>surface=next,replace:next=>p=next,calls};
 `)(initial,clone,render,raster,pngWithDpi,navigator,ClipboardItem,calls);
}
function pngChunks(bytes){
 const chunks=[];
 for(let at=8;at<bytes.length;){
  const length=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0);
  chunks.push({type:String.fromCharCode(...bytes.subarray(at+4,at+8)),data:bytes.subarray(at+8,at+8+length)});
  at+=length+12;
 }
 return chunks;
}
async function assertExport(blob,h){
 assert.equal(blob.type,'image/png');
 const bytes=new Uint8Array(await blob.arrayBuffer()),raw=new Uint8Array(await h.calls.raw[0].blob.arrayBuffer());
 const chunks=pngChunks(bytes),physical=chunks.filter(chunk=>chunk.type==='pHYs');
 assert.equal(physical.length,1);
 const density=new DataView(physical[0].data.buffer,physical[0].data.byteOffset,9);
 assert.equal(density.getUint32(0),23622);assert.equal(density.getUint32(4),23622);assert.equal(physical[0].data[8],1);
 assert.deepEqual(chunks.filter(chunk=>chunk.type==='IDAT').map(chunk=>Array.from(chunk.data)),pngChunks(raw).filter(chunk=>chunk.type==='IDAT').map(chunk=>Array.from(chunk.data)));
 const {w,h:height,dpi}=h.calls.raw[0];assert.equal(dpi,600);
 const image=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}"><image width="${w}" height="${height}" href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}"/></svg>`,{fitTo:{mode:'width',value:Math.round(w/25.4*dpi)},font:{loadSystemFonts:false}}).render();
 const pixels=image.pixels,pixel=(x,y)=>{
  const offset=(Math.floor(y*image.height/height)*image.width+Math.floor(x*image.width/w))*4;
  return Array.from(pixels.subarray(offset,offset+4));
 };
 assert.deepEqual(pixel(12,12),[255,0,0,255]);assert.deepEqual(pixel(27,27),[0,255,0,255]);
 assert.deepEqual(pixel(41,11),[255,0,0,255]);assert.deepEqual(pixel(49,19),[0,255,0,255]);
 assert.equal(pixel(5,5)[3],0);assert.equal(pixel(70,20)[3],0);
}

test('actual decals download reports 600 dpi while keeping image pixels and project layers intact',async()=>{
 const original=project(),before=clone(original),h=harness(original);await h.run();
 assert.deepEqual(original,before);assert.equal(h.calls.downloads.length,1);assert.equal(h.calls.clipboard.length,0);
 assert.equal(h.calls.downloads[0].name,'decals-600dpi.png');assert.deepEqual(h.calls.renders[0].project.surfaces.outer,before.surfaces.outer.filter(layer=>['decals','studio'].includes(layer.category)));
 assert.deepEqual(h.calls.renders[0].options,{onlyLayers:true,guides:false});
 await assertExport(h.calls.downloads[0].blob,h);
});

test('actual decals clipboard keeps the selected surface snapshot when project and surface change during rendering',async()=>{
 const original=project(),before=clone(original),wait=deferred(),h=harness(original,{wait});
 const pending=h.run(true),replacement=createProject();h.setSurface('labelB');h.replace(replacement);original.surfaces.outer[1].x=80;
 wait.resolve();await pending;
 assert.equal(h.state().p,replacement);assert.equal(h.state().surface,'labelB');assert.equal(h.calls.renders[0].surface,'outer');
 assert.deepEqual(h.calls.renders[0].project.surfaces.outer,before.surfaces.outer.filter(layer=>['decals','studio'].includes(layer.category)));
 assert.equal(h.calls.downloads.length,0);assert.equal(h.calls.clipboard.length,1);assert.match(h.calls.toasts.at(-1),/600 dpi/);
 await assertExport(h.calls.clipboard[0].data['image/png'],h);
});

test('actual decals export reports an empty selection without producing a blank file or changing layers',async()=>{
 const original=project();original.surfaces.outer=original.surfaces.outer.filter(layer=>!['decals','studio'].includes(layer.category));
 const before=clone(original),h=harness(original);await h.run();
 assert.deepEqual(original,before);assert.equal(h.calls.renders.length,0);assert.equal(h.calls.raw.length,0);assert.equal(h.calls.downloads.length,0);assert.equal(h.calls.clipboard.length,0);
 assert.match(h.calls.toasts.at(-1),/Добавьте декали/);
});
