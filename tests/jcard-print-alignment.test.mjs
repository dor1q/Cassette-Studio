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
 {panels:3,paper:'a4',sheet:'auto'},
 {panels:3,paper:'letter',sheet:'2up'},
 {panels:4,paper:'a4',sheet:'2up'},
 {panels:5,paper:'a4',sheet:'auto'},
 {panels:5,paper:'a3',sheet:'2up'},
 {panels:8,paper:'custom',sheet:'auto'}
];
function project({panels}){
 const p=createProject();p.editorMode='jcard';p.layout.panels=panels;p.layout.double=true;
 for(const surface of ['outer','inner'])p.surfaces[surface]=[];
 p.settings.bg=p.settings.bgInside='#ffffff';return p;
}
// The physical sheet flip reflects the binding coordinate. Artwork rotation
// cannot correct a print-position offset along that coordinate.
function throughPaper(point,plan,edge){
 const vertical=edge==='long'?plan.h>=plan.w:plan.h<plan.w;
 return {x:vertical?plan.w-point.x:point.x,y:vertical?point.y:plan.h-point.y};
}
function physicalBounds(pos,item,plan,edge){
 const corners=[[pos.x,pos.y],[pos.x+item.w,pos.y+item.h]].map(([x,y])=>throughPaper({x,y},plan,edge));
 return {x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),w:item.w,h:item.h};
}

test('J-card duplex print offsets align cut frames after a physical paper flip',()=>{
 for(const config of cases)for(const duplexFlip of ['long','short'])for(const [offsetX,offsetY]of [[3,4],[-2.5,-3]])for(const bleed of [0,2]){
  const p=project(config),prepared=prepareExport(p,{...config,duplexFlip,offsetX,offsetY,bleed,copies:3}),plan=printLayout(prepared.items,prepared.options);
  assert.deepEqual(plan.pages.map(page=>page.length),config.sheet==='2up'?[2,2,1,1]:[1,1,1,1,1,1]);
  for(let page=0;page<plan.pages.length;page+=2)for(const [slot,front]of plan.pages[page].entries()){
   const back=physicalBounds(plan.pages[page+1][slot],prepared.items[1],plan,duplexFlip);
   near(front.x,back.x);near(front.y,back.y);near(prepared.items[0].w,back.w);near(prepared.items[0].h,back.h);
  }
 }
});

test('current and reordered J-card inside retain the complete pair print position',()=>{
 for(const config of cases)for(const duplexFlip of ['long','short']){
  const p=project(config),options={...config,duplexFlip,offsetX:3,offsetY:-4,copies:3};
  const pair=prepareExport(p,options),current=prepareExport(p,{...options,selection:'current',surface:'inner'});
  const full=printLayout(pair.items,pair.options),inside=printLayout(current.items,current.options),reordered=printLayout([...pair.items].reverse(),pair.options);
  near(full.w,inside.w);near(full.h,inside.h);
  for(const [page,positions]of inside.pages.entries())for(const [slot,pos]of positions.entries()){
   const back=full.pages[page*2+1][slot],first=reordered.pages[page*2][slot];
   for(const key of ['x','y','rotation']){near(back[key],pos[key]);near(first[key],pos[key])}
  }
 }
});

test('legacy unnamed J-card pairs retain duplex registration and invalid offsets fail',()=>{
 const items=[{w:168,h:102},{w:168,h:102}];
 for(const duplexFlip of ['long','short']){
  const plan=printLayout(items,{offsetX:3,offsetY:4,duplexFlip});
  const back=physicalBounds(plan.pages[1][0],items[1],plan,duplexFlip);
  near(plan.pages[0][0].x,back.x);near(plan.pages[0][0].y,back.y);
 }
 const p=project({panels:4});
 for(const selection of ['all','current'])for(const duplexFlip of ['long','short']){
  const prepared=prepareExport(p,{paper:'custom',offsetX:11,offsetY:11,selection,surface:'inner',duplexFlip});
  assert.throws(()=>printLayout(prepared.items,prepared.options),/Смещение/);
 }
});

test('J-card PDF and print reject invalid displacement before allocating raster canvases',async()=>{
 const originalDocument=globalThis.document,originalImage=globalThis.Image;let images=0,draws=0;
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({getContext:()=>({drawImage:()=>draws++})})};
 globalThis.Image=class{constructor(){images++}set src(_value){queueMicrotask(()=>this.onload())}};
 try{
  for(const format of ['pdf','print']){
   const p=project({panels:4});
   await assert.rejects(exportProject(p,{format,paper:'custom',offsetX:11}),/Смещение/);
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
 assert.ok(count>20,'Rendered registration mark must remain visible');
 const scale=w/render.width;return {x:xsum/count*scale,y:ysum/count*scale};
}

test('actual SVG J-card sheet exports align asymmetric artwork on both faces',()=>{
 for(const config of [{panels:3,paper:'a4'},{panels:5,paper:'a3'}])for(const duplexFlip of ['long','short']){
  const p=project(config),d=dimensions(p,'outer'),mark={x:21,y:28,w:5,h:7,color:'#ff0000'};
  p.surfaces.outer=[makeLayer('shape',mark)];p.surfaces.inner=[makeLayer('shape',{...mark,x:d.w-mark.x-mark.w})];
  const options={...config,sheet:'2up',copies:1,duplexFlip,offsetX:3,offsetY:4},pages=exportImagePages(p,options);
  assert.equal(pages.length,2);near(pages[0].w,pages[1].w);near(pages[0].h,pages[1].h);
  const front=redCentroid(pages[0].svg,pages[0].w),back=throughPaper(redCentroid(pages[1].svg,pages[1].w),pages[1],duplexFlip);
  near(front.x,back.x,.3);near(front.y,back.y,.3);
 }
});

test('actual PDF J-card image positions retain paper size and physical duplex registration',()=>{
 const p=project({panels:5}),prepared=prepareExport(p,{paper:'a3',sheet:'2up',copies:3,duplexFlip:'long',offsetX:3,offsetY:4}),plan=printLayout(prepared.items,prepared.options);
 const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').render().asPng();
 const canvas={toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')},items=prepared.items.map(item=>({...item,canvas}));
 const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],orientation:plan.w>plan.h?'landscape':'portrait',compress:false});let rotations=0;
 writePrintPages(doc,items,plan,source=>{rotations++;return source});
 assert.equal(doc.getNumberOfPages(),4);assert.equal(rotations,0);near(doc.internal.pageSize.getWidth(),297);near(doc.internal.pageSize.getHeight(),420);
 const commands=[...doc.output().matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/I\d+ Do/g)];
 assert.equal(commands.length,6);const unit=25.4/72;
 const boxes=commands.map(match=>({w:Number(match[1])*unit,h:Number(match[2])*unit,x:Number(match[3])*unit,y:plan.h-(Number(match[4])+Number(match[2]))*unit}));
 for(const [frontIndex,backIndex]of [[0,2],[1,3],[4,5]]){
  const front=boxes[frontIndex],back=physicalBounds(boxes[backIndex],boxes[backIndex],plan,'long');near(front.x,back.x);near(front.y,back.y);near(front.w,back.w);near(front.h,back.h);
 }
});
