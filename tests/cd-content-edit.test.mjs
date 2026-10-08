import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/model.js';
import * as editing from '../src/cd-content-edit.js';
import * as actions from '../src/editor-actions.js';
import * as selection from '../src/selection-edit.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {flowText} from '../src/render.js';

function project(reference=false){
 const p=reference?model.importReference(model.createProject(),'https://vhs.texs.org/en/cd-insert?mode=d2&dc=1'):model.createProject();
 p.editorMode='cd-insert';p.layout.cdInsertDouble=true;
 p.data={...p.data,artist:'ARTISTTOKEN',album:'ALBUMTOKEN',lyrics:'LYRICSTOKEN',production:'CREDITSTOKEN',A:[{title:'TRACKTOKEN',seconds:123,artist:'SINGERTOKEN'}],B:[]};
 return p;
}
const contents=p=>['cdFront','cdInside'].flatMap(face=>p.surfaces[face]).filter(layer=>layer.source==='cdContents');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function harness(p){
 const events=new Map(),history=[],changes=[],messages=[];
 const ctx=vm.createContext({...model,...editing,...actions,...selection,p,surface:'cdFront',selected:contents(p)[0].id,joinColumns:false,
  document:{addEventListener(type,handler){events.set(type,handler)}},checkpoint(){history.push(model.clone(p))},changed(value){changes.push(value)},toast(value){messages.push(value)},
  renderInspector(){},draw(){},renderPanel(){}});
 const eventCode=app.slice(app.indexOf("document.addEventListener('input'"),app.indexOf('\nfunction reflowLyrics('));
 const actionCode=app.slice(app.indexOf('function uiAction('),app.indexOf("\ndocument.addEventListener('click'"));
 vm.runInContext(`const layers=()=>p.surfaces[surface],current=()=>layers().find(layer=>layer.id===selected),editFrame=()=>selectionFrame(p,current(),surface,joinColumns);${actionCode}\n${eventCode}`,ctx);
 return {ctx,history,changes,messages,input(key,value){events.get('input')({target:{dataset:{trackOption:key},checked:value,type:'checkbox',hasAttribute(){return false}}})},reset(){ctx.uiAction('reset-track-options',{dataset:{}})}};
}
test('actual CD checkbox updates every flow block with one undo checkpoint and unchanged geometry',()=>{
 for(const reference of [false,true]){
  const p=project(reference),h=harness(p),before=model.clone(p),peers=contents(p);
  h.input('hideTracks',true);
  assert.equal(h.history.length,1);assert.equal(h.changes.length,1);
  for(const peer of peers){assert.equal(peer.trackOptions.hideTracks,true);assert.doesNotMatch(model.boundText(p,peer,'cdFront'),/TRACKTOKEN/)}
  for(const face of ['outer','inner','labelA','labelB','cdLabel','cdTray','cdTrayInside'])assert.deepEqual(p.surfaces[face],before.surfaces[face]);
  for(const peer of peers){const old=contents(before).find(old=>old.id===peer.id);for(const key of ['id','x','y','w','h','font','size','color'])assert.equal(peer[key],old[key])}
  assert.deepEqual(h.history[0],before);
 }
});
test('a locked latent reverse column blocks content edits and reset without history or mutation',()=>{
 const p=project(true);p.layout.cdInsertDouble=false;p.surfaces.cdInside.find(layer=>layer.source==='cdContents').locked=true;
 const before=model.clone(p),h=harness(p);h.input('hideArtist',true);h.reset();
 assert.deepEqual(p,before);assert.equal(h.history.length,0);assert.equal(h.changes.length,0);assert.equal(h.messages.length,2);
});
test('all CD visibility options preserve data and are restored by the actual reset action',()=>{
 const p=project(true),h=harness(p),data=model.clone(p.data),cassette=model.clone(p.surfaces.outer);
 for(const key of ['hideArtist','hideAlbum','hideTracks','hideLyrics'])h.input(key,true);
 for(const layer of contents(p))assert.equal(model.boundText(p,layer,'cdFront'),'CREDITSTOKEN');
 h.input('showProduction',false);assert.equal(model.boundText(p,contents(p)[0],'cdFront'),'');
 h.reset();assert.deepEqual(p.data,data);assert.deepEqual(p.surfaces.outer,cassette);assert.equal(h.history.length,6);
 for(const layer of contents(p))assert.match(model.boundText(p,layer,'cdFront'),/ARTISTTOKEN.*ALBUMTOKEN.*LYRICSTOKEN.*Tracklist.*TRACKTOKEN.*CREDITSTOKEN/s);
});
test('reference template and newly created panels inherit content options',()=>{
 const p=project(true),h=harness(p);h.input('numbers',false);h.input('hideLyrics',true);
 assert.equal(p.referenceCDContentTemplate.trackOptions.hideLyrics,true);
 const previous=model.clone(p.layout);p.layout.cdInsertPanels=3;updateCDLayout(p,'cd-insert',previous);rebuildReferenceCDContents(p);
 for(const layer of contents(p)){assert.equal(layer.trackOptions.hideLyrics,true);assert.equal(layer.trackOptions.numbers,false)}
 const reopened=model.migrate(model.clone(p));for(const layer of contents(reopened))assert.equal(layer.trackOptions.hideLyrics,true);
});
test('CD flow formatting removes neither tracks nor production between short columns',()=>{
 const p=project(),h=harness(p),peers=contents(p);p.data.A=Array.from({length:10},(_,i)=>({title:'TRACK'+i,seconds:123,artist:'SINGER'}));p.data.lyrics='';
 h.input('artists',true);h.input('durations',false);h.input('numbers',false);peers[0].h=20;
 const text=peers.map(layer=>flowText(p,layer,p.surfaces.cdFront.includes(layer)?'cdFront':'cdInside').text).join('\n');
 for(let i=0;i<10;i++)assert.equal((text.match(new RegExp('TRACK'+i+'\\b','g'))||[]).length,1);
 assert.equal((text.match(/CREDITSTOKEN/g)||[]).length,1);assert.doesNotMatch(text,/2:03/);
});
test('standalone CD track blocks remain independent and refuse unknown or nonboolean options',()=>{
 const p=project(),first=model.makeLayer('text',{source:'cdTracks'}),second=model.makeLayer('text',{source:'cdTracks'});p.surfaces.cdLabel=[first,second];
 assert.equal(editing.setCDContentOption(p,first,'cdLabel','hideTracks',true),true);assert.equal(second.trackOptions,undefined);
 assert.equal(editing.setCDContentOption(p,first,'cdLabel','illegal',true),false);assert.equal(editing.setCDContentOption(p,first,'cdLabel','numbers','yes'),false);
 first.locked=true;assert.equal(editing.resetCDContentOptions(p,first,'cdLabel'),false);
});
test('CD controls have separate visibility and typography groups without cassette side fields',()=>{
 const p=project(true),layer=contents(p)[0],html=editing.cdContentControls(p,layer,'cdFront',{btn:(label,action)=>`<button data-action="${action}">${label}</button>`});
 for(const key of ['hideArtist','hideAlbum','hideTracks','hideLyrics','numbers','artists','durations','bullets','inlineTracks','showProduction'])assert.match(html,new RegExp(`data-track-option="${key}"`));
 assert.doesNotMatch(html,/data-track-option="(?:sideA|sideB|sideText|showSide)"/);assert.equal((html.match(/<fieldset/g)||[]).length,2);
 p.surfaces.cdInside.find(layer=>layer.source==='cdContents').locked=true;assert.match(editing.cdContentControls(p,layer,'cdFront',{btn:()=>''}),/<fieldset[^>]*disabled/);
});

test('actual download callback sends the CD print profile without changing ordinary PNG exports',async()=>{
 const code=app.slice(app.indexOf('async function runExport('),app.indexOf('\n',app.indexOf('async function runExport(')));
 const p=project(),calls=[],controls={exportStatus:{textContent:''}};
 const get=id=>controls[id]||{value:id==='exportDpi'?'300':id==='exportCopies'?'3':'0',checked:true};
 const run=new Function('p','$','exportProject','clamp',`const mode='cd-label',surface='cdLabel',desktop=true;${code};return runExport;`)(p,get,async(project,options)=>{calls.push(options);return {}},model.clamp);
 const before=model.clone(p);await run('cd-print-ready');assert.equal(calls[0].format,'png');assert.equal(calls[0].cdPrintReady,true);
 await run('png');assert.equal(calls[1].format,'png');assert.equal(calls[1].cdPrintReady,false);assert.equal(calls[1].dpi,300);assert.deepEqual(p,before);
 assert.match(controls.exportStatus.textContent,/Файл подготовлен/);
});
