import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,clone,migrate,importReference,referenceMode} from '../src/model.js';
import {restoreReferenceSideMusic} from '../src/reference-side-music.js';
import {restoreReferenceMusicMetadata,restoreReferenceMusicArtwork} from '../src/reference-music.js';
import {albumArtLayer,applyReferenceArtwork} from '../src/album-art.js';
import {setCassettePrintArea,cassettePrintArea} from '../src/cassette-shell.js';
import {applyReferenceBlocks} from '../src/reference-freeplace.js';

// Execute the application import callback and its actual atomic-open helpers.
// Service, asset decoding, fonts and UI boundaries are the only replacements.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handler=app.slice(app.indexOf('async function applyReference(url){'),app.indexOf('\nfunction openSideImport('));
const openHelpers=app.slice(app.indexOf('function beginProjectOpen(){'),app.indexOf("\n$('m3uFile').onchange="));
const fontLoader=app.slice(app.indexOf('async function loadFonts('),app.indexOf('\nasync function saveLocalLibrary()'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const spotifyId='5SknXhmjHijD0uU1Pm2HBr',mainUrl='https://open.spotify.com/album/'+spotifyId;
const sideAUrl='https://music.apple.com/gb/album/id1441164426',sideBUrl='https://www.deezer.com/playlist/12345';
const main={url:mainUrl,artist:'Service main artist',album:'Service main album',cover:'https://example.com/main.png',recordLabels:['Main Records'],tracks:[{title:'Main track',seconds:99}]};
const sideA={url:sideAUrl,artist:'Side A artist',album:'Side A album',cover:'https://example.com/a.png',recordLabels:['Side Records'],tracks:[{title:'First A',artist:'A singer',seconds:70},{title:'Second A',seconds:80}]};
const sideB={url:sideBUrl,artist:'Side B artist',album:'Side B album',cover:'https://example.com/b.png',tracks:[{title:'Only B',artist:'B singer',seconds:90}]};
const imageBytes=url=>'data:image/png;base64,'+Buffer.from(url).toString('base64');
const reference=(params={},kind='jcard')=>'https://vhs.texs.org/en/'+kind+'?'+new URLSearchParams({id:'sa.'+spotifyId,musicArtist:'Reference artist',musicAlbum:'Reference album',bg:'131139',color:'ffcc33',mp:'_',country:'gb',...params});

function harness(initial=createProject(),{service,fontLoad=async()=>{},restoreFonts=async()=>({restored:0,missing:[]})}={}){
 const calls={requests:[],assets:[],restoreFonts:[],fontLoads:[],history:[],saved:[],full:[],storage:[],toasts:[],closed:0},faces=new Set(),inputs={modal:{close:()=>calls.closed++},searchResults:{hidden:false}};
 const request=async path=>{
  calls.requests.push(path);if(service)return service(path);
  const source=new URL(path,'https://studio.test').searchParams.get('url');
  if(path.startsWith('/api/image?'))return {src:imageBytes(source)};
  const album={[mainUrl]:main,[sideAUrl]:sideA,[sideBUrl]:sideB}[source];if(!album)throw Error('Unexpected source '+source);return clone(album);
 };
 class FontFace {
  constructor(name,data,descriptors){this.name=name;this.data=data;this.descriptors=descriptors}
  async load(){calls.fontLoads.push(this);await fontLoad(this);return this}
 }
 class Image {naturalWidth=600;naturalHeight=600;async decode(){}}
 const document={fonts:{add:font=>faces.add(font),delete:font=>faces.delete(font)}};
 const asset=name=>async()=>{calls.assets.push(name);return {restored:0,missing:0,warnings:[]}};
 const boundaries={restoreReferenceCover:async()=>{calls.assets.push('cover');return {restored:false,handled:false}},restoreReferenceBackgrounds:asset('backgrounds'),restoreReferenceDecals:asset('decals'),restoreReferenceExtras:asset('extras'),restoreReferenceLogo:asset('logo'),
  restoreReferenceFonts:async(project,api)=>{calls.restoreFonts.push(project);return restoreFonts(project,api)},
  restoreReferenceMusicArtwork:(project,url,api,mode,previous)=>restoreReferenceMusicArtwork(project,url,api,mode,previous,async()=>({w:600,h:600}))};
 return new Function('initial','calls','inputs','faces','request','FontFace','Image','document','boundaries','clone','migrate','importReference','referenceMode','restoreReferenceSideMusic','restoreReferenceMusicMetadata','albumArtLayer','applyReferenceArtwork','setCassettePrintArea','cassettePrintArea','applyReferenceBlocks',`
  let p=initial,projectRevision=0,projectOpenGeneration=0,mode='jcard',surface='outer',bothView=false,selected='keep-selection';
  const $=name=>inputs[name],localStorage={setItem:(key,value)=>calls.storage.push([key,value])},checkpoint=()=>{projectRevision++;calls.history.push(clone(p))},changed=()=>{projectRevision++;calls.saved.push(p)},full=()=>calls.full.push(p),toast=message=>calls.toasts.push(message);
  const {restoreReferenceCover,restoreReferenceBackgrounds,restoreReferenceDecals,restoreReferenceExtras,restoreReferenceLogo,restoreReferenceFonts,restoreReferenceMusicArtwork}=boundaries;
  ${openHelpers}
  ${fontLoader}
  ${handler}
  return {calls,faces,inputs,run:applyReference,replace:project=>p=project,edit:edit=>{edit(p);projectRevision++},state:()=>({p,mode,surface,bothView,selected}),beginProjectOpen,prepareProjectOpen,commitPreparedProject};
 `)(initial,calls,inputs,faces,request,FontFace,Image,document,boundaries,clone,migrate,importReference,referenceMode,restoreReferenceSideMusic,restoreReferenceMusicMetadata,albumArtLayer,applyReferenceArtwork,setCassettePrintArea,cassettePrintArea,applyReferenceBlocks);
}
const imports=h=>h.calls.requests.filter(path=>path.startsWith('/api/import?')).map(path=>new URL(path,'https://studio.test').searchParams.get('url'));
function untouched(h,project){
 assert.equal(h.state().p,project);assert.equal(h.state().selected,'keep-selection');assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.storage.length,0);assert.equal(h.calls.closed,0);assert.equal(h.faces.size,0);
}

test('the reference open callback keeps explicit A tracks while loading B from its source',async()=>{
 const original=createProject(),before=clone(original),h=harness(original);
 await h.run(reference({sai:'1441164426',sbi:'deezer:12345',musicA:'Custom - Owner (2:00)'}));
 const p=h.state().p;assert.deepEqual(p.data.A.map(({title,artist,seconds})=>({title,artist,seconds})),[{title:'Custom',artist:'Owner',seconds:120}]);
 assert.deepEqual(p.data.B.map(({title,artist,seconds})=>({title,artist,seconds})),[{title:'Only B',artist:'B singer',seconds:90}]);
 assert.equal(p.referenceSideMusic.A.album.tracks.length,2);assert.equal(p.referenceSideMusic.B.url,sideBUrl);assert.deepEqual(imports(h),[sideAUrl,sideBUrl,mainUrl]);
 assert.deepEqual(original,before);assert.deepEqual(h.calls.history,[before]);assert.equal(h.calls.saved.length,1);assert.equal(h.calls.full.length,1);
});

test('opening both side sources keeps cassette names, palette and the main record label',async()=>{
 const h=harness();await h.run(reference({sai:'1441164426',sbi:'deezer:12345'}));const {p,mode,surface}=h.state();
 assert.equal(p.data.artist,'Reference artist');assert.equal(p.data.album,'Reference album');assert.equal(p.settings.bg,'#131139');assert.equal(p.settings.fg,'#ffcc33');
 assert.deepEqual(p.data.A.map(track=>track.title),['First A','Second A']);assert.deepEqual(p.data.B.map(track=>track.title),['Only B']);assert.deepEqual(p.data.recordLabels,['Main Records']);
 assert.equal(p.referenceMusicMetadata.cover,main.cover);assert.deepEqual(p.referenceCoverChoices.map(choice=>choice.file_path),[main.cover,sideA.cover,sideB.cover]);assert.equal(albumArtLayer(p,'outer'),undefined);
 assert.equal(mode,'jcard');assert.equal(surface,'outer');assert.deepEqual(h.calls.storage,[['cassette-mode','jcard']]);assert.equal(h.inputs.searchResults.hidden,true);assert.equal(h.calls.toasts.length,1);
});

test('explicit empty B remains empty even when its service returns tracks',async()=>{
 const h=harness();await h.run(reference({sbi:'deezer:12345',musicB:''}));assert.deepEqual(h.state().p.data.B,[]);assert.equal(h.state().p.referenceSideMusic.B.album.tracks.length,1);
});

test('a side-only reference restores gallery mp1 through the actual artwork importer',async()=>{
 const h=harness(),url='https://vhs.texs.org/en/jcard?'+new URLSearchParams({sai:'1441164426',country:'gb',mp:'1.1.00.0.0.0',musicArtist:'Side project',musicAlbum:'Printed name'});
 await h.run(url);const p=h.state().p;assert.deepEqual(imports(h),[sideAUrl]);assert.equal(p.data.artist,'Side project');assert.equal(p.data.album,'Printed name');assert.deepEqual(p.data.A.map(track=>track.title),['First A','Second A']);
 assert.equal(p.referenceCoverChoices[0].file_path,null);assert.equal(p.referenceCoverChoices[1].file_path,sideA.cover);assert.equal(p.referenceCoverIndex,1);assert.equal(p.lastCover,sideA.cover);assert.equal(albumArtLayer(p,'outer').src,imageBytes(sideA.cover));
 assert.equal(p.data.url,'');assert.deepEqual(p.data.recordLabels,[]);assert.match(h.calls.toasts[0],/обложка/);
});

test('Cassette Label side sources retain B view and restore the selected side cover on both labels',async()=>{
 const h=harness();await h.run(reference({sbi:'deezer:12345',sd:'B',mp:'1.1.00.0.0.0'},'cassette'));const {p,mode,surface,bothView}=h.state();
 assert.equal(mode,'label');assert.equal(surface,'labelB');assert.equal(bothView,false);assert.equal(p.referenceCoverChoices[1].file_path,sideB.cover);assert.equal(albumArtLayer(p,'labelA').src,imageBytes(sideB.cover));assert.equal(albumArtLayer(p,'labelB').src,imageBytes(sideB.cover));
 assert.equal(p.data.artist,'Reference artist');assert.equal(p.data.album,'Reference album');assert.deepEqual(p.data.B.map(track=>track.title),['Only B']);assert.deepEqual(h.calls.storage,[['cassette-mode','label']]);
});

test('reference imports cannot overwrite another project or manual edits while a side service responds',async()=>{
 for(const change of ['replace','edit']){
  const wait=deferred(),h=harness(undefined,{service:path=>path.includes(encodeURIComponent(sideAUrl))?wait.promise:clone(main)}),pending=h.run(reference({sai:'1441164426'}));await tick();
  if(change==='replace')h.replace(createProject());else h.edit(p=>p.title='Manual change');const current=h.state().p,before=clone(current);
  wait.resolve(clone(sideA));await assert.rejects(pending,/макет изменился/i);untouched(h,current);assert.deepEqual(current,before);assert.equal(h.calls.toasts.length,0);
 }
});

test('a newer project ticket supersedes a slow reference even before the newer project commits',async()=>{
 const wait=deferred(),h=harness(undefined,{service:path=>path.includes(encodeURIComponent(sideAUrl))?wait.promise:clone(main)}),original=h.state().p,pending=h.run(reference({sai:'1441164426'}));await tick();
 const ticket=h.beginProjectOpen(),latest=createProject();latest.title='Latest selected project';wait.resolve(clone(sideA));await assert.rejects(pending,/Макет изменился/);untouched(h,original);
 const prepared=await h.prepareProjectOpen(latest,ticket);h.commitPreparedProject(prepared);assert.equal(h.state().p.title,'Latest selected project');assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);assert.equal(h.calls.full.length,1);
});

test('fonts finish before the reference commits and its restored locked styles keep exact identities',async()=>{
 const wait=deferred(),original=createProject();let restored,spineBefore;
 const h=harness(original,{fontLoad:()=>wait.promise,restoreFonts:async next=>{restored=next;next.fonts.push({name:'Arial',weight:500,style:'italic',data:'data:font/woff2;base64,aGk='});spineBefore=clone(next.surfaces.outer.find(layer=>layer.source==='spine'));return {restored:1,missing:[]}}});
 const pending=h.run(reference({bx:'bdefault-spineText_12_26_150_30_5_0_1__~Arial.5.2s.4.10.140.ff6600.r'}));await tick();untouched(h,original);assert.equal(h.calls.fontLoads.length,1);assert.ok(restored);assert.equal(spineBefore.locked,true);
 wait.resolve();await pending;assert.equal(h.state().p,restored);assert.equal(h.faces.size,1);assert.deepEqual(h.calls.fontLoads[0].descriptors,{weight:'500',style:'italic'});
 const spine=h.state().p.surfaces.outer.find(layer=>layer.source==='spine');for(const key of ['id','x','y','w','h','rotation','font','fontWeight','italic','fontStretch','spacing','color','align','locked'])assert.equal(spine[key],spineBefore[key],key);
 assert.equal(spine.color,'#ff6600');assert.equal(spine.fontWeight,500);assert.equal(spine.italic,true);assert.equal(spine.align,'right');assert.equal(h.calls.history.length,1);assert.deepEqual(h.calls.history[0],original);assert.equal(h.calls.saved.length,1);assert.match(h.calls.toasts[0],/шрифты: 1/);
});

test('changing a project during final reference FontFace loading leaves all prepared state uncommitted',async()=>{
 const wait=deferred(),h=harness(undefined,{fontLoad:()=>wait.promise,restoreFonts:async next=>{next.fonts.push({name:'Prepared',data:'data:font/woff2;base64,aGk='});return {restored:1,missing:[]}}});
 const pending=h.run(reference());await tick();h.edit(p=>p.data.album='Edited during browser font load');const current=h.state().p,before=clone(current);wait.resolve();
 await assert.rejects(pending,/Макет изменился/);untouched(h,current);assert.deepEqual(current,before);assert.equal(h.calls.toasts.length,0);
});
