import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,importReference,migrate,clone} from '../src/model.js';
import {renderSvg,flowText} from '../src/render.js';
import {duplicateSelection,setSelectionProperty} from '../src/selection-edit.js';
import {prepareExport} from '../src/export.js';
import {REFERENCE_UNIT as U} from '../src/reference-format.js';

const metric=(text,_style,size)=>Array.from(text).length*size*.5;
const textNodes=svg=>Array.from(svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g),match=>({attrs:match[1],body:match[2],text:match[2].replace(/<[^>]*>/g,'')}));
const printedText=svg=>textNodes(svg).map(node=>node.text).join('\n');
const allSlots=p=>['outer','inner'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.referenceFlow).map(layer=>({surface,layer})));
const flows=p=>allSlots(p).map(({surface,layer})=>flowText(p,layer,surface,{measureText:metric}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

function project(){
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?face=p4&ds=1&bg=ffffff&color=000000');
 Object.assign(p.data,{artist:'',album:'',A:[],B:[],lyrics:'',production:''});
 p.surfaces.outer=p.surfaces.outer.filter(layer=>layer.referenceFlow);p.surfaces.inner=p.surfaces.inner.filter(layer=>layer.referenceFlow);
 for(const {layer} of allSlots(p))Object.assign(layer,{size:1.5,w:56,h:95,font:'Arial',fontWeight:400,bold:false,color:'#000000',lineHeight:1.4,referenceManualGeometry:true});
 return p;
}
const rich='# PRIMARYTOKEN\n## SECONDTOKEN\n### THIRDTOKEN\nPlain **BOLDTOKEN *NESTEDTOKEN*** and _ITALICTOKEN_.\n1. FIRSTITEMTOKEN\n2. SECONDITEMTOKEN\n   - NESTEDITEMTOKEN\n* * *\n`CODETOKEN`';

test('actual J-card SVG renders structural heading metrics and nested inline styles',()=>{
 const p=project();p.data.lyrics=rich;
 const before=clone(p),result=renderSvg(p,'outer',{guides:false,measureText:metric}),nodes=textNodes(result.svg);
 for(const [token,size,weight] of [['PRIMARYTOKEN',Math.round(1.5/U*1.5)*U,700],['SECONDTOKEN',Math.round(1.5/U*58/48)*U,600],['THIRDTOKEN',Math.round(1.5/U)*U,600]]){
  const node=nodes.find(node=>node.text===token);assert.ok(node,token);near(Number(node.attrs.match(/font-size="([^"]+)"/)[1]),size);assert.match(node.attrs,new RegExp(`font-weight="${weight}"`));
 }
 assert.match(result.svg,/<tspan font-weight="bold">BOLDTOKEN <\/tspan>/);
 assert.match(result.svg,/<tspan font-weight="bold" font-style="italic">NESTEDTOKEN<\/tspan>/);
 assert.match(result.svg,/<tspan font-style="italic">ITALICTOKEN<\/tspan>/);
 assert.match(result.svg,/<tspan font-family="Courier New"[^>]*>CODETOKEN<\/tspan>/);
 assert.doesNotMatch(printedText(result.svg),/\*\*|###|_ITALICTOKEN_/);assert.deepEqual(result.warnings,[]);assert.deepEqual(p,before);
});

test('actual SVG prints list markers once across columns and includes a visible thematic rule',()=>{
 const p=project();p.data.lyrics='1. **ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT GOLF HOTEL**\n2. SECOND\n   - NESTED\n* * *';
 const slots=allSlots(p);Object.assign(slots[0].layer,{w:12,h:2.8,size:1});
 for(const {layer} of slots.slice(1))Object.assign(layer,{w:20,h:95,size:1});
 const rendered=['outer','inner'].map(surface=>renderSvg(p,surface,{guides:false,measureText:metric}));
 const markers=rendered.flatMap(result=>textNodes(result.svg)).map(node=>node.text).filter(text=>/^(?:\d+\.|•)$/.test(text));
 assert.deepEqual(markers,['1.','2.','•']);
 for(const token of ['ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','SECOND','NESTED'])assert.equal(rendered.map(result=>printedText(result.svg)).join('\n').split(token).length-1,1,token);
 assert.ok(rendered.some(result=>/<path data-jcard-section="rule"[^>]*fill="none"[^>]*stroke="#000000"[^>]*stroke-width="0\.0/.test(result.svg)));
 assert.ok(flows(p)[1].text.length>0,'text genuinely continues into reverse columns');
});

test('J-card HTML stays visible escaped text and Markdown links never create active SVG content',()=>{
 const p=project();p.data.lyrics='Plain [LINKTOKEN](javascript:alert) and ![ALTTOKEN](https://example.invalid/art.png)\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>';
 const result=renderSvg(p,'outer',{guides:false,measureText:metric});
 assert.match(result.svg,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(result.svg,/&lt;img src=x onerror=alert\(2\)&gt;/);
 assert.doesNotMatch(result.svg,/<(?:script|img|image|a)\b/);assert.doesNotMatch(result.svg,/href=|javascript:/);
 assert.ok(printedText(result.svg).includes('LINKTOKEN'));assert.ok(printedText(result.svg).includes('ALTTOKEN'));
 assert.deepEqual(result.warnings,['Картинки Markdown отображаются подписью — добавьте изображение отдельным слоем']);
 assert.throws(()=>prepareExport(p,{mode:'jcard',selection:'current',surface:'outer'}),/Картинки Markdown/);
});

test('a duplicated selected viewport renders its own face and reflows its width without consuming source flow',()=>{
 const p=project();p.data.lyrics='**FIRSTTOKEN SECONDTOKEN THIRDTOKEN FOURTHTOKEN**';
 const source=p.surfaces.outer[0];source.h=20;const before=flows(p),[copy]=duplicateSelection(p,source,'outer',{joined:false,dx:0,dy:0});
 p.surfaces.inner.push(copy);
 for(const {layer} of allSlots(p))layer.visible=false;
 assert.equal(setSelectionProperty(p,copy,'inner','font','Courier New',false),true);assert.equal(setSelectionProperty(p,copy,'inner','color','#bb2200',false),true);
 assert.equal(setSelectionProperty(p,copy,'inner','size',2,false),true);assert.equal(setSelectionProperty(p,copy,'inner','w',19,false),true);
 assert.equal(copy.referenceOwnColor,true);assert.equal(copy.referenceFlow,false);assert.deepEqual(flows(p),before);assert.deepEqual(flowText(p,copy,'inner',{measureText:metric}),before[0]);
 const narrow=renderSvg(p,'inner',{guides:false,measureText:metric}),narrowLines=textNodes(narrow.svg);
 assert.ok(narrowLines.length>=4);assert.ok(narrowLines.every(node=>/font-family="Courier New"/.test(node.attrs)&&/fill="#bb2200"/.test(node.attrs)&&/font-size="2"/.test(node.attrs)));
 assert.equal(setSelectionProperty(p,copy,'inner','w',50,false),true);
 const wide=renderSvg(p,'inner',{guides:false,measureText:metric});assert.ok(textNodes(wide.svg).length<narrowLines.length);assert.equal(printedText(wide.svg).replace(/\s/g,''),printedText(narrow.svg).replace(/\s/g,''));assert.deepEqual(flows(p),before);
 assert.equal(setSelectionProperty(p,copy,'inner','size',3,false),true);
 const larger=renderSvg(p,'inner',{guides:false,measureText:metric});assert.match(larger.svg,/font-size="3"/);assert.ok(textNodes(larger.svg).length>textNodes(wide.svg).length);assert.deepEqual(flows(p),before);
 const reopened=migrate(JSON.parse(JSON.stringify(p))),savedCopy=reopened.surfaces.inner.find(layer=>layer.standardBlockCopy);
 assert.ok(savedCopy);assert.equal(savedCopy.font,'Courier New');assert.equal(savedCopy.color,'#bb2200');assert.equal(savedCopy.size,3);assert.deepEqual(flowText(reopened,savedCopy,'inner',{measureText:metric}).fragments,before[0].fragments);
});

test('legacy project JSON produces the same printable rich-content pixels after reopening and leaves cassette openings intact',()=>{
 const p=project();p.settings.bgInside='#ffffff';
 const labelBefore=['labelA','labelB'].map(surface=>renderSvg(p,surface,{guides:false}).svg);
 p.data.lyrics=rich+'\n> QUOTETOKEN\nLASTTOKEN';p.data.production='© PRODUCTIONTOKEN';
 const snapshot=clone(p),prepared=prepareExport(p,{mode:'jcard',format:'png',dpi:300}),reopened=migrate(JSON.parse(JSON.stringify(p))),again=prepareExport(reopened,{mode:'jcard',format:'png',dpi:300});
 assert.equal(prepared.items.length,2);assert.deepEqual(prepared.items.map(item=>item.s),['outer','inner']);
 const native=item=>new Resvg(item.svg,{fitTo:{mode:'width',value:Math.round(item.w/25.4*300)},font:{loadSystemFonts:true,defaultFontFamily:'Arial'}}).render();
 for(let index=0;index<prepared.items.length;index++){
  const item=prepared.items[index],first=native(item),second=native(again.items[index]);assert.deepEqual(first.asPng(),second.asPng());
  near(item.h,101.6);assert.ok(Math.abs(first.height-item.h/25.4*300)<=1);assert.ok(first.asPng().length>1000);
  if(index===0){const pixels=first.pixels;let ink=0;for(let at=0;at<pixels.length;at+=4)if(pixels[at]<80&&pixels[at+1]<80&&pixels[at+2]<80&&pixels[at+3]>200)ink++;assert.ok(ink>500,`Expected visible printed text and rule, got ${ink} ink pixels`)}
  assert.doesNotMatch(item.svg,/data-guide=|stroke-dasharray=|class="selection"/);
 }
 const labelImage=svg=>new Resvg(svg,{fitTo:{mode:'width',value:886}}).render();
 for(const [index,surface] of ['labelA','labelB'].entries()){
  const original=labelImage(labelBefore[index]),current=labelImage(renderSvg(p,surface,{guides:false}).svg),saved=labelImage(renderSvg(reopened,surface,{guides:false}).svg);
  assert.deepEqual(current.asPng(),original.asPng());assert.deepEqual(saved.asPng(),original.asPng());
  const x=Math.floor(current.width/2),y=Math.floor((p.layout.holeY+p.layout.holeH/2)/p.layout.labelH*current.height);assert.equal(current.pixels[(y*current.width+x)*4+3],0,`${surface} opening remains transparent`);
 }
 assert.deepEqual(p,snapshot);
});
