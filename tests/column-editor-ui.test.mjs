import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as selection from '../src/selection-edit.js';
import * as transforms from '../src/transforms.js';
import * as actions from '../src/editor-actions.js';
import * as model from '../src/model.js';
import * as flow from '../src/reference-flow.js';
import {groupFor,frameFor} from '../src/flow-editing.js';
import {snapMove} from '../src/snapping.js';
import {flowText,renderSvg} from '../src/render.js';
import * as formats from '../src/media-formats.js';

// Evaluate the shipped event-handler source with a small DOM stub. This is an
// application integration test, not browser or desktop UI automation.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function block(start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first);assert.ok(first>=0&&last>first,`Missing handler boundaries: ${start}`);return source.slice(first,last);
}
const actionSource=block('function uiAction(',"\ndocument.addEventListener('click'");
const inputSource=block("document.addEventListener('input'",'\nfunction reflowLyrics(');
const keySource=block("document.addEventListener('keydown'",'\nfunction point(');
const pointerSource=block("$('canvas').addEventListener('pointerdown'","\n$('panel').addEventListener('dragstart'");
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const panel=(p,surface='inner')=>p.surfaces[surface].filter(l=>l.referenceFlow&&l.referencePanelIndex===2);

function harness({joined=true}={}){
 const project=model.importReference(model.createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&dc=1'),pair=panel(project);
 Object.assign(pair[0],{x:10,y:20,w:12,h:30,rotation:0,size:2,spacing:.2,color:'#ff6600',referenceManualGeometry:true});
 Object.assign(pair[1],{x:30,y:20,w:16,h:25,rotation:0,size:3,spacing:.4,color:'#0055aa',referenceManualGeometry:true});
 const documentEvents=new Map(),canvasEvents=new Map(),preferences=new Map(),changes=[],toasts=[],fields=new Map(),canvas={
  addEventListener(type,handler){canvasEvents.set(type,handler)},setPointerCapture(){},querySelector(){return null}
 };
 const inspector={querySelector(selector){if(!fields.has(selector))fields.set(selector,{value:''});return fields.get(selector)}};
 const context=vm.createContext({...selection,...transforms,...actions,...model,...flow,...formats,snapMove,groupFor,
  p:project,surface:'inner',selected:pair[0].id,joinColumns:joined,drag:null,cropEditing:false,mode:'jcard',tab:'text',trackSide:'A',
  document:{addEventListener(type,handler){documentEvents.set(type,handler)}},
  localStorage:{setItem(key,value){preferences.set(key,value)},getItem(key){return preferences.get(key)||null}},
  $:id=>id==='canvas'?canvas:id==='inspector'?inspector:{click(){},value:'',dataset:{}},
  checkpoint(){},changed(options){changes.push(options)},draw(){},renderInspector(){},renderPanel(){},toast(value){toasts.push(value)},
  point:event=>({x:event.clientX,y:event.clientY}),reflowLyrics(){flow.rebuildReferenceFlow(project)},
  saveLibrary(){},history:[],future:[]
 });
 vm.runInContext(`const layers=()=>p.surfaces[surface];const current=()=>layers().find(l=>l.id===selected);
 const editFrame=()=>selectionFrame(p,current(),surface,joinColumns);
 const editMembers=(layer=current())=>selectionMembers(p,layer,surface,joinColumns);
 const editGeometry=patch=>applySelectionFrame(captureSelection(p,current(),surface,joinColumns),patch);
 ${actionSource}\n${inputSource}\n${keySource}\n${pointerSource}`,context);
 const emit=(type,target,extra={})=>{
  const event={target,preventDefault(){this.defaultPrevented=true},shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...extra};documentEvents.get(type)(event);return event;
 };
 const input=(dataset,value,{type='number',checked=false,attributes=[]}={})=>emit('input',{dataset,value:String(value),type,checked,tagName:'INPUT',hasAttribute(name){return attributes.includes(name)}});
 const pointer=(type,{x=0,y=0,id=context.selected,handle=null,...extra}={})=>{
  const event={clientX:x,clientY:y,pointerId:1,preventDefault(){this.defaultPrevented=true},shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...extra,
   target:{closest(selector){return selector==='[data-preview-surface]'?{dataset:{previewSurface:context.surface}}:selector==='[data-layer]'&&id?{dataset:{layer:id}}:selector==='[data-handle]'&&handle?{dataset:{handle}}:null}}
  };
  canvasEvents.get(type)(event);return event;
 };
 return {p:project,pair,context,changes,toasts,preferences,fields,input,pointer,
  action(name,dataset={}){context.uiAction(name,{dataset})},
  key(key,extra={}){return emit('keydown',{tagName:'DIV'}, {key,...extra})},
  frame(){return selection.selectionFrame(project,project.surfaces[context.surface].find(l=>l.id===context.selected),context.surface,context.joinColumns)}
 };
}

test('actual numeric inspector inputs move, resize and rotate the whole panel around its center',()=>{
 const h=harness();h.input({prop:'w'},72);near(h.pair[0].w,24);near(h.pair[1].w,32);near(h.pair[1].x,50);near(h.pair[0].size,4);near(h.frame().h,60);
 h.input({prop:'x'},100);near(h.pair[0].x,100);near(h.pair[1].x,140);
 const center=transforms.layerCenter(h.frame());h.input({prop:'rotation'},90);
 near(transforms.layerCenter(h.frame()).x,center.x);near(transforms.layerCenter(h.frame()).y,center.y);assert.ok(h.pair.every(l=>l.rotation===90));
 near(Number(h.fields.get('[data-prop="x"]').value),h.frame().x);near(Number(h.fields.get('[data-prop="y"]').value),h.frame().y);
 h.input({prop:'color'},'#112233',{type:'color'});assert.ok(h.pair.every(l=>l.color==='#112233'&&l.referenceOwnColor));
 h.input({prop:'bold'},'',{type:'checkbox',checked:true});assert.ok(h.pair.every(l=>l.bold&&l.fontWeight===700));
});

test('the actual joint-edit checkbox persists preference and restores individual edits without changing its peer',()=>{
 const h=harness(),before=structuredClone(h.pair[1]);
 h.input({},'',{type:'checkbox',checked:false,attributes:['data-join-columns']});assert.equal(h.context.joinColumns,false);assert.equal(h.preferences.get('cassette-join-columns'),'0');
 h.input({prop:'w'},21);assert.equal(h.pair[0].w,21);assert.deepEqual(h.pair[1],before);
 h.input({},'',{type:'checkbox',checked:true,attributes:['data-join-columns']});assert.equal(h.preferences.get('cassette-join-columns'),'1');
 h.input({prop:'font'},'Georgia',{type:'text'});assert.ok(h.pair.every(l=>l.font==='Georgia'));
});

test('actual pointer dragging translates both columns from the initial baseline and Shift constrains one axis',()=>{
 const h=harness();h.pointer('pointerdown',{x:10,y:20});h.pointer('pointermove',{x:14,y:26});near(h.pair[0].x,14);near(h.pair[1].x,34);near(h.pair[0].y,26);
 h.pointer('pointermove',{x:18,y:23});near(h.pair[0].x,18);near(h.pair[1].x,38);near(h.pair[0].y,23);
 h.pointer('pointermove',{x:19,y:21,shiftKey:true});near(h.pair[0].x,19);near(h.pair[0].y,20);near(h.pair[1].y,20);
 h.pointer('pointerup');assert.equal(h.context.drag,null);assert.ok(h.changes.some(value=>value?.mirrorLayers));
});

test('actual snapping excludes the panel own columns and Ctrl-corner drag chooses rotation',()=>{
 const h=harness();for(const layer of h.p.surfaces.inner)if(!h.pair.includes(layer))layer.visible=false;h.p.settings.snap=true;h.pointer('pointerdown',{x:10,y:20});h.pointer('pointermove',{x:10.5,y:20});near(h.pair[0].x,10.5);near(h.pair[1].x,30.5);h.pointer('pointerup');
 const frame=h.frame(),center=transforms.layerCenter(frame);
 h.pointer('pointerdown',{x:center.x+20,y:center.y,handle:'resize',ctrlKey:true});assert.equal(h.context.drag.kind,'rotate');
 h.pointer('pointermove',{x:center.x,y:center.y+20});near(h.pair[0].rotation,90);near(h.pair[1].rotation,90);h.pointer('pointerup');
});

test('actual corner resize keeps the whole panel aspect ratio and rotates both columns through its center',()=>{
 const h=harness(),before=h.frame();h.pointer('pointerdown',{x:46,y:50,handle:'resize'});h.pointer('pointermove',{x:82,y:80});near(h.frame().w,72);near(h.frame().h,60);near(h.pair[0].size,4);near(h.pair[1].size,6);h.pointer('pointerup');
 const frame=h.frame(),center=transforms.layerCenter(frame);
 h.pointer('pointerdown',{x:center.x+20,y:center.y,handle:'rotate'});h.pointer('pointermove',{x:center.x,y:center.y+20});
 near(h.pair[0].rotation,90);near(h.pair[1].rotation,90);near(transforms.layerCenter(h.frame()).x,center.x);near(transforms.layerCenter(h.frame()).y,center.y);h.pointer('pointercancel');assert.equal(h.context.drag,null);
 near(h.frame().w/before.w,2);
});

test('actual Alt-drag creates and moves a separate two-column copy while preserving its original',()=>{
 const h=harness(),original=structuredClone(h.pair),count=h.p.surfaces.inner.length;
 h.pointer('pointerdown',{x:10,y:20,altKey:true});assert.equal(h.p.surfaces.inner.length,count+2);assert.ok(!h.pair.some(l=>l.id===h.context.selected));
 h.pointer('pointermove',{x:18,y:29});h.pointer('pointerup');assert.deepEqual(h.pair,original);
 const copies=h.p.surfaces.inner.filter(l=>l.referenceFlowEditGroup);assert.equal(copies.length,2);near(copies[0].x,18);near(copies[1].x,38);near(copies[0].y,29);
 assert.deepEqual(groupFor(h.p,copies[0],'inner').layers,copies);for(let i=0;i<2;i++)assert.deepEqual(flowText(h.p,copies[i],'inner'),flowText(h.p,h.pair[i],'inner'));
});

test('actual keyboard arrows and shortcuts edit a whole panel and respect typing fields',()=>{
 const h=harness();assert.equal(h.key('ArrowRight').defaultPrevented,true);near(h.pair[0].x,11);near(h.pair[1].x,31);
 h.key('ArrowDown',{shiftKey:true});near(h.pair[0].y,25);near(h.pair[1].y,25);
 h.key('ArrowRight',{target:{tagName:'INPUT'}});near(h.pair[0].x,11);
 const count=h.p.surfaces.inner.length;h.key('d',{ctrlKey:true});assert.equal(h.p.surfaces.inner.length,count+2);
 const selected=h.p.surfaces.inner.find(l=>l.id===h.context.selected),copyIds=new Set(groupFor(h.p,selected,'inner').layers.map(l=>l.id));
 h.key('Delete');assert.ok(!h.p.surfaces.inner.some(l=>copyIds.has(l.id)));assert.ok(h.p.surfaces.inner.includes(h.pair[0]));
});

test('actual Delete hides original flow slots, preserving copies and content after layout reflow',()=>{
 const h=harness(),copies=selection.duplicateSelection(h.p,h.pair[0],'inner');h.p.surfaces.inner.push(...copies);
 const originalIds=h.pair.map(l=>l.id),textBefore=copies.map(l=>flowText(h.p,l,'inner').text),otherTexts=h.p.surfaces.inner.filter(l=>l.referenceFlow&&!originalIds.includes(l.id)).map(l=>flowText(h.p,l,'inner').text);
 h.key('Delete');assert.ok(originalIds.every(id=>h.p.surfaces.inner.some(l=>l.id===id)));assert.ok(h.pair.every(l=>!l.visible));
 assert.deepEqual(copies.map(l=>flowText(h.p,l,'inner').text),textBefore);
 assert.deepEqual(h.p.surfaces.inner.filter(l=>l.referenceFlow&&!originalIds.includes(l.id)).map(l=>flowText(h.p,l,'inner').text),otherTexts);
 flow.rebuildReferenceFlow(h.p);assert.ok(panel(h.p).every(l=>!l.visible));assert.deepEqual(copies.map(l=>flowText(h.p,l,'inner').text),textBefore);
});

test('actual copy-other adds a separate complete group with stable source text to the reverse face',()=>{
 const h=harness(),before=structuredClone(h.pair),count=h.p.surfaces.outer.length;
 h.action('copy-other');const copies=h.p.surfaces.outer.slice(count);assert.equal(copies.length,2);assert.deepEqual(h.pair,before);
 for(let i=0;i<2;i++){near(copies[i].x,h.pair[i].x);near(copies[i].y,h.pair[i].y);assert.deepEqual(flowText(h.p,copies[i],'outer'),flowText(h.p,h.pair[i],'inner'))}
 assert.deepEqual(groupFor(h.p,copies[0],'outer').layers,copies);
});

test('actual locks block edits and dragging when one peer is locked, while Ctrl+D and explicit unlock work',()=>{
 const h=harness();h.pair[1].locked=true;const before=structuredClone(h.pair);
 h.input({prop:'x'},200);h.input({prop:'font'},'Georgia',{type:'text'});h.key('ArrowRight');h.pointer('pointerdown',{x:10,y:20});assert.equal(h.context.drag,null);assert.deepEqual(h.pair,before);
 const count=h.p.surfaces.inner.length;h.key('d',{ctrlKey:true});assert.equal(h.p.surfaces.inner.length,count+2,'Locked group must support keyboard duplication just like its button');
 h.context.selected=h.pair[0].id;h.input({prop:'locked'},'',{type:'checkbox',checked:false});assert.ok(h.pair.every(l=>!l.locked));h.key('ArrowRight');near(h.pair[0].x,11);near(h.pair[1].x,31);
});

test('actual layer-list controls operate on their target panel and layer ordering keeps both columns together',()=>{
 const h=harness(),other=h.p.surfaces.inner.filter(l=>l.referenceFlow&&l.referencePanelIndex!==2);
 assert.equal(other.length,2);h.action('visibility',{id:other[1].id});assert.ok(other.every(l=>!l.visible));assert.ok(h.pair.every(l=>l.visible));
 h.action('lock-layer',{id:other[1].id});assert.ok(other.every(l=>l.locked));assert.ok(h.pair.every(l=>!l.locked));
 h.action('lock-layer',{id:other[0].id});assert.ok(other.every(l=>!l.locked));
 const textBefore=h.pair.map(l=>flowText(h.p,l,'inner').text);
 h.action('forward');assert.deepEqual(h.p.surfaces.inner.slice(-2).map(l=>l.id),h.pair.map(l=>l.id));assert.deepEqual(h.pair.map(l=>flowText(h.p,l,'inner').text),textBefore);
 h.action('backward');assert.deepEqual(h.p.surfaces.inner.slice(0,2).map(l=>l.id),h.pair.map(l=>l.id));
});

test('actual rendered selection uses the whole rotated group frame instead of a single-column outline',()=>{
 const h=harness();h.action('rotate-right');const frame=h.frame(),svg=renderSvg(h.p,'inner',{editing:true,selected:h.context.selected,selectionFrame:frame}).svg;
 assert.match(svg,new RegExp(`width="${frame.w}" height="${frame.h}" fill="none"`));assert.equal((svg.match(/data-handle="resize"/g)||[]).length,1);assert.equal((svg.match(/data-handle="rotate"/g)||[]).length,1);
 near(transforms.layerCenter(frame).x,28);near(transforms.layerCenter(frame).y,35);
});
