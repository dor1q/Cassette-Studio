import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,createProject,makeLayer,esc} from '../src/model.js';
import {missingReferenceImages,retryReferenceImages} from '../src/reference-image-retry.js';

// Invoke the actual application callback with the real image retry implementation.
// Only network, image size decoding and UI boundaries are replaced; no browser runs.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const callback=app.slice(app.indexOf('async function reloadMissingImages(){'),app.indexOf('\nfunction openGameArtwork('));
assert.match(callback,/async function reloadMissingImages/);
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/lHkAAAAASUVORK5CYII=';
function deferred(){let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}}
function project(){
 const p=createProject();p.title='Edited cover';p.data.note='Keep this note';p.settings.bg='#334455';
 p.surfaces.outer.push(makeLayer('image',{name:'Cover — замените файл',src:'',referenceAssetKey:'https://vhs.texs.org/_patterns/04-pattern.png',missingReference:true,x:18,y:7,w:48,h:29,rotation:-32,cropZoom:1.7,cropX:-2,cropY:4,fit:'meet',imageTile:true,tileWidth:11,tileHeight:8,opacity:.65,panelTargets:[2]}));return p;
}
function harness(initial,service=async()=>({src:image})){
 const calls={requests:[],history:[],full:[],saved:[],toasts:[],modals:[]};
 const request=async url=>{calls.requests.push(url);return service(url)};
 const retry=async(prepared,request,options)=>retryReferenceImages(prepared,request,{...options,getDimensions:async()=>[800,400]});
 return new Function('initial','clone','missingReferenceImages','retryReferenceImages','request','calls','esc',`
  let p=initial,projectRevision=0,surface='outer',selected=initial.surfaces.outer.at(-1)?.id||'';
  const toast=message=>calls.toasts.push(message),modal=(title,body)=>calls.modals.push({title,body});
  const checkpoint=force=>calls.history.push({force,project:clone(p)}),full=()=>calls.full.push(p),changed=()=>{projectRevision++;calls.saved.push(clone(p))};
  const restoreReferenceMusicMetadata=()=>{throw Error('Public image retry must not replace album metadata')};
  ${callback}
  return {run:reloadMissingImages,calls,state:()=>({p,projectRevision,surface,selected}),edit:edit=>{edit(p);projectRevision++},replace:replacement=>p=replacement};
 `)(initial,clone,missingReferenceImages,retry,request,calls,esc);
}

test('actual image retry commits one prepared clone and undo entry without resetting edited content or geometry',async()=>{
 const original=project(),before=clone(original),h=harness(original);await h.run();
 const {p,surface,selected}=h.state(),layer=p.surfaces.outer.at(-1);
 assert.notEqual(p,original);assert.deepEqual(original,before);assert.deepEqual(p.data,before.data);assert.deepEqual(p.layout,before.layout);assert.deepEqual(p.settings,before.settings);
 assert.deepEqual(p.surfaces.outer.slice(0,-1),before.surfaces.outer.slice(0,-1));assert.deepEqual(p.surfaces.inner,before.surfaces.inner);
 for(const key of ['id','x','y','w','h','rotation','cropZoom','cropX','cropY','fit','imageTile','tileWidth','tileHeight','opacity','panelTargets'])assert.deepEqual(layer[key],before.surfaces.outer.at(-1)[key],key);
 assert.equal(layer.src,image);assert.equal(layer.missingReference,undefined);assert.equal(layer.name,'Cover');assert.equal(surface,'outer');assert.equal(selected,layer.id);
 assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.history,[{force:true,project:before}]);assert.deepEqual(h.calls.full,[p]);assert.deepEqual(h.calls.saved,[p]);assert.equal(h.calls.modals.length,0);
 assert.match(h.calls.toasts.at(-1),/Загружено изображений: 1/);
});

test('actual retry rejects a stale download when the same project is edited during loading',async()=>{
 const wait=deferred(),original=project(),h=harness(original,()=>wait.promise),pending=h.run();
 h.edit(p=>{p.data.album='Manually edited album';p.surfaces.outer.at(-1).x=88});wait.resolve({src:image});
 await assert.rejects(pending,/макет изменился/);assert.equal(h.state().p,original);assert.equal(original.data.album,'Manually edited album');assert.equal(original.surfaces.outer.at(-1).x,88);assert.ok(original.surfaces.outer.at(-1).missingReference);assert.equal(original.surfaces.outer.at(-1).src,'');
 assert.equal(h.calls.history.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.modals.length,0);
});

test('actual retry cannot overwrite a different project opened while an image downloads',async()=>{
 const wait=deferred(),original=project(),before=clone(original),h=harness(original,()=>wait.promise),pending=h.run(),replacement=createProject();replacement.title='Another open project';
 h.replace(replacement);wait.resolve({src:image});await assert.rejects(pending,/макет изменился/);
 assert.equal(h.state().p,replacement);assert.deepEqual(original,before);assert.equal(h.calls.history.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.modals.length,0);
});

test('failed and unnecessary actual retries leave the active project and undo history intact',async()=>{
 const original=project(),before=clone(original),failed=harness(original,async()=>{throw Error('Network unavailable')});await failed.run();
 assert.equal(failed.state().p,original);assert.deepEqual(original,before);assert.equal(failed.calls.history.length,0);assert.equal(failed.calls.saved.length,0);assert.equal(failed.calls.full.length,0);assert.equal(failed.calls.modals.length,1);assert.match(failed.calls.toasts.at(-1),/недоступно: 1/);
 const ordinary=createProject(),idle=harness(ordinary,()=>{assert.fail('No missing image must make no request')});await idle.run();assert.equal(idle.state().p,ordinary);assert.equal(idle.calls.requests.length,0);assert.equal(idle.calls.history.length,0);assert.equal(idle.calls.saved.length,0);assert.equal(idle.calls.full.length,0);assert.equal(idle.calls.modals.length,0);
});
