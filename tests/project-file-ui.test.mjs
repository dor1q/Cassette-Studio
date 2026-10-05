import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,clone,migrate,parseM3U,balance,makeLayer} from '../src/model.js';
import {replaceCDTracks} from '../src/cd-track-editing.js';

// Exercise the real app callbacks; replace file, database and FontFace boundaries.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handlers=app.slice(app.indexOf('let projectOpenGeneration='),app.indexOf('\nasync function saveLocalLibrary()'));
const library=app.slice(app.indexOf('async function loadLibrary(id)'),app.indexOf('\nasync function showLocalLibrary()'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const m3uFile=(name='Song',seconds=120)=>({size:100,text:async()=>`#EXTM3U\n#EXTINF:${seconds},${name}\ntrack.mp3`});
const projectFile=project=>({size:1000,text:async()=>JSON.stringify(project)});
const embeddedFont=(name='Embedded')=>({name,data:'data:font/woff2;base64,aGk=',weight:700,style:'italic'});

function harness(initial=createProject(),{loadProjects=async()=>[],fontLoad=async()=>{}}={}){
 const calls={history:[],saved:[],full:[],toasts:[],fonts:[],closed:0,clicked:0},faces=new Set();
 const inputs={m3uFile:{click:()=>calls.clicked++},projectFile:{},modal:{close:()=>calls.closed++}};
 class FontFace {
  constructor(name,data,descriptors){this.name=name;this.data=data;this.descriptors=descriptors}
  async load(){calls.fonts.push(this);await fontLoad(this);return this}
 }
 const document={fonts:{add:font=>faces.add(font),delete:font=>faces.delete(font)}};
 return new Function('initial','calls','inputs','faces','clone','migrate','parseM3U','balance','replaceCDTracks','loadProjects','FontFace','document',`
  let p=initial,m3uTarget='A',selected='keep-selection',projectRevision=0;
  const $=name=>inputs[name],checkpoint=()=>{projectRevision++;calls.history.push(clone(p))},changed=()=>{projectRevision++;calls.saved.push(p)},full=()=>calls.full.push(p),toast=message=>calls.toasts.push(message);
  ${handlers}
  ${library}
  return {calls,faces,replace:value=>p=value,edit:edit=>{edit(p);projectRevision++},side:value=>m3uTarget=value,state:()=>({p,selected,revision:projectRevision}),
   m3u:file=>inputs.m3uFile.onchange({target:{files:[file],value:'chosen'}}),json:file=>inputs.projectFile.onchange({target:{files:[file],value:'chosen'}}),library:loadLibrary,
   beginM3UUpload,beginProjectOpen,isProjectOpenCurrent,prepareProjectOpen,commitPreparedProject,loadFonts};
 `)(initial,calls,inputs,faces,clone,migrate,parseM3U,balance,replaceCDTracks,loadProjects,FontFace,document);
}
function untouched(h,project){
 assert.equal(h.state().p,project);assert.equal(h.state().selected,'keep-selection');
 assert.equal(h.calls.history.length,0);assert.equal(h.calls.saved.length,0);assert.equal(h.calls.full.length,0);assert.equal(h.calls.closed,0);
}

test('M3U retains the side selected when its file picker opened',async()=>{
 const p=createProject(),beforeB=clone(p.data.B),h=harness(p),wait=deferred();h.beginM3UUpload('A');h.side('B');
 const pending=h.m3u({size:100,text:()=>wait.promise});h.side('both');wait.resolve(await m3uFile('Chosen on A').text());await pending;
 assert.equal(h.calls.clicked,1);assert.equal(p.data.A[0].title,'Chosen on A');assert.deepEqual(p.data.B,beforeB);assert.equal(h.calls.history.length,1);assert.match(h.calls.toasts[0],/На сторону A/);
});

test('an M3U picker from a different project is rejected before reading the file',async()=>{
 const h=harness(),replacement=createProject();h.beginM3UUpload('B');h.replace(replacement);let reads=0;
 await h.m3u({size:100,text:async()=>{reads++;return await m3uFile().text()}});
 untouched(h,replacement);assert.equal(reads,0);assert.match(h.calls.toasts[0],/Макет изменился/);
});

test('late M3U reading cannot change a new project or overwrite edits in the same project',async()=>{
 for(const change of ['replace','edit']){
  const h=harness(),wait=deferred(),pending=h.m3u({size:100,text:()=>wait.promise});
  if(change==='replace')h.replace(createProject());else h.edit(p=>p.data.A[0].title='Manual track');
  const current=h.state().p,before=clone(current);wait.resolve(await m3uFile('Old file').text());await pending;
  untouched(h,current);assert.deepEqual(current,before);assert.match(h.calls.toasts[0],/Макет изменился/);
 }
});

test('the latest M3U selection wins even when the older file finishes first',async()=>{
 const h=harness(),first=deferred(),second=deferred(),old=h.m3u({size:100,text:()=>first.promise}),latest=h.m3u({size:100,text:()=>second.promise});
 first.resolve(await m3uFile('Older').text());await old;assert.equal(h.calls.history.length,0);
 second.resolve(await m3uFile('Latest').text());await latest;assert.equal(h.state().p.data.A[0].title,'Latest');assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);
});

test('M3U on both sides still balances tracks and reports both sides',async()=>{
 const h=harness();h.beginM3UUpload('both');await h.m3u({size:100,text:async()=>`${await m3uFile('One').text()}\n#EXTINF:120,Two\ntwo.mp3`});
 assert.equal(h.state().p.data.A.length,1);assert.equal(h.state().p.data.B.length,1);assert.equal(h.calls.history.length,1);assert.match(h.calls.toasts[0],/На обе стороны/);
});

test('the actual CD M3U callback keeps a complete ordered disc without cassette balancing',async()=>{
 const p=createProject();p.editorMode='cd-label';const cassetteLayers=clone(p.surfaces.labelA),h=harness(p);h.beginM3UUpload('cd');
 await h.m3u({size:100,text:async()=>`${await m3uFile('First',240).text()}\n#EXTINF:60,Second\nsecond.mp3\n#EXTINF:80,Third\nthird.mp3`});
 assert.deepEqual(p.data.A.map(track=>[track.title,track.seconds]),[['First',240],['Second',60],['Third',80]]);assert.deepEqual(p.data.B,[]);
 assert.deepEqual(p.surfaces.labelA,cassetteLayers);assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);assert.match(h.calls.toasts[0],/На CD импортировано треков: 3/);
});

test('JSON and library opening preserve the CD editor mode and artwork on every CD face',async()=>{
 for(const kind of ['json','library'])for(const mode of ['cd-label','cd-insert','cd-tray']){
  const next=createProject();next.editorMode=mode;next.title='CD project';next.layout.cdInsertPanels=3;next.layout.cdInsertDouble=true;
  const surfaces=['cdLabel','cdFront','cdInside','cdTray','cdTrayInside'],src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6feAAAAAASUVORK5CYII=';
  for(const [index,surface]of surfaces.entries())next.surfaces[surface].push(makeLayer('image',{name:'Saved artwork '+index,src,x:3+index,y:4,w:45,h:36,rotation:10,fit:'meet',cropZoom:1.5,locked:true}));
  const h=harness(undefined,{loadProjects:async()=>[{id:'disc',project:next}]});
  if(kind==='json')await h.json(projectFile(next));else await h.library('disc');
  const opened=h.state().p;assert.equal(opened.editorMode,mode);assert.equal(opened.layout.cdInsertPanels,3);assert.equal(opened.layout.cdInsertDouble,true);
  const properties=['type','name','source','src','x','y','w','h','rotation','fit','cropZoom','color','font','locked','visible'],savedFields=layer=>Object.fromEntries(properties.map(key=>[key,layer[key]]));
  for(const surface of surfaces)assert.deepEqual(opened.surfaces[surface].map(savedFields),next.surfaces[surface].map(savedFields));
  assert.equal(h.calls.full.length,1);assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);
 }
});

test('JSON opening prepares fonts before replacing the project or recording undo',async()=>{
 const original=createProject(),next=createProject(),wait=deferred();next.title='Opened project';next.fonts=[embeddedFont()];
 const h=harness(original,{fontLoad:()=>wait.promise}),pending=h.json(projectFile(next));await tick();
 untouched(h,original);assert.equal(h.calls.fonts.length,1);assert.equal(h.faces.size,0);assert.deepEqual(h.calls.fonts[0].descriptors,{weight:'700',style:'italic'});
 wait.resolve();await pending;assert.equal(h.state().p.title,'Opened project');assert.equal(h.state().selected,'');assert.equal(h.calls.history.length,1);assert.deepEqual(h.calls.history[0],original);
 assert.equal(h.calls.saved.length,1);assert.equal(h.calls.full.length,1);assert.equal(h.calls.closed,1);assert.equal(h.faces.size,1);assert.deepEqual(h.calls.toasts,['Проект открыт']);
});

test('JSON reading preserves a replacement project and manual edits',async()=>{
 for(const change of ['replace','edit']){
  const wait=deferred(),h=harness(),next=createProject(),pending=h.json({size:1000,text:()=>wait.promise});next.title='Late JSON';
  if(change==='replace')h.replace(createProject());else h.edit(p=>p.title='Manual title');
  const current=h.state().p,before=clone(current);wait.resolve(JSON.stringify(next));await pending;
  untouched(h,current);assert.deepEqual(current,before);assert.equal(h.faces.size,0);assert.match(h.calls.toasts[0],/Макет изменился/);
 }
});

test('JSON font preparation preserves selection, dialog and changes made while fonts load',async()=>{
 for(const change of ['replace','edit']){
  const next=createProject(),wait=deferred(),h=harness(undefined,{fontLoad:()=>wait.promise});next.fonts=[embeddedFont()];
  const pending=h.json(projectFile(next));await tick();
  if(change==='replace')h.replace(createProject());else h.edit(p=>p.title='Edited while font loads');
  const current=h.state().p,before=clone(current);wait.resolve();await pending;
  untouched(h,current);assert.deepEqual(current,before);assert.equal(h.faces.size,0);assert.match(h.calls.toasts[0],/Макет изменился/);
 }
});

test('a later JSON selection supersedes an older project during font preparation',async()=>{
 const first=createProject(),second=createProject(),firstFont=deferred(),secondFont=deferred();first.title='Older JSON';second.title='Latest JSON';first.fonts=[embeddedFont('Old')];second.fonts=[embeddedFont('New')];
 const h=harness(undefined,{fontLoad:font=>font.name==='Old'?firstFont.promise:secondFont.promise}),older=h.json(projectFile(first));await tick();const latest=h.json(projectFile(second));await tick();
 firstFont.resolve();await older;assert.equal(h.calls.history.length,0);assert.equal(h.faces.size,0);
 secondFont.resolve();await latest;assert.equal(h.state().p.title,'Latest JSON');assert.equal(h.calls.history.length,1);assert.equal(h.faces.size,1);assert.equal([...h.faces][0].name,'New');
});

test('late local library results cannot replace a newer JSON selection',async()=>{
 const wait=deferred(),h=harness(undefined,{loadProjects:()=>wait.promise}),older=h.library('stored'),latest=createProject();latest.title='Newer JSON';
 await h.json(projectFile(latest));const current=h.state().p,stored=createProject();stored.title='Old library response';wait.resolve([{id:'stored',project:stored}]);await older;
 assert.equal(h.state().p,current);assert.equal(current.title,'Newer JSON');assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);assert.equal(h.calls.full.length,1);assert.equal(h.calls.closed,1);
});

test('local library reading preserves manual changes to the current project',async()=>{
 const wait=deferred(),h=harness(undefined,{loadProjects:()=>wait.promise}),pending=h.library('stored');h.edit(p=>p.title='Manual change');const current=h.state().p;
 wait.resolve([{id:'stored',project:createProject()}]);await pending;untouched(h,current);assert.equal(current.title,'Manual change');assert.match(h.calls.toasts[0],/Макет изменился/);
});

test('local library opening is atomic while its embedded fonts load',async()=>{
 const next=createProject(),wait=deferred();next.title='Library font project';next.fonts=[embeddedFont()];
 const h=harness(undefined,{loadProjects:async()=>[{id:'stored',project:next}],fontLoad:()=>wait.promise}),original=h.state().p,pending=h.library('stored');await tick();untouched(h,original);assert.equal(h.faces.size,0);
 wait.resolve();await pending;assert.equal(h.state().p.title,'Library font project');assert.equal(h.calls.history.length,1);assert.equal(h.faces.size,1);assert.equal(h.calls.saved.length,1);
});

test('missing library records and malformed JSON leave the current project untouched',async()=>{
 for(const run of [h=>h.library('missing'),h=>h.json({size:100,text:async()=>'{broken'})]){
  const h=harness(),original=h.state().p;await run(h);untouched(h,original);assert.equal(h.calls.toasts.length,1);assert.equal(h.faces.size,0);
 }
});

test('default font loading never registers a font from a project that was replaced',async()=>{
 const original=createProject(),wait=deferred();original.fonts=[embeddedFont(),embeddedFont('Second')];const h=harness(original,{fontLoad:()=>wait.promise}),pending=h.loadFonts();await tick();h.replace(createProject());wait.resolve();
 const prepared=await pending;assert.equal(prepared.length,0);assert.equal(h.calls.fonts.length,1);assert.equal(h.faces.size,0);assert.equal(h.calls.saved.length,0);
});

test('preparing a project can be shared by the folder opener without closing another dialog',async()=>{
 const h=harness(),ticket=h.beginProjectOpen(),next=createProject();next.title='Folder project';const prepared=await h.prepareProjectOpen(next,ticket);let committed;
 assert.equal(h.calls.history.length,0);h.commitPreparedProject(prepared,{closeModal:false,beforeRender:p=>committed=p});
 assert.equal(committed,h.state().p);assert.equal(committed.title,'Folder project');assert.equal(h.calls.closed,0);assert.equal(h.calls.full.length,1);assert.equal(h.calls.saved.length,1);
});

test('already validated reference projects retain their exact layer identities and restored fields',async()=>{
 const h=harness(),ticket=h.beginProjectOpen(),next=createProject();next.referenceImportReady={manualPlacement:'retained'};next.surfaces.outer[0].id='restored-reference-layer';
 const prepared=await h.prepareProjectOpen(next,ticket,{validated:true});assert.equal(prepared.project,next);assert.equal(h.isProjectOpenCurrent(ticket),true);
 h.commitPreparedProject(prepared);assert.equal(h.state().p,next);assert.equal(next.surfaces.outer[0].id,'restored-reference-layer');assert.deepEqual(next.referenceImportReady,{manualPlacement:'retained'});assert.equal(h.isProjectOpenCurrent(ticket),false);
});
