import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,makeLayer,clone,dimensions,panelRects,importReference} from '../src/model.js';
import {albumCoverFrame,albumArtLayer,fitCoverImage} from '../src/album-art.js';
import {captureImageImportTarget,assertImageImportTarget} from '../src/image-import-target.js';
import {synchronizeLabelLayers} from '../src/label-sync.js';

// The actual application controller runs with file decoding and UI boundaries mocked.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf('async function imageData(file)'),app.indexOf("$('fontFile').onchange"));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/lHkAAAAASUVORK5CYII=';
const file={name:'New.png',size:100,src:image};
function fixture(){const p=createProject();p.surfaces.outer=[makeLayer('image',{name:'Original',src:'old',category:'background',w:30,h:40,x:7,y:9,cropZoom:1.7}),makeLayer('image',{name:'Other',src:'other'})];return p}
function harness(initial=fixture(),{surface='outer',mode='jcard',bitmapDecode=async()=>{},backgroundDecode=async()=>{},request=async()=>({src:image}),drawError=false}={}){
 const calls={history:[],saved:[],toasts:[],clicked:0,closed:0,rasters:[],requests:[]},input={value:'',click:()=>calls.clicked++};
 const $=()=>input;
 const createImageBitmap=async f=>{await bitmapDecode(f);return {width:f.width||800,height:f.height||600,src:f.src,close:()=>calls.closed++}};
 class Image {naturalWidth=800;naturalHeight=600;async decode(){await backgroundDecode(this.src)}}
 const document={createElement:()=>{const canvas={getContext:()=>({drawImage:bmp=>{if(drawError)throw Error('Cannot draw');canvas.src=bmp.src}}),toDataURL:()=>{calls.rasters.push({w:canvas.width,h:canvas.height});return canvas.src}};return canvas}};
 return new Function('initial','initialSurface','initialMode','calls','$','document','createImageBitmap','Image','request','clone','dimensions','panelRects','makeLayer','albumCoverFrame','albumArtLayer','fitCoverImage','captureImageImportTarget','assertImageImportTarget','synchronizeLabelLayers',`
  let p=initial,surface=initialSurface,mode=initialMode,selected=p.surfaces[surface][0]?.id||'',tab='background',uploadKind='art',imageUploadTarget=null,projectRevision=0;
  const layers=()=>p.surfaces[surface],checkpoint=()=>{calls.history.push(clone(p));projectRevision++};
  const changed=({mirrorLayers}={})=>{projectRevision++;if(mirrorLayers)synchronizeLabelLayers(p,surface);calls.saved.push(clone(p))};
  const toast=message=>calls.toasts.push(message);
  ${controller}
  return {calls,begin:beginImageUpload,upload:f=>$('imageFile').onchange({target:{files:[f],value:'file'}}),place:placeImage,use:useAlbumCover,decode:imageData,state:()=>({p,surface,mode,selected}),select:id=>selected=id,edit:fn=>{fn(p);projectRevision++},replace:next=>p=next,side:next=>surface=next,undo:()=>p=calls.history.pop()};
 `)(initial,surface,mode,calls,$,document,createImageBitmap,Image,async url=>{calls.requests.push(url);return request(url)},clone,dimensions,panelRects,makeLayer,albumCoverFrame,albumArtLayer,fitCoverImage,captureImageImportTarget,assertImageImportTarget,synchronizeLabelLayers);
}

test('actual replacement follows the layer selected when the picker opened and needs one undo',async()=>{
 const p=fixture(),before=clone(p),h=harness(p),first=p.surfaces.outer[0];h.begin('replace');h.select(p.surfaces.outer[1].id);await h.upload(file);
 assert.equal(first.src,image);assert.equal(p.surfaces.outer[1].src,'other');assert.equal(first.cropZoom,1.7);assert.equal(first.x,7);assert.equal(first.y,9);
 assert.equal(p.uploads.length,1);assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);assert.equal(h.state().selected,first.id);
 h.undo();assert.deepEqual(h.state().p,before);
});
test('file decoding cannot add a resource or image to a replacement project or overwrite intervening edits',async()=>{
 for(const change of [h=>h.replace(fixture()),h=>h.edit(p=>p.data.album='Manual edit')]){
  const wait=deferred(),h=harness(fixture(),{bitmapDecode:()=>wait.promise});h.begin('replace');const pending=h.upload(file);change(h);const before=clone(h.state().p);wait.resolve();await pending;
  assert.deepEqual(h.state().p,before);assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);assert.match(h.calls.toasts.at(-1),/макет изменился/);assert.equal(h.calls.closed,1);
 }
});
test('background placement is atomic, inserted behind the content and undone with its resource',async()=>{
 const p=fixture(),before=clone(p),h=harness(p);h.begin('background');await h.upload(file);
 assert.equal(p.surfaces.outer[0].src,image);assert.equal(p.surfaces.outer[0].category,'background');assert.deepEqual(p.surfaces.outer.slice(1),before.surfaces.outer);
 assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);h.undo();assert.deepEqual(h.state().p,before);
 const failed=harness(fixture(),{backgroundDecode:async()=>{throw Error('Decode failed')}}),snapshot=clone(failed.state().p);failed.begin('background');await failed.upload(file);
 assert.deepEqual(failed.state().p,snapshot);assert.equal(failed.calls.history.length,0);assert.match(failed.calls.toasts.at(-1),/Decode failed/);
});
test('background decoding and found-cover download cannot modify a newer project state',async()=>{
 const wait=deferred(),h=harness(fixture(),{backgroundDecode:()=>wait.promise}),pending=h.place(image,'Pending','background');h.edit(p=>p.settings.bg='#123456');wait.resolve();await assert.rejects(pending,/макет изменился/);assert.equal(h.calls.history.length,0);
 const coverWait=deferred(),p=fixture();p.lastCover='https://i.scdn.co/image/old';const cover=harness(p,{request:()=>coverWait.promise}),download=cover.use();cover.edit(p=>{p.data.album='New album';p.surfaces.outer[0].src='new-album'});coverWait.resolve({src:image});await assert.rejects(download,/макет изменился/);assert.equal(p.surfaces.outer[0].src,'new-album');assert.equal(cover.calls.history.length,0);
});
test('a manually added cover becomes visible and fits without inheriting an old gallery key',async()=>{
 const p=fixture(),l=p.surfaces.outer[0];Object.assign(l,{category:'albumCover',visible:false,referenceAssetKey:'old-key',referenceCoverIndex:3});p.referenceArtworkSource='old-source';
 const h=harness(p);h.begin('art');await h.upload(file);
 assert.equal(l.visible,true);assert.equal(l.src,image);assert.equal(l.fit,'meet');assert.equal(l.cropZoom,1);assert.equal(l.referenceAssetKey,undefined);assert.equal(l.referenceCoverIndex,undefined);assert.equal(p.referenceArtworkSource,undefined);
});
test('new artwork on the inside uses the front panel identity for ordinary and mirrored reference layouts',async()=>{
 for(const p of [createProject(),importReference(createProject(),'https://vhs.texs.org/en/jcard?p=4&ds=1')]){
  const front=panelRects(p,'inner').find(panel=>panel.index===2),before=clone(p.surfaces.outer),h=harness(p,{surface:'inner',mode:'jcard'});
  h.begin('art');await h.upload(file);const cover=albumArtLayer(p,'inner');assert.ok(cover);
  assert.equal(cover.x,front.x);assert.equal(cover.w,front.w);assert.equal(cover.y,0);assert.equal(cover.h,dimensions(p,'inner').h);assert.equal(cover.fit,'meet');assert.equal(cover.src,image);
  assert.deepEqual(p.surfaces.outer,before);assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);
 }
});
test('new files respect active locks and leave a locked opposite label intact',async()=>{
 const p=fixture();p.surfaces.outer[0].locked=true;const locked=harness(p);locked.begin('replace');assert.equal(locked.calls.clicked,0);assert.match(locked.calls.toasts.at(-1),/закреплена/);
 const labels=createProject();labels.layout.sync=true;labels.surfaces.labelB[0].locked=true;const before=clone(labels.surfaces.labelB),h=harness(labels,{surface:'labelA',mode:'label'});h.begin('art');await h.upload(file);
 assert.equal(albumArtLayer(labels,'labelA').src,image);assert.deepEqual(labels.surfaces.labelB,before);assert.equal(labels.layout.sync,false);assert.match(h.calls.toasts.at(-1),/другая сторона закреплена/);
});
test('very thin images retain a nonzero canvas and decoded bitmaps close even when drawing fails',async()=>{
 const h=harness();await h.decode({...file,width:1,height:50000});assert.deepEqual(h.calls.rasters,[{w:1,h:3000}]);assert.equal(h.calls.closed,1);
 const fail=harness(fixture(),{drawError:true});await assert.rejects(fail.decode(file),/Cannot draw/);assert.equal(fail.calls.closed,1);
});
