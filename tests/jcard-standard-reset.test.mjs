import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/model.js';
import {resetJCardStandardBlocks} from '../src/jcard-standard-reset.js';
import {rebuildReferenceFlow,markReferenceGeometry,findReferenceFlowCopySource} from '../src/reference-flow.js';
import {duplicateSelection,selectionFrame} from '../src/selection-edit.js';
import {canRunLayerAction} from '../src/editor-actions.js';
import {flowText,renderSvg} from '../src/render.js';
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const imported=()=>model.importReference(model.createProject(),'https://vhs.texs.org/en/jcard?face=p5&ds=1&dc=1&musicArtist=ARTISTTOKEN&musicAlbum=ALBUMTOKEN&musicA=TRACKTOKEN&musicLyrics=LYRICTOKEN&musicProd=CREDITSTOKEN');
const art=()=>[
 model.makeLayer('image',{name:'Cover',category:'albumCover',src:'data:image/png;base64,AA==',x:41,y:8,w:27,h:36,cropZoom:1.7}),
 model.makeLayer('text',{text:'CUSTOMTOKEN',x:9,y:15,w:32,h:11,font:'Georgia'}),
 model.makeLayer('qr',{text:'https://example.com',x:11,y:65,w:15,h:15}),
 model.makeLayer('barcode',{text:'5901234123457',x:90,y:68,w:25,h:12}),
 model.makeLayer('shape',{color:'#cc0022',x:78,y:1,w:2,h:14})
];

test('J-card standard reposition keeps artwork, type styles, copies and every unrelated format',()=>{
 const p=model.createProject(),original=p.surfaces.outer.find(layer=>layer.source==='artist'),expected=frame(original);
 Object.assign(original,{x:49,y:31,w:21,h:17,rotation:19,font:'Georgia',size:5,color:'#cc2200',referenceOwnColor:true,visible:false});
 const copies=duplicateSelection(p,original,'outer');copies[0].name='Renamed independent copy';p.surfaces.outer.unshift(...copies);p.surfaces.outer.push(...art());p.surfaces.inner.push(...art());
 p.surfaces.labelA.push(model.makeLayer('text',{text:'LOCKED LABEL',locked:true}));
 const manual=model.clone([...copies,...p.surfaces.outer.slice(-5),...p.surfaces.inner.slice(-5)]),unrelated=model.clone(Object.fromEntries(Object.entries(p.surfaces).filter(([surface])=>!['outer','inner'].includes(surface))));
 const lengths={outer:p.surfaces.outer.length,inner:p.surfaces.inner.length},result=resetJCardStandardBlocks(p);
 assert.ok(result.updated);assert.deepEqual(frame(original),expected);assert.equal(original.font,'Georgia');assert.equal(original.size,5);assert.equal(original.color,'#cc2200');assert.equal(original.visible,false);
 for(const layer of manual)assert.deepEqual(Object.values(p.surfaces).flat().find(next=>next.id===layer.id),layer);
 assert.deepEqual(Object.fromEntries(Object.entries(p.surfaces).filter(([surface])=>!['outer','inner'].includes(surface))),unrelated);
 for(const surface of ['outer','inner'])assert.equal(p.surfaces[surface].length,lengths[surface]);
});

test('locked J-card standard layers retain their complete state without duplicate defaults',()=>{
 const p=model.createProject(),locked=p.surfaces.outer.find(layer=>layer.source==='spine');Object.assign(locked,{locked:true,x:3,y:17,w:33,h:18,rotation:21,size:7});
 const before=model.clone(locked),count=p.surfaces.outer.length,result=resetJCardStandardBlocks(p);
 assert.equal(result.locked,1);assert.deepEqual(p.surfaces.outer.find(layer=>layer.id===locked.id),before);assert.equal(p.surfaces.outer.length,count);
});

test('imported J-card reposition retains the original flow, styles and independent copies',()=>{
 const p=imported(),flow=p.surfaces.outer.find(layer=>layer.referenceFlow),spine=p.surfaces.outer.find(layer=>layer.referenceSpine),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks');
 const expected=new Map([flow,spine,flap].map(layer=>[layer.id,frame(layer)])),copies=[...duplicateSelection(p,flow,'outer'),...duplicateSelection(p,spine,'outer'),...duplicateSelection(p,flap,'outer')];
 for(const layer of [flow,spine,flap]){Object.assign(layer,{x:42,y:31,w:22,h:19,rotation:17,font:'Georgia',color:'#cc2200',size:4,referenceOwnColor:true,referenceBlock:'default-inside1'});markReferenceGeometry(layer)}
 flow.trackOptions={...flow.trackOptions,numbers:false};copies.forEach((layer,index)=>layer.name='Renamed copy '+index);p.surfaces.outer.unshift(...copies);p.surfaces.outer.push(...art());
 const copyBefore=model.clone(copies),flowTemplate=model.clone(p.referenceFlowTemplate),sourceIds=Object.values(p.surfaces).flat().filter(layer=>layer.referenceFlow).map(layer=>layer.id),freePlace=model.clone(p.referenceFreePlace);
 resetJCardStandardBlocks(p);
 for(const layer of [flow,spine,flap]){assert.deepEqual(frame(layer),expected.get(layer.id));assert.equal(layer.font,'Georgia');assert.equal(layer.size,4);assert.equal(layer.color,'#cc2200');assert.equal(layer.referenceBlock,undefined);assert.equal(layer.referenceManualGeometry,undefined)}
 assert.equal(flow.trackOptions.numbers,false);assert.equal(p.layout.referenceTemplate,true);assert.deepEqual(p.referenceFlowTemplate,flowTemplate);assert.deepEqual(p.referenceFreePlace,freePlace);
 assert.deepEqual(Object.values(p.surfaces).flat().filter(layer=>layer.referenceFlow).map(layer=>layer.id),sourceIds);
 copies.forEach((layer,index)=>assert.deepEqual(layer,copyBefore[index]));
 assert.equal(findReferenceFlowCopySource(p,copies[0]).layer.id,flow.id);assert.deepEqual(flowText(p,copies[0],'outer'),flowText(p,flow,'outer'));
 // Structured headings can wrap inside these deliberately large type faces.
 // Reposition must preserve every token exactly once across all viewports.
 const text=Object.entries(p.surfaces).flatMap(([surface,layers])=>layers.filter(layer=>layer.referenceFlow).map(layer=>flowText(p,layer,surface).text)).join('').replace(/\s/g,'');
 for(const token of ['ARTISTTOKEN','ALBUMTOKEN','TRACKTOKEN','LYRICTOKEN','CREDITSTOKEN'])assert.equal((text.match(new RegExp(token,'g'))||[]).length,1);
 assert.match(renderSvg(p,'outer').svg,/CUSTOMTOKEN/);
});

test('a lock on one imported column protects the joined frame while other panels reset',()=>{
 const p=imported(),pair=p.surfaces.outer.filter(layer=>layer.referenceFlow&&layer.referencePanelIndex===3),other=p.surfaces.inner.find(layer=>layer.referenceFlow),expected=frame(other);
 for(const layer of pair){Object.assign(layer,{x:9+layer.referenceColumn*14,y:33,w:11,h:29,rotation:13});markReferenceGeometry(layer)}
 pair[1].locked=true;Object.assign(other,{x:4,y:41,w:22,h:31,rotation:21});markReferenceGeometry(other);const before=model.clone(pair);
 const result=resetJCardStandardBlocks(p);assert.equal(result.locked,1);assert.deepEqual(pair,before);assert.deepEqual(frame(other),expected);
});

test('inactive imported slots and template survive reposition, save and later restoration',()=>{
 const p=imported(),archived=p.surfaces.inner.find(layer=>layer.referenceFlow);Object.assign(archived,{x:13,y:32,w:23,h:29,rotation:7,font:'Georgia',size:4,locked:true});markReferenceGeometry(archived);
 p.layout.panels=3;p.layout.double=false;rebuildReferenceFlow(p);const archive=model.clone(p.referenceFlowArchive),template=model.clone(p.referenceFlowTemplate);
 resetJCardStandardBlocks(p);assert.deepEqual(p.referenceFlowArchive,archive);assert.deepEqual(p.referenceFlowTemplate,template);
 const reopened=model.migrate(JSON.parse(JSON.stringify(p)));reopened.layout.panels=5;reopened.layout.double=true;rebuildReferenceFlow(reopened);
 const restored=reopened.surfaces.inner.find(layer=>layer.id===archived.id);assert.ok(restored);assert.deepEqual(frame(restored),frame(archived));assert.equal(restored.locked,true);assert.equal(restored.font,'Georgia');assert.equal(restored.size,4);
});

test('actual J-card reposition command preserves one complete undo snapshot and imported archives',()=>{
 const p=imported();p.surfaces.outer.push(...art());p.surfaces.labelA.push(model.makeLayer('text',{text:'LABELTOKEN',locked:true}));
 const moved=p.surfaces.outer.find(layer=>layer.referenceSpine);moved.x+=12;markReferenceGeometry(moved);const before=model.clone(p),history=[],saved=[],toasts=[];
 const context=vm.createContext({...model,resetJCardStandardBlocks,selectionFrame,canRunLayerAction,isCDMode:mode=>mode.startsWith('cd-'),p,mode:'jcard',surface:'outer',selected:moved.id,joinColumns:true,current:()=>moved,layers:()=>p.surfaces.outer,checkpoint:()=>history.push(model.clone(p)),changed:()=>saved.push(model.clone(p)),toast:message=>toasts.push(message)});
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.runInContext(app.slice(app.indexOf('function uiAction('),app.indexOf('\ndocument.addEventListener(\'click\'')),context);context.uiAction('reset-layout');
 assert.equal(history.length,1);assert.equal(saved.length,1);assert.deepEqual(history[0],before);assert.match(toasts[0],/Свои картинки и текст сохранены/);assert.equal(context.selected,'');
 assert.deepEqual(p.surfaces.labelA,before.surfaces.labelA);assert.equal(p.layout.referenceTemplate,true);assert.deepEqual(p.referenceFlowTemplate,before.referenceFlowTemplate);assert.deepEqual(p.referenceFlowArchive,before.referenceFlowArchive);assert.deepEqual(p.surfaces.outer.slice(-5),before.surfaces.outer.slice(-5));
 context.p=history[0];assert.deepEqual(context.p,before);
});

test('old unmarked spine and flap copies survive save, reopen and reordered stacking',()=>{
 for(const reference of [false,true]){
  const raw=reference?imported():model.createProject(),sources=reference?['spine','flapTracks']:['spine','artist'],expected=new Map();
  for(const source of sources){
   const original=raw.surfaces.outer.find(layer=>layer.source===source);expected.set(source,frame(original));
   const oldCopy={...model.clone(original),id:model.uid(),name:original.name+' копия',x:91,y:25,w:17,h:28,rotation:12};delete oldCopy.standardBlockCopy;
   raw.surfaces.outer.unshift(oldCopy);Object.assign(original,{x:43,y:21,w:22,h:31,rotation:-17});markReferenceGeometry(original);
  }
  const p=model.migrate(JSON.parse(JSON.stringify(raw))),copies=p.surfaces.outer.filter(layer=>layer.name.endsWith(' копия')),before=model.clone(copies);
  resetJCardStandardBlocks(p);
  copies.forEach((layer,index)=>assert.deepEqual(layer,before[index]));
  for(const source of sources){const original=p.surfaces.outer.find(layer=>layer.source===source&&!layer.name.endsWith(' копия'));assert.deepEqual(frame(original),expected.get(source))}
 }
});

test('renamed old source twins with ambiguous provenance are preserved instead of choosing by order',()=>{
 for(const reference of [false,true]){
  const p=reference?imported():model.createProject(),original=p.surfaces.outer.find(layer=>layer.source==='spine');
  original.name='Renamed original';Object.assign(original,{x:43,y:21,w:22,h:31,rotation:-17});markReferenceGeometry(original);
  const oldCopy={...model.clone(original),id:model.uid(),name:'Renamed old copy',x:91,y:25,w:17,h:28,rotation:12};delete oldCopy.standardBlockCopy;p.surfaces.outer.unshift(oldCopy);
  const before=model.clone([original,oldCopy]);resetJCardStandardBlocks(p);assert.deepEqual([original,oldCopy],before);
 }
 const p=model.createProject(),original=p.surfaces.outer.find(layer=>layer.source==='spine'),copy={...model.clone(original),id:model.uid(),name:original.name+' копия',x:91,y:25,rotation:12};
 p.surfaces.outer=p.surfaces.outer.filter(layer=>layer!==original);p.surfaces.outer.unshift(copy);const before=model.clone(copy);resetJCardStandardBlocks(p);assert.deepEqual(copy,before);
});
