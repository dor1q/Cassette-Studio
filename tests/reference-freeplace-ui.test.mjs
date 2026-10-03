import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,createProject,esc,importReference} from '../src/model.js';
import {hasSuspendedReferenceBlocks,resumeReferenceFreePlace} from '../src/reference-freeplace.js';
import {importMusicData} from '../src/music-import.js';

// Execute the real application handler and panel renderer with only its browser boundaries replaced.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handler=app.slice(app.indexOf('async function resumeReferencePlacement(){'),app.indexOf('\nasync function applyReference('));
const panelRenderer=app.slice(app.indexOf('function renderPanel(){'),app.indexOf('\nfunction albumStyleControls('));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function suspended(mode='jcard'){
 const p=createProject(),q=new URLSearchParams({ss:'0',cl:'hidden',musicArtist:'Artist',musicAlbum:'Album',bx:mode==='label'?'~|bB-album_24_81_125_15_47_0':'~|bdefault-spineText_12_26_150_30_5_0_1__~Roboto.5.2s.4.10.140.ff6600.r'});
 importReference(p,'https://vhs.texs.org/en/'+(mode==='label'?'cassette':'jcard')+'?'+q);return p;
}
function harness(initial,{restoreFonts=async()=>({restored:0,missing:[]}),loadFonts=async()=>{}}={}){
 const calls={restore:[],load:[],history:[],saved:[],full:[],toasts:[],storage:[]},panel={innerHTML:''};
 const names=['initial','clone','hasSuspendedReferenceBlocks','resumeReferenceFreePlace','restoreFontsBoundary','loadFontsBoundary','calls','panel','esc'];
 const values=[initial,clone,hasSuspendedReferenceBlocks,resumeReferenceFreePlace,restoreFonts,loadFonts,calls,panel,esc];
 return new Function(...names,`
  let p=initial,mode='jcard',surface='outer',bothView=true,selected='old-selection',tab='layers',projectRevision=0;
  const request=()=>{throw Error('Unexpected service request')},localStorage={setItem:(key,value)=>calls.storage.push([key,value])};
  const $=()=>panel,btn=(label,action)=>'<button data-action="'+action+'">'+esc(label)+'</button>',layerList=()=>'<div>Layers</div>';
  const restoreReferenceFonts=async(project,service)=>{calls.restore.push(project);return restoreFontsBoundary(project,service)};
  const loadFonts=async()=>{calls.load.push(p);return loadFontsBoundary(p)};
  const checkpoint=force=>{calls.history.push({force,project:clone(p)})},changed=()=>{projectRevision++;calls.saved.push(clone(p))},toast=message=>calls.toasts.push(message);
  ${panelRenderer}
  const full=()=>{calls.full.push(p);renderPanel()};
  ${handler}
  return {run:resumeReferencePlacement,render:renderPanel,replace:project=>p=project,edit:edit=>{edit(p);projectRevision++},state:()=>({p,mode,surface,bothView,selected}),calls,panel};
 `)(...values);
}

test('the actual resume handler records undo, installs fonts, saves once and hides the resume button',async()=>{
 const original=suspended('label'),before=clone(original),fonts={name:'Embedded',weight:500,style:'normal',data:'data:font/woff2;base64,aGk='};
 const h=harness(original,{restoreFonts:async next=>{assert.equal(hasSuspendedReferenceBlocks(next),false);assert.equal(next.referenceFreePlace.applied,1);next.fonts.push(fonts);return {restored:1,missing:['Unavailable font']}}});
 h.render();assert.match(h.panel.innerHTML,/data-action="resume-reference-placement"/);await h.run();
 const state=h.state();assert.notEqual(state.p,original);assert.deepEqual(original,before);assert.equal(state.mode,'label');assert.equal(state.surface,'labelA');assert.equal(state.bothView,false);assert.equal(state.selected,'');
 assert.equal(h.calls.history.length,1);assert.equal(h.calls.history[0].force,true);assert.deepEqual(h.calls.history[0].project,before);
 assert.deepEqual(h.calls.storage,[['cassette-mode','label']]);assert.equal(h.calls.load.length,1);assert.equal(h.calls.load[0],state.p);assert.deepEqual(state.p.fonts,[fonts]);
 assert.equal(h.calls.full.length,1);assert.equal(h.calls.saved.length,1);assert.deepEqual(h.calls.saved[0],state.p);assert.doesNotMatch(h.panel.innerHTML,/data-action="resume-reference-placement"/);
 assert.equal(h.calls.toasts.length,1);assert.match(h.calls.toasts[0],/Размещение возобновлено · блоков: 1/);assert.match(h.calls.toasts[0],/Unavailable font/);
 await h.run();assert.equal(h.calls.restore.length,1);assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);
});

test('late font restoration cannot replace a project opened during resume preparation',async()=>{
 const wait=deferred(),original=suspended(),h=harness(original,{restoreFonts:()=>wait.promise}),pending=h.run(),replacement=createProject();replacement.title='Other open project';h.replace(replacement);
 wait.resolve({restored:1,missing:[]});await assert.rejects(pending,/открыт другой проект|макет изменился/);
 assert.equal(h.state().p,replacement);assert.equal(hasSuspendedReferenceBlocks(original),true);assert.equal(h.calls.history.length,0);assert.equal(h.calls.load.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.storage.length,0);assert.equal(h.calls.toasts.length,0);
});

test('a project opened while browser fonts load keeps its selection and receives no late save or repaint',async()=>{
 const wait=deferred(),started=deferred(),h=harness(suspended(),{loadFonts:()=>{started.resolve();return wait.promise}}),pending=h.run();await started.promise;
 assert.equal(h.calls.history.length,1);assert.equal(h.calls.load.length,1);const replacement=createProject();replacement.title='Opened after committing resume';h.replace(replacement);wait.resolve();await pending;
 assert.equal(h.state().p,replacement);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.toasts.length,0);
});

test('editing the same project during font preparation cannot be overwritten by the prepared clone',async()=>{
 const wait=deferred(),original=suspended(),h=harness(original,{restoreFonts:()=>wait.promise}),pending=h.run();h.edit(project=>project.data.album='Manually edited album');
 wait.resolve({restored:1,missing:[]});await assert.rejects(pending,/макет изменился/);assert.equal(h.state().p,original);assert.equal(original.data.album,'Manually edited album');assert.equal(hasSuspendedReferenceBlocks(original),true);
 assert.equal(h.calls.history.length,0);assert.equal(h.calls.load.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.storage.length,0);
});

test('a preparation failure leaves the original suspended layout available for retry',async()=>{
 const original=suspended(),before=clone(original),h=harness(original,{restoreFonts:async()=>{throw Error('Font fetch failed')}});
 await assert.rejects(h.run(),/Font fetch failed/);assert.equal(h.state().p,original);assert.deepEqual(original,before);assert.equal(h.calls.history.length,0);assert.equal(h.calls.load.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.storage.length,0);
 h.render();assert.match(h.panel.innerHTML,/data-action="resume-reference-placement"/);
});

test('ordinary and already resumed projects never invoke asynchronous resume preparation',async()=>{
 for(const p of [createProject(),(()=>{const project=suspended();resumeReferenceFreePlace(project);return project})()]){
  const h=harness(p);h.render();assert.doesNotMatch(h.panel.innerHTML,/data-action="resume-reference-placement"/);await h.run();assert.equal(h.state().p,p);assert.equal(h.calls.restore.length,0);assert.equal(h.calls.load.length,0);assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);
 }
});

test('per-side and locked music imports preserve other eligible suspended blocks',()=>{
 const album={artist:'New artist',album:'New album',tracks:[{title:'New track',seconds:123}]};
 const locked=suspended('label');importMusicData(locked,album);assert.equal(hasSuspendedReferenceBlocks(locked),true);assert.equal(resumeReferenceFreePlace(locked).applied,1);
 const tracks=suspended('label');tracks.settings.lockDesign=false;importMusicData(tracks,album,'B',{tracksOnly:true});assert.equal(hasSuspendedReferenceBlocks(tracks),true);assert.equal(resumeReferenceFreePlace(tracks).applied,1);
 const sideA=suspended('label');sideA.settings.lockDesign=false;importMusicData(sideA,album,'A');assert.equal(hasSuspendedReferenceBlocks(sideA),true);assert.equal(resumeReferenceFreePlace(sideA).applied,1);
 const sideB=suspended('label');sideB.settings.lockDesign=false;importMusicData(sideB,album,'B');const before=clone(sideB.surfaces.labelB);assert.equal(resumeReferenceFreePlace(sideB).applied,0);assert.deepEqual(sideB.surfaces.labelB,before);
});

test('rebuilding the entire design during music import clears obsolete suspended placement',()=>{
 const p=suspended('label');p.settings.lockDesign=false;importMusicData(p,{artist:'Replacement',album:'New design',tracks:[{title:'Song',seconds:123}]});
 assert.equal(hasSuspendedReferenceBlocks(p),false);assert.equal(Object.hasOwn(p,'referenceFreePlace'),false);assert.equal(p.surfaces.labelA.some(l=>l.referenceSuspendedBlock),false);assert.equal(p.surfaces.labelB.some(l=>l.referenceSuspendedBlock),false);
});
