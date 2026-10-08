import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {jsPDF} from 'jspdf';
import {createProject,dimensions,makeLayer} from '../src/model.js';
import {prepareExport,exportImagePages,exportProject} from '../src/export.js';
import {printLayout} from '../src/print-layout.js';
import {writePrintPages} from '../src/print-pdf.js';

const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const cases=[
 {mode:'cd-insert',panels:1,paper:'a4',sheet:'auto'},
 {mode:'cd-insert',panels:1,paper:'a4',sheet:'2up'},
 {mode:'cd-insert',panels:2,paper:'a4',sheet:'auto'},
 {mode:'cd-insert',panels:2,paper:'a3',sheet:'2up'},
 {mode:'cd-insert',panels:3,paper:'a3',sheet:'auto'},
 {mode:'cd-insert',panels:3,paper:'a3',sheet:'2up'},
 {mode:'cd-tray',paper:'a4',sheet:'auto'},
 {mode:'cd-tray',paper:'a4',sheet:'2up'}
];
function project({mode,panels}){
 const p=createProject();p.editorMode=mode;p.layout.cdInsertPanels=panels||1;
 p.layout.cdInsertDouble=true;p.layout.cdTrayDouble=true;
 for(const surface of ['cdFront','cdInside','cdTray','cdTrayInside'])p.surfaces[surface]=[];
 p.settings.bg=p.settings.bgInside='#ffffff';return p;
}
// A physical paper flip reflects one sheet coordinate, independently of
// the artwork rotation used by the exporter.
function throughPaper(point,plan,edge){
 const verticalBinding=edge==='long'?plan.h>=plan.w:plan.h<plan.w;
 return {x:verticalBinding?plan.w-point.x:point.x,y:verticalBinding?point.y:plan.h-point.y};
}
function physicalBounds(pos,item,plan,edge){
 const corners=[[pos.x,pos.y],[pos.x+item.w,pos.y+item.h]].map(([x,y])=>throughPaper({x,y},plan,edge));
 return {x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),w:item.w,h:item.h};
}

test('CD duplex offsets keep every cut frame aligned after a physical paper flip',()=>{
 for(const config of cases)for(const duplexFlip of ['long','short'])for(const [offsetX,offsetY]of [[3,4],[-2.5,-3]])for(const bleed of [0,2]){
  const p=project(config),options={...config,duplexFlip,offsetX,offsetY,bleed,copies:3};
  const prepared=prepareExport(p,options),plan=printLayout(prepared.items,prepared.options);
  assert.deepEqual(plan.pages.map(page=>page.length),config.sheet==='2up'?[2,2,1,1]:[1,1,1,1,1,1]);
  for(let page=0;page<plan.pages.length;page+=2)for(const [slot,front]of plan.pages[page].entries()){
   const back=physicalBounds(plan.pages[page+1][slot],prepared.items[1],plan,duplexFlip);
   near(front.x,back.x);near(front.y,back.y);near(prepared.items[0].w,back.w);near(prepared.items[0].h,back.h);
  }
 }
});

test('current CD inside uses the exact displaced seat of the complete duplex pair',()=>{
 for(const config of cases)for(const duplexFlip of ['long','short']){
  const p=project(config),options={...config,duplexFlip,offsetX:3,offsetY:-4,copies:3};
  const pair=prepareExport(p,options),inside=prepareExport(p,{...options,selection:'current',surface:config.mode==='cd-insert'?'cdInside':'cdTrayInside'});
  const a=printLayout(pair.items,pair.options),b=printLayout(inside.items,inside.options);
  near(a.w,b.w);near(a.h,b.h);
  for(const [page,positions]of b.pages.entries())for(const [slot,pos]of positions.entries()){
   const full=a.pages[page*2+1][slot];near(full.x,pos.x);near(full.y,pos.y);assert.equal(full.rotation,pos.rotation);
  }
 }
});

test('ordinary CD copy seats repeat without drift and offsets cannot clip either face',()=>{
 for(const config of cases){
  const p=project(config),prepared=prepareExport(p,{...config,copies:3,offsetX:2,offsetY:3}),plan=printLayout(prepared.items,prepared.options);
  near(plan.pages[0][0].x,plan.pages[2][0].x);near(plan.pages[0][0].y,plan.pages[2][0].y);
  near(plan.pages[1][0].x,plan.pages[3][0].x);near(plan.pages[1][0].y,plan.pages[3][0].y);
 }
 const p=project({mode:'cd-tray'}),prepared=prepareExport(p,{paper:'custom',offsetX:11,duplexFlip:'long'});
 assert.throws(()=>printLayout(prepared.items,prepared.options),/Смещение/);
 const inside=prepareExport(p,{paper:'custom',offsetX:11,duplexFlip:'long',selection:'current',surface:'cdTrayInside'});
 assert.throws(()=>printLayout(inside.items,inside.options),/Смещение/);
});

test('actual PDF and print exports reject an invalid CD paper plan before allocating raster canvases',async()=>{
 const originalDocument=globalThis.document,originalImage=globalThis.Image;let images=0,draws=0;
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({getContext:()=>({drawImage:()=>draws++})})};
 globalThis.Image=class{constructor(){images++}set src(_value){queueMicrotask(()=>this.onload())}};
 try{
  for(const format of ['pdf','print']){
   const p=project({mode:'cd-insert',panels:3});
   await assert.rejects(exportProject(p,{format,paper:'a4'}),/не помещается/);
   const shifted=project({mode:'cd-tray'});
   await assert.rejects(exportProject(shifted,{format,paper:'custom',offsetX:11}),/Смещение/);
  }
  assert.equal(images,0);assert.equal(draws,0);
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalImage===undefined)delete globalThis.Image;else globalThis.Image=originalImage}
});

function redCentroid(svg,w){
 const render=new Resvg(svg,{fitTo:{mode:'width',value:Math.round(w*4)},font:{loadSystemFonts:false}}).render();
 const pixels=render.pixels;let xsum=0,ysum=0,count=0;
 for(let y=0;y<render.height;y++)for(let x=0;x<render.width;x++){
  const at=(y*render.width+x)*4;
  if(pixels[at]>240&&pixels[at+1]<15&&pixels[at+2]<15){xsum+=x+.5;ysum+=y+.5;count++}
 }
 assert.ok(count>20,'The actual rendered registration mark must be visible');
 const scale=w/render.width;return {x:xsum/count*scale,y:ysum/count*scale};
}
test('native SVG sheet exports align asymmetric artwork marks on both CD faces',()=>{
 for(const config of [{mode:'cd-insert',panels:1,paper:'a4'},{mode:'cd-insert',panels:2,paper:'a3'},{mode:'cd-insert',panels:3,paper:'a3'},{mode:'cd-tray',paper:'a4'}])for(const duplexFlip of ['long','short']){
  const p=project(config),front=config.mode==='cd-insert'?'cdFront':'cdTray',inside=config.mode==='cd-insert'?'cdInside':'cdTrayInside',d=dimensions(p,front);
  const mark={x:21,y:28,w:5,h:7,color:'#ff0000'};
  p.surfaces[front]=[makeLayer('shape',mark)];p.surfaces[inside]=[makeLayer('shape',{...mark,x:d.w-mark.x-mark.w})];
  const options={...config,sheet:'2up',copies:1,duplexFlip,offsetX:3,offsetY:4},pages=exportImagePages(p,options);
  assert.equal(pages.length,2);near(pages[0].w,pages[1].w);near(pages[0].h,pages[1].h);
  const a=redCentroid(pages[0].svg,pages[0].w),b=throughPaper(redCentroid(pages[1].svg,pages[1].w),pages[1],duplexFlip);
  near(a.x,b.x,.3);near(a.y,b.y,.3);
 }
});

test('PDF CD duplex image positions retain physical registration and the exact paper size',()=>{
 const p=project({mode:'cd-insert',panels:3}),prepared=prepareExport(p,{paper:'a3',sheet:'2up',copies:3,duplexFlip:'long',offsetX:3,offsetY:4}),plan=printLayout(prepared.items,prepared.options);
 const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').render().asPng();
 const canvas={toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')},items=prepared.items.map(item=>({...item,canvas}));
 const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],orientation:'landscape',compress:false});let rotations=0;
 writePrintPages(doc,items,plan,source=>{rotations++;return source});
 assert.equal(doc.getNumberOfPages(),4);assert.equal(rotations,3);near(doc.internal.pageSize.getWidth(),420);near(doc.internal.pageSize.getHeight(),297);
 const commands=[...doc.output().matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/I\d+ Do/g)];
 assert.equal(commands.length,6);const unit=25.4/72;
 const boxes=commands.map(match=>({w:Number(match[1])*unit,h:Number(match[2])*unit,x:Number(match[3])*unit,y:plan.h-(Number(match[4])+Number(match[2]))*unit}));
 for(const [frontIndex,backIndex]of [[0,2],[1,3],[4,5]]){
  const a=boxes[frontIndex],b=physicalBounds(boxes[backIndex],boxes[backIndex],plan,'long');near(a.x,b.x);near(a.y,b.y);near(a.w,b.w);near(a.h,b.h);
 }
});
