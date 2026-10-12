import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/model.js';
import * as selection from '../src/selection-edit.js';
import * as editorActions from '../src/editor-actions.js';
import * as spineStyle from '../src/spine-style.js';
import * as font from '../src/jcard-font.js';
import * as fontUI from '../src/jcard-font-ui.js';
import * as formats from '../src/media-formats.js';
import {renderSvg} from '../src/render.js';
import {prepareExport} from '../src/export.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controls={btn:(text,action,attrs)=>`<button data-action="${action}" ${attrs||''}>${text}</button>`,propCheck:(_,key)=>`<input data-prop="${key}">`};
function harness(params={}){
 const p=model.importReference(model.createProject(),'https://vhs.texs.org/en/jcard?'+new URLSearchParams({musicArtist:'',musicAlbum:'Short',musicA:'Track',f3:'~Georgia.2s.4.2s.0',...params})),layer=p.surfaces.outer.find(layer=>layer.source==='spine'),callbacks=new Map(),history=[],toasts=[];
 const fields=new Map([['size',{dataset:{prop:'size'},value:'0'}],['albumSize',{dataset:{albumStyle:'size'},value:'0'}]]),artistHint={textContent:''},albumHint={textContent:''},artistButton={disabled:false},albumButton={disabled:false};
 const section=(hint,button)=>({querySelector(selector){return selector==='.hint'?hint:selector.startsWith('[data-action=')?button:null}});
 const artistControls=section(artistHint,artistButton),albumControls=section(albumHint,albumButton);
 const inspector={renders:0,querySelector(selector){return selector==='[data-jcard-font-inspector]'?artistControls:selector==='[data-jcard-album-font-inspector]'?albumControls:selector==='[data-prop="size"]'?fields.get('size'):selector==='[data-album-style="size"]'?fields.get('albumSize'):null}};
 const panel={querySelector(){return null},querySelectorAll(){return []}};
 const context=vm.createContext({...model,...selection,...editorActions,...spineStyle,...font,...fontUI,...formats,p,mode:'jcard',surface:'outer',selected:layer.id,trackSide:'A',joinColumns:true,projectRevision:0,saveTimer:undefined,
  document:{activeElement:null,addEventListener(type,callback){callbacks.set(type,callback)}},$(id){return id==='inspector'?inspector:panel},
  syncReferenceCDTrayFonts(){},syncCDTools(){},updateReferenceFlapProduction(){},updateRecordLabelLogoColors(){},mirror(){},draw(){},renderPanel(){},renderInspector(){inspector.renders++},
  checkpoint(){history.push(model.clone(p))},toast(message){toasts.push(message)},clearTimeout(){},setTimeout(){return 0},saveProject:async()=>{}});
 const setup='const layers=()=>p.surfaces[surface],current=()=>layers().find(layer=>layer.id===selected),editFrame=()=>selectionFrame(p,current(),surface,joinColumns),editMembers=()=>selectionMembers(p,current(),surface,joinColumns);';
 const changed=app.slice(app.indexOf('function changed('),app.indexOf('\nfunction selectArtwork('));
 const actions=app.slice(app.indexOf('function uiAction('),app.indexOf("\ndocument.addEventListener('input'"));
 const input=app.slice(app.indexOf("document.addEventListener('input'"),app.indexOf('\nfunction reflowLyrics('));
 vm.runInContext([setup,changed,actions,input].join('\n'),context);
 return {p,layer,context,history,toasts,fields,artistHint,albumHint,artistButton,albumButton,inspector,input(dataset,value,{element,type='number',checked=false}={}){const target=Object.assign(element||{},{dataset,value:String(value),type,checked,tagName:'INPUT',min:'',max:'',hasAttribute(name){return name==='data-album-style'&&Object.hasOwn(dataset,'albumStyle')}});context.document.activeElement=target;callbacks.get('input')({target});return target},action(action){context.uiAction(action,{dataset:{}})}};
}

test('imported J-card inspector exposes independent auto-size controls while generic text keeps frame fitting',()=>{
 const h=harness();let html=fontUI.jcardFontInspectorControls(h.p,h.layer,controls);
 assert.match(html,/data-jcard-font-inspector/);assert.match(html,/data-action="jcard-auto-font"/);assert.match(html,/data-prop="autoFit"/);assert.match(html,/подобран по оригиналу/);
 html=fontUI.jcardFontInspectorControls(h.p,h.layer,{...controls,album:true});assert.match(html,/data-jcard-album-font-inspector/);assert.match(html,/data-action="jcard-auto-album-font"/);assert.doesNotMatch(html,/data-prop="autoFit"/);
 h.layer.locked=true;assert.match(fontUI.jcardFontInspectorControls(h.p,h.layer,controls),/disabled/);
 assert.equal(fontUI.jcardFontInspectorControls(model.createProject(),model.makeLayer('text'),controls),'<input data-prop="autoFit">');
});

test('actual album metadata input updates auto artist and album sizes without replacing the inspector',()=>{
 const h=harness();h.context.changed();const previous=h.layer.size,input=h.input({bind:'data.album'},'x'.repeat(50),{type:'text'});
 assert.ok(h.layer.size<previous);assert.ok(Math.abs(h.layer.size-66*25.4/600)<1e-9);assert.equal(h.layer.albumStyle.size,h.layer.size);
 assert.equal(h.fields.get('size').value,String(Number(h.layer.size.toFixed(3))));assert.equal(h.fields.get('albumSize').value,h.fields.get('size').value);
 assert.match(h.artistHint.textContent,/подобран по оригиналу/);assert.match(h.albumHint.textContent,/подобран по оригиналу/);
 assert.equal(h.context.document.activeElement,input);assert.equal(h.inspector.renders,0);assert.equal(h.history.length,1);
});

test('actual manual artist and album size inputs retain focus and full precision independently',()=>{
 const h=harness(),field=h.fields.get('size');h.input({prop:'size'},'2.3456',{element:field});
 assert.equal(h.layer.size,2.3456);assert.equal(field.value,'2.3456');assert.equal(h.context.document.activeElement,field);assert.equal(h.inspector.renders,0);assert.match(h.artistHint.textContent,/задан вручную/);
 const albumField=h.fields.get('albumSize'),artist=h.layer.size;h.input({albumStyle:'size'},'1.7654',{element:albumField});
 assert.equal(h.layer.albumStyle.size,1.7654);assert.equal(h.layer.size,artist);assert.equal(albumField.value,'1.7654');assert.equal(h.context.document.activeElement,albumField);assert.equal(h.inspector.renders,0);assert.match(h.albumHint.textContent,/задан вручную/);
 const before=model.clone(h.p);h.context.changed();assert.deepEqual(h.p,before);assert.equal(h.history.length,2);
});

test('actual restore action creates one undo checkpoint, keeps geometry and protects locked fonts',()=>{
 const h=harness();h.layer.size=2;h.layer.albumStyle.size=1.5;h.layer.x+=3;const before=model.clone(h.p),album=model.clone(h.layer.albumStyle),x=h.layer.x;
 h.action('jcard-auto-font');assert.equal(h.history.length,1);assert.deepEqual(h.history[0],before);assert.equal(h.layer.x,x);assert.ok(Math.abs(h.layer.size-141*25.4/600)<1e-9);assert.deepEqual(h.layer.albumStyle,album);
 h.action('jcard-auto-album-font');assert.equal(h.history.length,2);assert.equal(h.layer.albumStyle.size,h.layer.size);
 h.layer.locked=true;const locked=model.clone(h.p);h.context.changed();assert.equal(h.artistButton.disabled,true);assert.equal(h.albumButton.disabled,true);
 h.action('jcard-auto-font');h.action('jcard-auto-album-font');assert.deepEqual(h.p,locked);assert.equal(h.history.length,2);assert.match(h.toasts.at(-1),/закрепление/);
});

test('manual J-card inspector sizes reach the exact renderer used by clean export',()=>{
 const h=harness();h.input({prop:'size'},'2.3456',{element:h.fields.get('size')});h.input({albumStyle:'size'},'1.7654',{element:h.fields.get('albumSize')});
 const before=model.clone(h.p),preview=renderSvg(h.p,'outer',{guides:false}),exported=prepareExport(h.p,{mode:'jcard',surface:'outer',selection:'current',guides:false}).items[0];
 assert.equal(exported.svg,preview.svg);assert.ok([...preview.svg.matchAll(/font-size="([^"]+)"/g)].some(([,size])=>Math.abs(Number(size)-1.7654)<1e-9));assert.deepEqual(h.p,before);assert.equal(h.history.length,2);
});
