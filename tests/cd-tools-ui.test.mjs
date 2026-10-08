import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/model.js';
import * as layout from '../src/cd-layout.js';
import * as label from '../src/cd-label-text.js';
import * as poster from '../src/cd-tray-poster.js';
import * as content from '../src/cd-content-edit.js';
import * as selection from '../src/selection-edit.js';
import * as formats from '../src/media-formats.js';
import * as editorActions from '../src/editor-actions.js';
import {syncCDTools} from '../src/cd-tool-sync.js';
import {cdTextPanel,cdLayoutPanel,cdTrayPosterPanel} from '../src/cd-panels.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/lHkAAAAASUVORK5CYII=';
function harness(mode='cd-label',surface=formats.modeDefaultSurface(mode),{realChanged=false}={}){
 const p=model.createProject();p.editorMode=mode;const callbacks=new Map(),history=[],saved=[],toasts=[],outputs=new Map();
 const sectionControls=['artist','album','cdTracks','production'].map(source=>({dataset:{cdSection:source},checked:true,disabled:false})),posterControls=['opacity','blur','scale'].map(key=>({dataset:{cdPoster:key},value:'0'}));
 const panel={querySelector(selector){if(!outputs.has(selector))outputs.set(selector,{});return outputs.get(selector)},querySelectorAll(selector){return selector==='[data-cd-section]'?sectionControls:selector==='[data-cd-poster]'?posterControls:[]}};
 const context=vm.createContext({...model,...layout,...label,...poster,...content,...selection,...formats,...editorActions,rebuildReferenceCDContents,syncCDTools,p,mode,surface,selected:'',joinColumns:false,projectRevision:0,saveTimer:undefined,
  updateReferenceFlapProduction(){},updateRecordLabelLogoColors(){},mirror(){},clearTimeout(){},setTimeout(){return 0},saveProject:async()=>{},
  document:{activeElement:null,addEventListener(type,callback){callbacks.set(type,callback)}},$(){return panel},
  checkpoint(){history.push(model.clone(context.p))},changed(options){saved.push(options)},toast(message){toasts.push(message)},draw(){},full(){},renderPanel(){},renderInspector(){}});
 const input=app.slice(app.indexOf("document.addEventListener('input'"),app.indexOf('\nfunction reflowLyrics('));
 const actions=app.slice(app.indexOf('function cdAction('),app.indexOf('\nfunction uiAction('));
 vm.runInContext(`const layers=()=>p.surfaces[surface],current=()=>layers().find(layer=>layer.id===selected),editFrame=()=>selectionFrame(p,current(),surface,joinColumns);${actions}\n${input}`,context);
 if(realChanged){vm.runInContext(app.slice(app.indexOf('function changed('),app.indexOf('\nfunction selectArtwork(')),context);const actual=context.changed;context.changed=options=>{saved.push(options||{});actual(options)}}
 return {p,context,history,saved,toasts,outputs,panel,sectionControls,posterControls,input(dataset,value,{checked=false,type='checkbox',min='',max=''}={}){callbacks.get('input')({target:{dataset,value:String(value),checked,type,min,max,tagName:'INPUT',hasAttribute(){return false}}})},action(action,source){context.cdAction(action,{dataset:{source},textContent:'Выходные данные'})}};
}
const controls={field:(text,key,value)=>`<input data-bind="data.${key}" value="${model.esc(value)}">`,btn:(text,action,attrs)=>`<button data-action="${action}" ${attrs||''}>${text}</button>`,select:(text,key,value,items,group)=>`<select data-bind="${group}.${key}">${items.map(([key,text])=>`<option>${text}</option>`).join('')}</select>`,check:()=>''};
test('CD Label main text panel exposes four field toggles with their actual visibility',()=>{
 const p=model.createProject();p.surfaces.cdLabel.find(layer=>layer.source==='album').visible=false;
 const html=cdTextPanel(p,'cd-label','cdLabel',controls);
 for(const source of ['artist','album','cdTracks','production'])assert.equal((html.match(new RegExp(`data-cd-section="${source}"`,'g'))||[]).length,1);
 assert.doesNotMatch(html,/data-cd-section="album" checked/);
 for(const mode of ['cd-insert','cd-tray'])assert.doesNotMatch(cdTextPanel(p,mode,formats.modeDefaultSurface(mode),controls),/data-cd-section=/);
});
test('actual CD Label toggles preserve text and other formats with a single undo checkpoint',()=>{
 for(const source of ['artist','album','cdTracks','production']){
  const h=harness(),before=model.clone(h.p);h.input({cdSection:source},'',{checked:false});
  assert.equal(h.history.length,1);assert.equal(h.saved.length,1);assert.deepEqual(h.history[0],before);assert.deepEqual(h.p.data,before.data);
  assert.equal(label.cdLabelSectionState(h.p,source).visible,false);
  for(const face of ['outer','inner','labelA','labelB','cdFront','cdInside','cdTray','cdTrayInside'])assert.deepEqual(h.p.surfaces[face],before.surfaces[face]);
  h.input({cdSection:source},'',{checked:true});assert.equal(label.cdLabelSectionState(h.p,source).visible,true);
 }
});
test('locked duplicate blocks prevent partial changes from a main section toggle',()=>{
 const h=harness(),original=h.p.surfaces.cdLabel.find(layer=>layer.source==='artist');h.p.surfaces.cdLabel.push({...model.clone(original),id:'locked-copy',locked:true});const before=model.clone(h.p);
 h.input({cdSection:'artist'},'',{checked:false});assert.deepEqual(h.p,before);assert.equal(h.history.length,0);assert.match(h.toasts[0],/закреплён/);
 assert.match(cdTextPanel(h.p,'cd-label','cdLabel',controls),/data-cd-section="artist" checked disabled/);
});
test('typing production into an old disc creates the standard small centered line once',()=>{
 const h=harness();h.p.surfaces.cdLabel=h.p.surfaces.cdLabel.filter(layer=>layer.source!=='production');
 h.input({bind:'data.production'},'CREDITSTOKEN',{type:'textarea'});const line=h.p.surfaces.cdLabel.find(layer=>layer.source==='production'),id=line.id;
 assert.equal(line.align,'center');assert.ok(Math.abs(line.size-6*25.4/72)<1e-9);assert.ok(line.y>30&&line.y<31);assert.ok(line.h<3);
 assert.equal(h.history.length,1);h.input({bind:'data.production'},'NEWCREDITSTOKEN',{type:'textarea'});assert.equal(h.p.surfaces.cdLabel.filter(layer=>layer.source==='production').length,1);assert.equal(line.id,id);
});
test('focusing missing production uses the standard line and does not create repeated copies',()=>{
 const h=harness();h.p.surfaces.cdLabel=h.p.surfaces.cdLabel.filter(layer=>layer.source!=='production');h.action('cd-focus-text','production');
 const line=h.p.surfaces.cdLabel.find(layer=>layer.source==='production');assert.equal(h.context.selected,line.id);assert.ok(line.h<3);assert.equal(h.history.length,1);
 h.action('cd-focus-text','production');assert.equal(h.history.length,1);assert.equal(h.p.surfaces.cdLabel.filter(layer=>layer.source==='production').length,1);
});
test('main track visibility restores a list hidden through its content setting',()=>{
 const h=harness(),layer=h.p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');layer.trackOptions={numbers:false,hideTracks:true};layer.hideA=true;layer.hideB=true;
 assert.equal(label.cdLabelSectionState(h.p,'cdTracks').visible,false);h.input({cdSection:'cdTracks'},'',{checked:true});
 assert.equal(layer.trackOptions.hideTracks,false);assert.equal(layer.trackOptions.numbers,false);assert.equal(layer.hideA,undefined);assert.equal(layer.hideB,undefined);
});
test('actual poster sliders modify current artwork without replacing the panel during dragging',()=>{
 const h=harness('cd-tray');applyAlbumArt(h.p,image);const layer=albumArtLayer(h.p,'cdTray'),before=model.clone(h.p);
 h.input({cdPoster:'opacity'},45,{type:'range'});assert.equal(layer.opacity,.45);assert.equal(h.history.length,1);assert.equal(h.saved[0].panel,undefined);
 assert.equal(h.outputs.get('[data-cd-poster-value="opacity"]').textContent,45);
 h.input({cdPoster:'blur'},100,{type:'range'});assert.ok(Math.abs(layer.blur-100*25.4/600)<1e-8);
 h.input({cdPoster:'scale'},1.4,{type:'range'});assert.equal(layer.cropZoom,1.4);
 for(const key of ['id','x','y','w','h','fit','src','rotation'])assert.equal(layer[key],albumArtLayer(before,'cdTray')[key]);assert.deepEqual(h.p.surfaces.cdTrayInside,before.surfaces.cdTrayInside);
});
test('poster preset and locked guard run through the actual action controller',()=>{
 const h=harness('cd-tray');applyAlbumArt(h.p,image);const layer=albumArtLayer(h.p,'cdTray');layer.opacity=.8;layer.blur=0;h.action('cd-poster-original');
 assert.deepEqual(poster.cdTrayPosterState(h.p,'cdTray'),{layerId:layer.id,locked:false,opacity:20,blur:60,scale:1.1});assert.equal(h.history.length,1);
 h.action('cd-poster-original');assert.equal(h.history.length,1);layer.locked=true;const before=model.clone(h.p);h.input({cdPoster:'opacity'},75,{type:'range'});h.action('cd-poster-original');assert.deepEqual(h.p,before);assert.equal(h.history.length,1);
});
test('poster controls display actual artwork values and disable locked controls',()=>{
 const p=model.createProject();p.editorMode='cd-tray';assert.match(cdTrayPosterPanel(p,'cdTray',controls),/добавьте обложку/);applyAlbumArt(p,image);const layer=albumArtLayer(p,'cdTray');layer.opacity=.37;layer.blur=25.4/600*88;layer.cropZoom=1.25;
 const html=cdTrayPosterPanel(p,'cdTray',controls);for(const key of ['opacity','blur','scale'])assert.match(html,new RegExp(`data-cd-poster="${key}"`));assert.match(html,/data-cd-poster-value="opacity">37/);assert.match(html,/data-cd-poster-value="blur">88/);
 layer.locked=true;assert.match(cdTrayPosterPanel(p,'cdTray',controls),/<fieldset[^>]*disabled/);
});
test('actual Tray column options update track flow and shared formatting only on the edited face',()=>{
 const h=harness('cd-tray');h.input({bind:'layout.columns'},2,{type:'number',min:'1',max:'2'});assert.equal(h.p.surfaces.cdTray.filter(layer=>layer.source==='cdTracks').length,2);
 const layers=h.p.surfaces.cdTray.filter(layer=>layer.source==='cdTracks');h.context.selected=layers[0].id;const inside=model.clone(h.p.surfaces.cdTrayInside);h.input({trackOption:'numbers'},'',{checked:false});
 assert.ok(layers.every(layer=>layer.trackOptions.numbers===false));assert.deepEqual(h.p.surfaces.cdTrayInside,inside);layers[1].locked=true;const before=model.clone(h.p),count=h.history.length;h.input({trackOption:'durations'},'',{checked:false});assert.deepEqual(h.p,before);assert.equal(h.history.length,count);
 const html=cdLayoutPanel(h.p,'cd-tray',controls);assert.match(html,/data-bind="layout.columns"/);assert.match(html,/data-bind="data.columnHeight"|columnHeight/);
});
test('revealing a hidden CD Label block through focus updates the existing main checkbox',()=>{
 const h=harness('cd-label','cdLabel',{realChanged:true}),layer=h.p.surfaces.cdLabel.find(layer=>layer.source==='artist'),control=h.sectionControls.find(control=>control.dataset.cdSection==='artist');layer.visible=false;control.checked=false;
 h.action('cd-focus-text','artist');assert.equal(layer.visible,true);assert.equal(control.checked,true);assert.equal(h.history.length,1);
 h.context.selected=layer.id;h.input({prop:'locked'},'',{checked:true});assert.equal(control.disabled,true);assert.equal(h.outputs.get('[data-cd-section-lock="artist"]').hidden,false);
 h.input({prop:'locked'},'',{checked:false});assert.equal(control.disabled,false);assert.equal(h.outputs.get('[data-cd-section-lock="artist"]').hidden,true);
});
test('unlocking a cover and editing it in the inspector synchronizes existing poster controls',()=>{
 const h=harness('cd-tray','cdTray',{realChanged:true});applyAlbumArt(h.p,image);const cover=albumArtLayer(h.p,'cdTray');cover.locked=true;h.context.selected=cover.id;
 syncCDTools(h.p,'cd-tray','cdTray',h.panel);assert.equal(h.outputs.get('[data-cd-poster-controls]').disabled,true);
 h.input({prop:'locked'},'',{checked:false});assert.equal(h.outputs.get('[data-cd-poster-controls]').disabled,false);
 h.input({prop:'opacity'},.73,{type:'number'});h.input({prop:'blur'},60*25.4/600,{type:'number'});h.input({prop:'cropZoom'},1.4,{type:'number'});
 assert.deepEqual(h.posterControls.map(control=>control.value),['73','60','1.4']);assert.equal(h.outputs.get('[data-cd-poster-value="opacity"]').textContent,73);
});
test('control synchronization retains focus and the value of an active range without replacing it',()=>{
 const p=model.createProject();p.editorMode='cd-tray';applyAlbumArt(p,image);const h=harness('cd-tray'),range=h.posterControls[2];range.value='1.456';albumArtLayer(p,'cdTray').cropZoom=1.456;
 syncCDTools(p,'cd-tray','cdTray',h.panel,range);assert.equal(range.value,'1.456');assert.equal(h.outputs.get('[data-cd-poster-value="scale"]').textContent,1.46);assert.equal(h.posterControls[0].value,'20');
});
