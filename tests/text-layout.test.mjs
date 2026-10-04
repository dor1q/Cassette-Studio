import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,boundText} from '../src/model.js';
import {flowText,renderSvg,textLayout} from '../src/render.js';

// Deterministic font metrics make a real width difference between normal,
// bold, italic and the independent album face. No Markdown is font content.
const metric=(text,style,size)=>Array.from(text).length*size*(style.font==='Display'?2:1)*(style.fontWeight>=700?2:1)*(style.italic?1.5:1);
const layer=props=>makeLayer('text',{font:'Arial',size:1,w:6,h:20,autoFit:false,lineHeight:1.2,...props});
const textNodes=svg=>Array.from(svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g),match=>match[1]);
const visible=svg=>textNodes(svg).map(text=>text.replace(/<[^>]+>/g,''));

test('wrapping measures visible bold and italic glyphs, never Markdown delimiters',()=>{
 const calls=[],measureText=(...args)=>{calls.push(args);return metric(...args)};
 assert.deepEqual(textLayout('AA BB',layer(),{measureText}).lines,['AA BB']);
 const bold=textLayout('**AA** BB',layer(),{measureText});
 assert.deepEqual(bold.lines,['**AA**','BB']);assert.deepEqual(bold.widths,[4,2]);
 assert.deepEqual(textLayout('AA *BB*',layer({w:5}),{measureText}).lines,['AA','*BB*']);
 assert.ok(calls.every(([text])=>!text.includes('*')));
 assert.ok(calls.some(([text,style])=>text==='AA'&&style.fontWeight===700));
 assert.ok(calls.some(([text,style])=>text==='BB'&&style.italic));
});

test('a wrapped emphasis span is rendered with its style on every line',()=>{
 const p=createProject(),l=layer({text:'**AABBCC** *DDEEFF*',w:4});p.surfaces.outer=[l];
 const svg=renderSvg(p,'outer',{guides:false,measureText:metric}).svg;
 assert.deepEqual(visible(svg),['AA','BB','CC','DD','EE','FF']);
 for(const node of textNodes(svg).slice(0,3))assert.match(node,/<tspan font-weight="bold">/);
 for(const node of textNodes(svg).slice(3))assert.match(node,/<tspan font-style="italic">/);
 assert.ok(textNodes(svg).every(text=>!text.includes('*')));
});

test('independent album font, size, spacing and width determine the spine line breaks',()=>{
 const p=createProject();p.data.artist='AA';p.data.album='BB CC';
 const l=layer({source:'spine',referenceSpine:true,w:20,fontStretch:50,align:'center',albumStyle:{font:'Display',size:3,fontStretch:150,spacing:.2,color:'#ff0000'}});p.surfaces.outer=[l];
 const layout=textLayout(boundText(p,l,'outer'),l,{project:p,measureText:metric});
 assert.deepEqual(layout.lines,['AA -','BB','CC']);
 assert.ok(Math.abs(layout.widths[1]-18.3)<1e-9);assert.ok(Math.abs(layout.height-8.4)<1e-9);
 const svg=renderSvg(p,'outer',{guides:false,measureText:metric}).svg;
 assert.deepEqual(visible(svg),['AA -','BB','CC']);
 assert.match(svg,/transform="scale\(0.5 1\)"/);
 assert.match(svg,/<tspan font-family="Display" font-size="3"[^>]*letter-spacing="0.2"/);
 assert.ok(Math.abs(Number(svg.match(/textLength="([^"]+)"/)[1])-36.6)<1e-9);
 assert.ok(Math.abs(Number(Array.from(svg.matchAll(/<text[^>]* y="([^"]+)"/g))[1][1])-3.9)<1e-9);
});

test('album letter casing and inline emphasis are applied before their metrics are measured',()=>{
 const p=createProject();p.data.artist='artist';p.data.album='**Mixed** *Case*';
 const l=layer({source:'spine',referenceSpine:true,uppercase:true,w:100,albumStyle:{font:'Display',size:2,uppercase:false}});p.surfaces.outer=[l];
 const calls=[],measureText=(...args)=>{calls.push(args);return metric(...args)};
 const svg=renderSvg(p,'outer',{guides:false,measureText}).svg;
 assert.deepEqual(visible(svg),['ARTIST - Mixed Case']);
 assert.ok(calls.some(([text,style])=>text==='Mixed'&&style.font==='Display'&&style.fontWeight===700));
 assert.ok(calls.some(([text,style])=>text==='Case'&&style.font==='Display'&&style.italic));
 assert.ok(calls.every(([text])=>!text.includes('*')));
});

test('a taller album style triggers overflow and auto-fit scales both faces together',()=>{
 const p=createProject();p.data.artist='A';p.data.album='Album';
 const l=layer({source:'spine',referenceSpine:true,w:100,h:5,albumStyle:{size:5,font:'Display'}});p.surfaces.outer=[l];
 let layout=textLayout(boundText(p,l,'outer'),l,{project:p,measureText:metric});
 assert.equal(layout.overflow,true);assert.equal(layout.height,6);
 assert.ok(renderSvg(p,'outer',{guides:false,measureText:metric}).warnings.some(text=>text.includes('Текст не помещается')));
 l.autoFit=true;layout=textLayout(boundText(p,l,'outer'),l,{project:p,measureText:metric});
 assert.ok(layout.size<l.size);assert.ok(layout.height<=l.h);assert.equal(layout.overflow,false);
 assert.equal(layout.lineRuns[0].find(run=>run.style).style.size,5);
 const result=renderSvg(p,'outer',{guides:false,measureText:metric});
 assert.deepEqual(result.warnings,[]);assert.match(result.svg,new RegExp(`font-size="${5*layout.size}"`));
});

test('continuous columns retain emphasis and consume every visible glyph exactly once',()=>{
 const p=createProject();p.data.lyrics='**ABCD EFGH**';
 p.surfaces.inner=Array.from({length:4},(_,flowIndex)=>layer({source:'lyrics',flowIndex,w:4,h:1.2,x:flowIndex*6}));
 const chunks=p.surfaces.inner.map(l=>flowText(p,l,'inner',{measureText:metric}));
 assert.deepEqual(chunks.map(chunk=>chunk.text),['**AB**','**CD**','**EF**','**GH**']);
 assert.ok(chunks.every(chunk=>!chunk.overflow));
 const svg=renderSvg(p,'inner',{guides:false,measureText:metric});
 assert.deepEqual(visible(svg.svg),['AB','CD','EF','GH']);assert.deepEqual(svg.warnings,[]);
 for(const node of textNodes(svg.svg))assert.match(node,/<tspan font-weight="bold">/);
});

test('wrapped headings measure their bold face and keep heading weight on continuation lines',()=>{
 const p=createProject();p.surfaces.outer=[layer({text:'# AA BB'})];
 const svg=renderSvg(p,'outer',{guides:false,measureText:metric}).svg;
 assert.deepEqual(visible(svg),['AA','BB']);
 assert.equal((svg.match(/<text[^>]*font-weight="700"/g)||[]).length,2);
 assert.deepEqual(textLayout('# AA BB',p.surfaces.outer[0],{measureText:metric}).lines,['# AA','# BB']);
});

test('tapered wrapping uses styled glyph advances and the available width at each line',()=>{
 const l=layer({flapTapered:true,w:10,h:15,text:'**AABB CCDD EEFF**'}),layout=textLayout(l.text,l,{measureText:metric});
 assert.ok(layout.lines.length>2);
 assert.ok(layout.widths.every((width,index)=>width<=Math.max(layout.size,l.w-layout.insets[index].left-layout.insets[index].right)+1e-9));
 assert.ok(layout.lineRuns.flat().every(run=>run.bold));
 assert.equal(layout.lineRuns.flat().map(run=>run.text).join('').replace(/\s/g,''),'AABBCCDDEEFF');
});

test('long-word wrapping never splits emoji sequences or combining accents',()=>{
 const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'}),measureText=text=>Array.from(segmenter.segment(text)).length;
 const layout=textLayout('**A👩‍👩‍👧‍👧B**',layer({w:2}),{measureText});
 assert.deepEqual(layout.lines,['**A👩‍👩‍👧‍👧**','**B**']);
 assert.deepEqual(textLayout('**Ae\u0301B**',layer({w:2}),{measureText}).lines,['**Ae\u0301**','**B**']);
});

test('the browser canvas receives each actual face and weight rather than a single base font',async()=>{
 const fonts=[],texts=[],context={font:'',measureText(text){fonts.push(this.font);texts.push(text);const size=Number(this.font.match(/([\d.]+)px/)[1]);return {width:text.length*size*(/700/.test(this.font)?2:1)}}};
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try{
  const measured=await import('../src/render.js?canvas-mixed-font-test');
  const p=createProject();p.data.artist='AA';p.data.album='*BB*';
  const l=layer({source:'spine',referenceSpine:true,w:100,albumStyle:{font:'Georgia',size:3,italic:true,smallcaps:true}});
  measured.textLayout(boundText(p,l,'outer'),l,{project:p});
  assert.ok(fonts.some(font=>font==='400 4px "Arial"'));
  assert.ok(fonts.some(font=>font==='italic small-caps 400 12px "Georgia"'));
  assert.ok(texts.every(text=>!text.includes('*')));
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
});
