import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject} from '../src/model.js';
import {cassetteCutPath,cassetteCutouts} from '../src/cassette-template.js';
import {renderSvg} from '../src/render.js';
import {exportImagePages,exportProject,prepareExport} from '../src/export.js';

function plain(){const p=createProject();for(const surface of Object.keys(p.surfaces))p.surfaces[surface]=[];p.settings.bg='#282537';p.settings.bgB='#282537';return p}
const guideStroke=/stroke="(?:#91958a|#999|#aaa|#d000a0)"/;
const current=mode=>({mode,surface:mode==='label'?'labelA':'outer',selection:'current'});

test('ordinary J-card and label exports omit editor guides by default',()=>{
 const p=plain();assert.equal(p.settings.guides,true);
 for(const mode of ['jcard','label']){
  const options={...current(mode),bleed:2},prepared=prepareExport(p,options);
  assert.equal(prepared.options.guides,false);assert.doesNotMatch(prepared.items[0].svg,guideStroke);
  assert.doesNotMatch(exportImagePages(p,options)[0].svg,guideStroke);
  assert.match(renderSvg(p,options.surface).svg,guideStroke);
 }
});

test('explicit export guides keep the original cut contour outside the bleed window',()=>{
 const p=plain(),options={...current('label'),bleed:2};
 const clean=prepareExport(p,options).items[0],marked=prepareExport(p,{...options,guides:true}).items[0];
 assert.match(marked.svg,guideStroke);assert.ok(marked.svg.includes(`<path d="${cassetteCutouts(p.layout)}" fill="none" stroke="#999"`));
 assert.equal(clean.w,p.layout.labelW+4);assert.equal(clean.h,p.layout.labelH+4);
 assert.equal(marked.w,clean.w);assert.equal(marked.h,clean.h);
 const clip=`<path d="${cassetteCutPath(p.layout,2)}" clip-rule="evenodd" fill-rule="evenodd"/>`;
 assert.ok(clean.svg.includes(clip));assert.ok(marked.svg.includes(clip));
});

test('clean label pixels have no grey outline and retain the transparent opening with bleed',()=>{
 const p=plain(),before=JSON.stringify(p),options={...current('label'),bleed:2};
 const clean=prepareExport(p,options).items[0],marked=prepareExport(p,{...options,guides:true}).items[0];
 const raster=svg=>new Resvg(svg,{fitTo:{mode:'width',value:1200},font:{loadSystemFonts:false}}).render();
 const a=raster(clean.svg),b=raster(marked.svg),aPixels=a.pixels,bPixels=b.pixels;let grey=0,changed=0,unexpectedInk=0;
 for(let i=0;i<aPixels.length;i+=4){
  if(aPixels[i+3]===255&&(aPixels[i]!==40||aPixels[i+1]!==37||aPixels[i+2]!==55))unexpectedInk++;
  if(bPixels[i]===153&&bPixels[i+1]===153&&bPixels[i+2]===153&&bPixels[i+3]===255)grey++;
  if([0,1,2,3].some(channel=>aPixels[i+channel]!==bPixels[i+channel]))changed++;
 }
 assert.equal(unexpectedInk,0);assert.ok(grey>50);assert.ok(changed>1000);
 const alpha=(x,y)=>aPixels[(Math.floor((y+2)/clean.h*a.height)*a.width+Math.floor((x+2)/clean.w*a.width))*4+3];
 assert.equal(alpha(p.layout.labelW/2,p.layout.holeY+p.layout.holeH/2),0);
 assert.equal(alpha(p.layout.labelW/2,p.layout.holeY+1),255);
 assert.equal(alpha(p.layout.labelW/2,-1),255);
 assert.equal(JSON.stringify(p),before);
});

test('blank templates retain cut and fold lines even when export and editor guides are off',()=>{
 const p=plain();p.settings.guides=false;p.settings.cutGuides=false;p.settings.foldGuides=false;
 for(const mode of ['jcard','label']){
  const svg=prepareExport(p,{...current(mode),blank:true,guides:false}).items[0].svg;
  assert.match(svg,/stroke="#d000a0"/);
  assert.match(svg,mode==='label'?/stroke="#999"/:/stroke-dasharray="1 1"/);
 }
});

test('downloaded SVGs follow the clean default and explicit guide choice',async()=>{
 const saved=Object.fromEntries(['document','setTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,blobs=new Map(),downloads=[];let sequence=0;
 try{
  URL.createObjectURL=blob=>{const url='blob:guides-'+sequence++;blobs.set(url,blob);return url};URL.revokeObjectURL=()=>{};
  globalThis.setTimeout=()=>0;globalThis.document={createElement(type){assert.equal(type,'a');return {click(){downloads.push(blobs.get(this.href))}}}};
  for(const mode of ['jcard','label'])for(const guides of [undefined,true]){
   await exportProject(plain(),{...current(mode),format:'svg',bleed:2,...(guides===undefined?{}:{guides})});
   const svg=await downloads.at(-1).text();assert.equal(guideStroke.test(svg),guides===true);
  }
  assert.equal(downloads.length,4);
 }finally{
  URL.createObjectURL=create;URL.revokeObjectURL=revoke;
  for(const [key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
 }
});

test('production layouts keep their own marks independently of the optional artwork guides',()=>{
 const p=plain();p.layout.panels=3;
 const options={sheet:'chalkpit-jcard',selection:'current'},clean=prepareExport(p,options),marked=prepareExport(p,{...options,guides:true});
 assert.equal(clean.production,true);assert.equal(clean.options.guides,false);
 assert.equal(clean.items[0].svg,marked.items[0].svg);assert.match(clean.items[0].svg,/<rect[^>]+fill="black"/);
});
