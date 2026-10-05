import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,clone,esc} from '../src/model.js';
import {albumArtLayer} from '../src/album-art.js';
import {storeMusicGallery,applyGalleryCover,applyGalleryBackground} from '../src/cover-gallery.js';

// Run the actual gallery controller with only its network and UI boundaries replaced.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf('async function openArtworkGallery(kind){'));
assert.match(controller,/async function openArtworkGallery/);
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/lHkAAAAASUVORK5CYII=';
const oldAlbum={url:'https://open.spotify.com/album/old',artist:'Old artist',album:'Old album',cover:'https://i.scdn.co/image/old'};
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}}
function harness({service=async()=>oldAlbum,cached=false}={}){
 const initial=createProject();initial.data.url=oldAlbum.url;
 if(cached)storeMusicGallery(initial,oldAlbum);
 const calls={saved:[],history:[],toasts:[],picker:null,requests:[]},dialog={open:false,close(){this.open=false}};
 let loading;
 const modal=()=>{dialog.open=true;loading={}};
 const $=id=>id==='modal'?dialog:id==='coverGalleryLoading'?loading:null;
 const request=async url=>{calls.requests.push(url);return service(url)};
 const picker=async options=>{calls.picker=options;dialog.open=true};
 return new Function('initial','calls','clone','esc','albumArtLayer','storeMusicGallery','applyGalleryCover','applyGalleryBackground','$','modal','request','coverGalleryPicker',`
  let p=initial,projectRevision=0,surface='outer',selected='';
  const checkpoint=()=>{projectRevision++;calls.history.push(clone(p))};
  const changed=()=>{projectRevision++;calls.saved.push(clone(p))};
  const toast=message=>calls.toasts.push(message);
  ${controller}
  return {run:openArtworkGallery,calls,state:()=>({p,surface,selected}),edit:fn=>{fn(p);projectRevision++},replace:next=>p=next,side:next=>surface=next};
 `)(initial,calls,clone,esc,albumArtLayer,storeMusicGallery,applyGalleryCover,applyGalleryBackground,$,modal,request,picker);
}

test('gallery loading cannot install metadata from an old album after a new import',async()=>{
 const wait=deferred(),h=harness({service:()=>wait.promise}),pending=h.run('cover');
 h.edit(p=>{p.data.url='https://open.spotify.com/album/new';p.data.album='New album'});
 const before=clone(h.state().p);wait.resolve(oldAlbum);await pending;
 assert.deepEqual(h.state().p,before);assert.equal(h.calls.picker,null);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.history.length,0);
 assert.match(h.calls.toasts.at(-1),/макет изменился/);
});

test('a cached gallery cannot overwrite edits made while its chosen image downloads',async()=>{
 const h=harness({cached:true});await h.run('cover');const picker=h.calls.picker;
 assert.ok(picker.activeProject());
 h.edit(p=>{p.settings.bg='#123456';p.data.album='Edited album'});
 const before=clone(h.state().p);assert.equal(picker.activeProject(),false);
 assert.throws(()=>picker.onChoose(picker.choices[0],{src:image,key:oldAlbum.cover}),/макет изменился/);
 assert.deepEqual(h.state().p,before);assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);
});

test('successful metadata loading keeps the gallery active and applies its cover once',async()=>{
 const h=harness();await h.run('cover');const picker=h.calls.picker;
 assert.equal(h.calls.requests.length,1);assert.equal(picker.activeProject(),true);assert.equal(h.calls.saved.length,1);
 picker.onChoose(picker.choices[0],{src:image,key:oldAlbum.cover});
 const p=h.state().p,cover=albumArtLayer(p,'outer');assert.equal(cover.src,image);assert.equal(cover.fit,'meet');assert.equal(h.state().selected,cover.id);
 assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,2);
});

test('gallery callbacks also reject a different project or side',async()=>{
 for(const change of [h=>h.replace(createProject()),h=>h.side('inner')]){
  const h=harness({cached:true});await h.run('cover');change(h);
  assert.equal(h.calls.picker.activeProject(),false);
  assert.throws(()=>h.calls.picker.onChoose(h.calls.picker.choices[0],{src:image,key:oldAlbum.cover}),/макет изменился/);
  assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);
 }
});
