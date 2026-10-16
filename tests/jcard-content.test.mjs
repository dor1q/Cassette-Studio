import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {layoutStyledText} from '../src/text-layout.js';
import {REFERENCE_UNIT as UNIT} from '../src/reference-format.js';
import {referenceFlowCopy,rebuildReferenceFlow} from '../src/reference-flow.js';
import {composeJCardContents,layoutJCardContents,layoutJCardFragments,usesJCardContents} from '../src/jcard-content.js';

const metric=(text,style,size)=>Array.from(text).length*size*.5;
const layoutText=(value,style,options={})=>layoutStyledText(value,style,{measureText:metric,...options});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function project({count=4,width=20,height=20}={}){
 const p=createProject();p.layout.referenceTemplate=true;p.layout.double=true;p.data={...p.data,artist:'',album:'',A:[],B:[],lyrics:'',production:''};
 p.surfaces.outer=[];p.surfaces.inner=[];
 for(let flowIndex=0;flowIndex<count;flowIndex++){
  const surface=flowIndex<count/2?'outer':'inner';
  p.surfaces[surface].push(makeLayer('text',{source:'referenceContents',referenceFlow:true,referenceFlowSurface:surface,referencePanelIndex:surface==='outer'?3:2,referenceColumn:flowIndex%2,flowIndex,w:width,h:height,size:1,lineHeight:1,font:'Arial',fontWeight:400,bold:false,autoFit:false}));
 }
 return p;
}
const slots=p=>['outer','inner'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.referenceFlow).map(layer=>({surface,layer}))).sort((a,b)=>a.layer.flowIndex-b.layer.flowIndex);
const flows=p=>slots(p).map(({surface,layer})=>layoutJCardContents(p,layer,surface,{layoutText}));
const laid=(flow,layer)=>layoutJCardFragments(flow.fragments,layer,{layoutText});
const visible=flow=>flow.fragments.map(fragment=>fragment.glyphs.map(g=>g.text).join('')).join('');

test('J-card composes the original Markdown document including metadata and per-side markers',()=>{
 const p=project(),layer=slots(p)[0].layer;Object.assign(p.data,{artist:'**Artist**',album:'*Album*',A:[{title:'__Track__',artist:'Guest',seconds:61}],B:[{title:'Second',seconds:62}],lyrics:'Line\n \nLast',production:'© End'});p.settings.artists=true;
 assert.equal(composeJCardContents(p,layer),'## **Artist** - *Album*\n\n### SIDE A  \n1. __Track__ - Guest (1:01)  \n  \n### SIDE B  \n1. Second (1:02)\n\nLine  \n\u00a0  \nLast\n\n© End');
 p.settings.referenceSeparator='\u2002';assert.ok(composeJCardContents(p,layer).startsWith('## **Artist**\u2002*Album*'));
 layer.hideA=true;layer.hideB=true;assert.doesNotMatch(composeJCardContents(p,layer),/Artist|Album|Track|Second|SIDE/);
 layer.trackOptions={showProduction:false};assert.doesNotMatch(composeJCardContents(p,layer),/© End/);
});

test('track options generate unordered lists, plain lines, independent side labels and explicit hidden content',()=>{
 const p=project(),layer=slots(p)[0].layer;p.data.A=[{title:'One',artist:'Guest',seconds:60}];p.data.B=[{title:'Two',seconds:120}];
 layer.trackOptions={numbers:false,bullets:true,artists:false,durations:false,showSide:true,sideText:'Tape',sideA:'I',sideB:'II'};
 assert.equal(composeJCardContents(p,layer),'### Tape I  \n- One  \n  \n### Tape II  \n- Two');
 layer.trackOptions.bullets=false;layer.trackOptions.showSide=false;assert.equal(composeJCardContents(p,layer),'One  \n  \nTwo');
 layer.trackOptions.hideTracks=true;assert.equal(composeJCardContents(p,layer),'');
});

test('structured flow carries nested emphasis across all printed slots without reparsing or duplication',()=>{
 const p=project({width:2.1,height:1});p.data.lyrics='**ABCD *EFGH* IJKL MNOP**';const chunks=flows(p);
 assert.deepEqual(chunks.map(chunk=>chunk.text),['ABCD','EFGH','IJKL','MNOP']);assert.equal(chunks.map(visible).join('').replace(/\s/g,''),'ABCDEFGHIJKLMNOP');
 assert.ok(chunks.every(chunk=>!chunk.overflow));
 chunks.forEach((flow,index)=>{const sections=laid(flow,slots(p)[index].layer).sections;assert.ok(sections.flatMap(s=>s.layout.lineRuns.flat()).every(run=>run.bold));near(laid(flow,slots(p)[index].layer).height,1)});
 assert.ok(laid(chunks[1],slots(p)[1].layer).sections[0].layout.lineRuns.flat().every(run=>run.italic));
});

test('a hard line break consumed at a column boundary does not create a phantom empty line',()=>{
 const p=project({count:2,width:20,height:1});p.data.lyrics='FIRST\nSECOND';const chunks=flows(p);
 assert.deepEqual(chunks.map(chunk=>chunk.text),['FIRST','SECOND']);chunks.forEach((flow,index)=>near(laid(flow,slots(p)[index].layer).height,1));assert.ok(chunks.every(flow=>!flow.overflow));
});

test('headings retain original sizes, weights, fixed margins and keep with their following line',()=>{
 const p=project({count:2,width:100,height:3.4});p.data.lyrics='first\n## Heading\nlast';const chunks=flows(p);
 assert.equal(chunks[0].text,'first');assert.match(chunks[1].text,/Heading\nlast/);const sections=laid(chunks[1],slots(p)[1].layer).sections;
 assert.equal(sections[0].kind,'heading');near(sections[0].layer.size,Math.round(58/48/UNIT)*UNIT);assert.equal(sections[0].layer.fontWeight,600);near(sections[0].y,0);near(sections[1].y,sections[0].layout.height+12*UNIT);
 const q=project({count:2,width:100,height:100});q.data.lyrics='# First\n## Second\n### Third\n#### Fourth';const heading=laid(flows(q)[0],slots(q)[0].layer).sections;
 near(heading[0].layer.size,Math.round(1.5/UNIT)*UNIT);assert.equal(heading[0].layer.fontWeight,700);assert.equal(heading[2].layer.fontWeight,600);assert.equal(heading[3].layer.fontWeight,400);near(heading[3].layer.size,1);
});

test('ordered numbering resets to one and nested list indents and outside markers remain separate',()=>{
 const p=project({count:2,width:100,height:100});p.data.lyrics='5. First\n6. Second\n   - Nested\n7. Third';const layer=slots(p)[0].layer,flow=flows(p)[0],sections=laid(flow,layer).sections,markers=sections.filter(s=>s.kind==='marker');
 assert.deepEqual(markers.map(marker=>marker.text),['1.','2.','•','3.']);const nested=sections.find(section=>section.text==='Nested');near(nested.x,4.7);assert.ok(markers.every(marker=>marker.x+marker.layer.w<sections.find(section=>Math.abs(section.y-marker.y)<1e-8&&section.kind!=='marker')?.x));
 assert.ok(sections.filter(s=>s.kind!=='marker').every(s=>!/^\d+\./.test(s.text)));
});

test('a list item spanning columns shows its marker once and preserves bold style on continuation',()=>{
 const p=project({width:4.45,height:1});p.data.lyrics='1. **ABCD EFGH IJKL MNOP**';const chunks=flows(p),all=chunks.flatMap((flow,index)=>laid(flow,slots(p)[index].layer).sections);
 assert.equal(chunks.map(visible).join('').replace(/\s/g,''),'ABCDEFGHIJKLMNOP');assert.deepEqual(all.filter(s=>s.kind==='marker').map(s=>s.text),['1.']);assert.ok(all.filter(s=>s.kind!=='marker').flatMap(s=>s.layout.lineRuns.flat()).every(run=>run.bold));
});

test('hidden originals reserve fragments while copied fragments use their own style and geometry',()=>{
 const p=project({width:2.1,height:1});p.data.lyrics='**ABCD EFGH IJKL MNOP**';const source=slots(p)[0],before=flows(p);source.layer.visible=false;
 const copy=makeLayer('text',{...referenceFlowCopy(source.layer,source.surface),w:10,h:5,size:2,font:'Georgia',color:'#aa2200'});p.surfaces.inner.push(copy);
 assert.deepEqual(flows(p),before);const own=laid(before[0],copy);assert.equal(own.sections[0].layer.font,'Georgia');assert.equal(own.sections[0].layer.color,'#aa2200');near(own.sections[0].layer.size,2);assert.equal(own.sections[0].text,'ABCD');near(own.height,2);
});

test('local automatic fit shrinks a copied structured viewport consistently without changing source flow',()=>{
 const p=project({count:2,width:50,height:40});p.data.lyrics='## Heading\n1. **FIRST SECOND THIRD**\n   - Nested item\nlast';const source=slots(p)[0],before=structuredClone(p),flow=flows(p)[0],original=structuredClone(flow);
 const copy=makeLayer('text',{...referenceFlowCopy(source.layer,source.surface),w:6,h:5,size:3,autoFit:false});const unfitted=laid(flow,copy);assert.equal(unfitted.overflow,true);assert.equal(unfitted.size,3);
 copy.autoFit=true;const copyBefore=structuredClone(copy),fitted=laid(flow,copy);assert.ok(fitted.size<3&&fitted.size>=.1);assert.ok(fitted.height<=copy.h+1e-9);assert.equal(fitted.overflow,false);assert.equal(fitted.sections.filter(section=>section.kind==='marker').length,2);
 const body=fitted.sections.find(section=>section.kind==='paragraph');near(body.layer.size,fitted.size);const nested=fitted.sections.find(section=>section.text.startsWith('Nested item'));near(nested.x,4.7*fitted.size);const heading=fitted.sections.find(section=>section.kind==='heading');near(heading.layer.size,Math.round(fitted.size/UNIT*58/48)*UNIT);
 assert.deepEqual(copy,copyBefore);assert.deepEqual(p,before);assert.deepEqual(flow,original);assert.deepEqual(flows(p)[0],flow);
});

test('automatic fit keeps physical block margins and warns when its minimum face cannot fit',()=>{
 const p=project({count:2,width:40,height:40});p.data.lyrics='## Heading\nlast';const flow=flows(p)[0],copy=makeLayer('text',{...referenceFlowCopy(slots(p)[0].layer,'outer'),w:20,h:.2,size:2,autoFit:true}),before=structuredClone(copy);let calls=0;
 const fitted=layoutJCardFragments(flow.fragments,copy,{layoutText:(...args)=>{calls++;return layoutText(...args)}});assert.equal(fitted.size,.1);assert.equal(fitted.overflow,true);assert.ok(calls<100);const heading=fitted.sections.find(section=>section.kind==='heading'),body=fitted.sections.find(section=>section.kind==='paragraph');near(heading.y,16*UNIT);near(body.y-heading.y-heading.layout.height,12*UNIT);assert.deepEqual(copy,before);
});

test('automatic fit accounts for list indentation and never claims text outside a tiny frame fits',()=>{
 const p=project({count:2,width:40,height:40});p.data.lyrics='- Item';const flow=flows(p)[0],copy=makeLayer('text',{...referenceFlowCopy(slots(p)[0].layer,'outer'),w:.1,h:10,size:1,autoFit:true});const fitted=laid(flow,copy);assert.equal(fitted.size,.1);assert.equal(fitted.overflow,true);
});

test('only the final printed slot reports remaining document overflow and no source data is mutated',()=>{
 const p=project({width:2.1,height:1});p.data.lyrics='ABCD EFGH IJKL MNOP QRST';const before=structuredClone(p),chunks=flows(p);
 assert.deepEqual(chunks.map(chunk=>chunk.overflow),[false,false,false,true]);assert.deepEqual(p,before);
 p.layout.double=false;assert.equal(layoutJCardContents(p,p.surfaces.inner[0],'inner',{layoutText}).text,'');const front=slots(p).filter(slot=>slot.surface==='outer');assert.equal(layoutJCardContents(p,front.at(-1).layer,'outer',{layoutText}).overflow,true);
});

test('code, rules, raw HTML and inline image alternatives remain safe structured export data',()=>{
 const p=project({count:2,width:100,height:100});p.data.lyrics='```js\n  A  B\n```\n\n***\n\n![Cover](https://example.com/art.png)\n\n<div>literal</div>';const flow=flows(p)[0],sections=laid(flow,slots(p)[0].layer).sections;
 const code=sections.find(section=>section.kind==='code');assert.equal(code.text,'  A  B  ');assert.equal(code.layer.font,'Courier New');const rule=sections.find(section=>section.kind==='rule');assert.ok(rule.width>0);near(rule.height,UNIT);assert.ok(sections.some(section=>section.text.includes('<div>literal</div>')));assert.ok(sections.some(section=>section.text.includes('Cover')));assert.ok(flow.warnings.includes('image-alt-fallback'));
 assert.equal(usesJCardContents(p,slots(p)[0].layer,'outer'),true);assert.equal(usesJCardContents(p,slots(p)[0].layer,'cdTray'),false);p.layout.referenceTemplate=false;assert.equal(usesJCardContents(p,slots(p)[0].layer,'outer'),false);
});

test('explicit blank physical rows survive column boundaries without duplication or losing following text',()=>{
 const p=project({width:20,height:1});p.data.lyrics='FIRST\n\n\nLAST';const chunks=flows(p);
 assert.deepEqual(chunks.map(chunk=>chunk.text),['FIRST','','','LAST']);chunks.forEach((flow,index)=>near(laid(flow,slots(p)[index].layer).height,1));assert.ok(chunks.every(flow=>!flow.overflow));
});

test('oversized first lines make progress and report clipping even when the whole source is consumed',()=>{
 const p=project({count:2,width:20,height:.2});p.data.lyrics='ONE';const first=flows(p)[0];assert.equal(first.text,'ONE');assert.equal(first.overflow,true);assert.equal(laid(first,slots(p)[0].layer).overflow,true);assert.equal(flows(p)[1].text,'');
});

test('an atomic uppercase expansion wider than its frame warns instead of silently clipping ink',()=>{
 const p=project({count:2,width:.6,height:2});p.data.lyrics='ß';slots(p)[0].layer.uppercase=true;const first=flows(p)[0];assert.equal(first.text,'SS');assert.equal(first.overflow,true);assert.equal(laid(first,slots(p)[0].layer).overflow,true);
});

test('an empty heading keeps its margins without inventing a visible text row',()=>{
 const p=project({count:2,width:20,height:20});p.data.lyrics='##\nLAST';const first=flows(p)[0],sections=laid(first,slots(p)[0].layer).sections;assert.equal(first.text,'LAST');assert.equal(sections.length,1);assert.equal(sections[0].kind,'paragraph');near(sections[0].y,16*UNIT);
});

test('manual locked slot geometry and archived slots survive save/reopen while inactive slots consume nothing',()=>{
 const p=createProject();p.data.lyrics='**First**\n\n## Next\nLast';p.layout.referenceTemplate=true;p.layout.double=true;p.layout.panels=5;
 const template=makeLayer('text',{source:'referenceContents',size:2,lineHeight:1.4});rebuildReferenceFlow(p,template);const source=slots(p).at(-1).layer;Object.assign(source,{locked:true,referenceManualGeometry:true,w:21,h:19,x:15,y:12,rotation:9});
 p.layout.double=false;rebuildReferenceFlow(p);const before=flows(p),archive=structuredClone(p.referenceFlowArchive),reopened=migrate(JSON.parse(JSON.stringify(p)));assert.deepEqual(reopened.referenceFlowArchive.map(layer=>({w:layer.w,h:layer.h,x:layer.x,y:layer.y,rotation:layer.rotation,locked:layer.locked})),archive.map(layer=>({w:layer.w,h:layer.h,x:layer.x,y:layer.y,rotation:layer.rotation,locked:layer.locked})));
 assert.deepEqual(flows(reopened).map(flow=>flow.text),before.map(flow=>flow.text));reopened.layout.double=true;rebuildReferenceFlow(reopened);const restored=slots(reopened).find(slot=>slot.layer.locked).layer;assert.equal(restored.w,21);assert.equal(restored.h,19);assert.equal(restored.rotation,9);
});
