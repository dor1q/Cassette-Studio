import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,boundText} from '../src/model.js';
import {textLayout,renderSvg} from '../src/render.js';
import {renderStyledLine} from '../src/spine-text.js';
import {Resvg} from '@resvg/resvg-js';

const metric=(text,style,size)=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)).length*size;
const layer=props=>makeLayer('text',{size:3,w:30,h:30,autoFit:false,lineHeight:1.2,...props});

test('an album-only spine uses its own smaller face for line height and baseline',()=>{
 const p=createProject();p.data.artist='Artist';p.data.album='Album';
 const l=layer({source:'spine',referenceSpine:true,hideArtist:true,size:6,h:1.3,albumStyle:{size:1}});p.surfaces.outer=[l];
 const result=textLayout(boundText(p,l,'outer'),l,{project:p,measureText:metric});
 assert.deepEqual(result.lineHeights,[1.2]);assert.deepEqual(result.baselines,[.9]);assert.equal(result.overflow,false);
 assert.equal(result.size,6);assert.deepEqual(renderSvg(p,'outer',{guides:false,measureText:metric}).warnings,[]);
});

test('a wrapped album-only continuation has no invisible artist leading',()=>{
 const p=createProject();p.data.artist='AA';p.data.album='BBBB CCCC';
 const l=layer({source:'spine',referenceSpine:true,size:3,w:10,albumStyle:{size:1}});
 const result=textLayout(boundText(p,l,'outer'),l,{project:p,measureText:metric});
 assert.equal(result.lines.at(-1),'CCCC');assert.equal(result.lineHeights.at(-1),1.2);
 assert.ok(Math.abs(result.baselines.at(-1)-(result.height-1.2+.9))<1e-9);
});

test('an indivisible wide glyph reports horizontal overflow without being split',()=>{
 const p=createProject(),l=layer({text:'👩‍👩‍👧‍👧',w:2,h:100});p.surfaces.outer=[l];
 const result=textLayout(l.text,l,{measureText:metric});
 assert.deepEqual(result.lines,['👩‍👩‍👧‍👧']);assert.ok(Math.abs(result.height-3.6)<1e-9);assert.equal(result.overflow,true);
 assert.ok(renderSvg(p,'outer',{guides:false,measureText:metric}).warnings.some(warning=>warning.includes('Текст не помещается')));
});

test('auto-fit shrinks an intact glyph to the available width',()=>{
 const l=layer({text:'👩‍👩‍👧‍👧',w:2,h:100,autoFit:true}),result=textLayout(l.text,l,{measureText:metric});
 assert.deepEqual(result.lines,['👩‍👩‍👧‍👧']);assert.ok(result.size<l.size);
 assert.ok(result.widths[0]<=l.w+1e-9);assert.equal(result.overflow,false);
});

test('auto-fit reaches a valid small size and still warns when its minimum cannot fit',()=>{
 const l=layer({text:'A',size:20,w:100,h:.6,autoFit:true}),result=textLayout(l.text,l,{measureText:metric});
 assert.ok(Math.abs(result.size-.5)<1e-9);assert.ok(result.height<=l.h+1e-9);assert.equal(result.overflow,false);
 const impossible=textLayout('A',layer({w:.001,autoFit:true}),{measureText:(text,style,size)=>size*3});
 assert.equal(impossible.size,.1);assert.equal(impossible.overflow,true);
});

test('artist shadow is attached to its run and a disabled album shadow receives no filter',()=>{
 const l=layer({shadow:1,albumStyle:{shadow:0}}),runs=[{text:'Artist'},{text:'Album',style:l.albumStyle}];
 const svg=renderStyledLine(runs,l,l.size,metric,{baseShadowId:'artist-shadow',shadowId:'album-shadow'});
 assert.match(svg,/<text [^>]*filter="url\(#artist-shadow-run0-shadow\)">Artist<\/text>/);
 assert.match(svg,/<text [^>]+>Album<\/text>$/);
 assert.equal((svg.match(/filter=/g)||[]).length,1);
});

test('an album uses exactly its own shadow or the inherited artist shadow',()=>{
 const l=layer({shadow:1}),options={baseShadowId:'artist-shadow',shadowId:'album-shadow'};
 const own=renderStyledLine([{text:'Own',style:{shadow:2}}],l,l.size,metric,options);
 const inherited=renderStyledLine([{text:'Inherited',style:{font:'Georgia'}}],l,l.size,metric,options);
 assert.match(own,/filter="url\(#artist-shadow-run0-album-shadow\)"/);
 assert.match(inherited,/filter="url\(#artist-shadow-run0-shadow\)"/);assert.doesNotMatch(inherited,/run0-album-shadow/);
});

test('mixed shadow faces share one centered physical line despite different stretch and spacing',()=>{
 const l=layer({shadow:1,size:2,fontStretch:50,spacing:1}),runs=[{text:'AA'},{text:'BB',style:{size:4,fontStretch:150,spacing:2,shadow:0}}];
 const width=(4+1)*.5+1*.5+(8+2)*1.5;
 const svg=renderStyledLine(runs,l,l.size,metric,{x:30,y:10,anchor:'middle',baseShadowId:'artist-shadow',shadowId:'album-shadow'});
 const texts=Array.from(svg.matchAll(/<text x="([^"]+)" transform="scale\(([^ ]+) 1\)" y="([^"]+)"/g));
 assert.equal(texts.length,2);assert.ok(Math.abs(Number(texts[0][1])*Number(texts[0][2])-(30-width/2))<1e-9);
 assert.ok(Math.abs(Number(texts[1][1])*Number(texts[1][2])-(30-width/2+3))<1e-9);
 assert.ok(texts.every(match=>match[3]==='10'));assert.equal((svg.match(/filter=/g)||[]).length,1);
});

test('native SVG export renders independent shadows and preserves the unshadowed album',()=>{
 const l=layer({font:'Arial',size:24,color:'#000000',shadow:4,shadowColor:'#ff0000'}),runs=[{text:'Artist'},{text:' No shadow',style:{shadow:0}},{text:' Own shadow',style:{shadow:4,shadowColor:'#0000ff'}}];
 const filters='<filter id="artist" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#ff0000"/></filter><filter id="album" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#0000ff"/></filter>';
 const content=renderStyledLine(runs,l,l.size,metric,{x:10,y:45,baseShadowId:'artist',shadowId:'album'});
 const rendered=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="850" height="100"><defs>${filters}</defs>${content}</svg>`).render(),pixels=rendered.pixels;
 let red=0,blue=0,middleShadow=0;
 const middleStart=10+'Artist'.length*l.size,middleEnd=middleStart+' No shadow'.length*l.size;
 for(let index=0;index<pixels.length;index+=4){
  const redPixel=pixels[index]-pixels[index+1]>50&&pixels[index]-pixels[index+2]>50&&pixels[index+3]>10,bluePixel=pixels[index+2]-pixels[index]>50&&pixels[index+2]-pixels[index+1]>50&&pixels[index+3]>10;
  red+=redPixel;blue+=bluePixel;const x=(index/4)%rendered.width;
  if(x>middleStart+8&&x<middleEnd-8&&(redPixel||bluePixel))middleShadow++;
 }
 assert.ok(red>50);assert.ok(blue>50);assert.equal(middleShadow,0);
});

test('native SVG runs preserve centered ink positions with independent spacing and stretch',()=>{
 const l=layer({font:'Courier New',size:24,fontStretch:50,spacing:2,color:'#ff0000',shadow:3,shadowColor:'#666666'}),runs=[{text:'AA'},{text:'BB',style:{size:32,fontStretch:150,spacing:3,color:'#0000ff',shadow:0}}];
 const monospace=(text,style,size)=>text.length*size*.6;
 const width=(2*24*.6+2)*.5+2*.5+(2*32*.6+3)*1.5,left=150-width/2,albumLeft=left+(2*24*.6+2)*.5+2*.5;
 const filters='<filter id="artist" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="6" dy="6" stdDeviation="0" flood-color="#666666"/></filter>';
 const actual=renderStyledLine(runs,l,l.size,monospace,{x:150,y:55,anchor:'middle',baseShadowId:'artist'});
 const control=`<text x="${left/.5}" transform="scale(.5 1)" y="55" font-family="Courier New" font-size="24" fill="#ff0000" letter-spacing="2">AA</text><text x="${albumLeft/1.5}" transform="scale(1.5 1)" y="55" font-family="Courier New" font-size="32" fill="#0000ff" letter-spacing="3">BB</text>`;
 const mask=content=>{
  const pixels=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><defs>${filters}</defs>${content}</svg>`).render().pixels,result=[];
  for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]===255&&(pixels[index]===255&&pixels[index+1]===0&&pixels[index+2]===0||pixels[index]===0&&pixels[index+1]===0&&pixels[index+2]===255))result.push(index/4);
  return result;
 };
 const expected=mask(control);assert.ok(expected.length>100);assert.deepEqual(mask(actual),expected);
});

test('a real bound spine exports inherited, disabled and independent album shadows',()=>{
 const variants=[{name:'inherited',albumStyle:{font:'Courier New',size:5},baseFilters:2,ownFilters:0},{name:'disabled',albumStyle:{font:'Courier New',size:5,shadow:0},baseFilters:1,ownFilters:0},{name:'independent',albumStyle:{font:'Courier New',size:5,shadow:2,shadowColor:'#0000ff'},baseFilters:1,ownFilters:1}];
 for(const variant of variants){
  const p=createProject();p.settings.bg='#ffffff';p.data.artist='Artist';p.data.album='Album';
  const l=layer({id:'bound-spine',source:'spine',referenceSpine:true,font:'Courier New',size:7,w:130,h:12,x:5,y:10,align:'center',color:'#000000',shadow:1.5,shadowColor:'#ff0000',albumStyle:variant.albumStyle});p.surfaces.outer=[l];
  const {svg,warnings}=renderSvg(p,'outer',{guides:false,measureText:(text,style,size)=>text.length*size*.6});assert.deepEqual(warnings,[]);
  assert.equal((svg.match(/filter="url\(#souter-boundspine-line\d+-run\d+-shadow\)"/g)||[]).length,variant.baseFilters);
  assert.equal((svg.match(/filter="url\(#souter-boundspine-line\d+-run\d+-album-shadow\)"/g)||[]).length,variant.ownFilters);
  assert.doesNotMatch(svg,/<tspan[^>]*filter=/);
  const pixels=new Resvg(svg,{fitTo:{mode:'width',value:800}}).render().pixels;let red=0,blue=0;
  for(let index=0;index<pixels.length;index+=4){if(pixels[index]-pixels[index+1]>30&&pixels[index]-pixels[index+2]>30)red++;if(pixels[index+2]-pixels[index]>30&&pixels[index+2]-pixels[index+1]>30)blue++}
  assert.ok(red>50,variant.name+' artist shadow');
  if(variant.ownFilters)assert.ok(blue>50,variant.name+' album shadow');else assert.equal(blue,0,variant.name+' no blue shadow');
 }
});

test('a real spine preserves the shadow of a short emphasized I instead of cropping its filter',()=>{
 const p=createProject();p.settings.bg='#ffffff';p.data.artist='**I** ABCDEF';p.data.album='Album';
 const l=layer({id:'short-spine',source:'spine',referenceSpine:true,font:'Arial',size:10,w:145,h:20,x:5,y:10,color:'#000000',shadow:3,shadowColor:'#ff0000',albumStyle:{size:4,shadow:0}});p.surfaces.outer=[l];
 const {svg,w,warnings}=renderSvg(p,'outer',{guides:false,measureText:metric});assert.deepEqual(warnings,[]);
 const firstFilter=svg.match(/<filter id="souter-shortspine-line0-run0-shadow"[^>]*>/)?.[0];
 assert.ok(firstFilter);assert.match(firstFilter,/filterUnits="userSpaceOnUse"/);
 const legacy=svg.replace(firstFilter,'<filter id="souter-shortspine-line0-run0-shadow" x="-30%" y="-30%" width="160%" height="160%">');
 const shadowPixels=value=>{
  const rendered=new Resvg(value,{fitTo:{mode:'width',value:800}}).render(),pixels=rendered.pixels,scale=rendered.width/w;let count=0;
  for(let index=0;index<pixels.length;index+=4){
   const x=(index/4)%rendered.width;
   if(x>=l.x*scale&&x<(l.x+8)*scale&&pixels[index]-pixels[index+1]>30&&pixels[index]-pixels[index+2]>30)count++;
  }
  return count;
 };
 const actual=shadowPixels(svg),cropped=shadowPixels(legacy);assert.ok(actual>cropped+50,`short I shadow: ${actual} restored, ${cropped} cropped`);
});

test('negative advances get finite positive per-run filter bounds rather than a layer-sized surface',()=>{
 const l=layer({size:.5,spacing:-1,shadow:1}),svg=renderStyledLine([{text:'IIII'}],l,l.size,metric,{x:20,y:3,lineId:'negative-advance'});
 const filter=svg.match(/<filter[^>]* x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
 assert.ok(filter);const [x,y,w,h]=filter.slice(1).map(Number);assert.ok([x,y,w,h].every(Number.isFinite));assert.ok(w>0&&h>0);
 assert.ok(x<19);assert.ok(w<20&&h<20);assert.doesNotMatch(svg,/NaN|Infinity/);
});
