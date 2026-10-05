import test from 'node:test';
import assert from 'node:assert/strict';
import {createFolderSession,createProjectFolderUI,readFolderLinks,unwrapFolderResult} from '../src/project-folder-ui.js';
import {createProject,clone} from '../src/model.js';

function fixture(){
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 let project=createProject(),folder='Test sync/Cassette Studio Projects',revision=0;
 const records=new Map(),requests=[];
 const bridge={
  status:async()=>({ok:true,configured:true,available:true,folderLabel:folder}),
  save:async payload=>{
   requests.push(clone(payload));const id=payload.id||'folder-'+(records.size+1),prior=records.get(id);
   if(prior&&prior.revision!==payload.expectedRevision)return {ok:false,error:{code:'CONFLICT',message:'Проект изменён'}};
   const record={id,revision:'revision-'+(++revision),project:clone(payload.project)};records.set(id,record);return {ok:true,...record};
  }
 };
 const session=()=>createFolderSession({bridge,storage,getProject:()=>project,getMode:()=> 'label',newId:()=> 'local-'+(++revision)});
 return {storage,bridge,records,requests,session,get project(){return project},set project(value){project=value},changeFolder:()=>folder='Other sync/Cassette Studio Projects'};
}

test('folder session saves artwork with a stable record and resumes its revision after restart',async()=>{
 const f=fixture(),session=f.session();f.project.surfaces.labelA.push({type:'image',src:'data:image/png;base64,AAAA'});f.project.fonts.push({data:'data:font/woff2;base64,AAAA'});
 const first=await session.save();assert.equal(f.records.size,1);assert.equal(first.record.project.mode,'label');assert.ok(f.project.libraryId);assert.equal('folderLabel' in first.record.project,false);
 const storedId=f.project.libraryId;f.project.title='Другой заголовок';const resumed=f.session();await resumed.save();
 assert.equal(f.records.size,1);assert.equal(f.requests[1].id,first.record.id);assert.equal(f.requests[1].expectedRevision,first.record.revision);assert.equal(f.project.libraryId,storedId);
 assert.equal(f.requests[1].project.surfaces.labelA.at(-1).src,'data:image/png;base64,AAAA');assert.equal(f.requests[1].project.fonts.at(-1).data,'data:font/woff2;base64,AAAA');
});

test('copy is a new cloud record, and switching folders never submits an old revision',async()=>{
 const f=fixture(),session=f.session(),first=await session.save(),original=f.project.libraryId;
 const copied=await session.save({copy:true});assert.notEqual(copied.record.id,first.record.id);assert.notEqual(f.project.libraryId,original);assert.equal(f.requests[1].expectedRevision,undefined);
 f.changeFolder();await session.save();assert.equal(f.requests[2].id,undefined);assert.equal(f.requests[2].expectedRevision,undefined);
});

test('conflicts preserve local changes and the last known revision until explicit copy',async()=>{
 const f=fixture(),session=f.session(),first=await session.save(),id=f.project.libraryId;f.records.get(first.record.id).revision='changed-remotely';f.project.title='Моя работа';
 await assert.rejects(session.save(),error=>error.code==='CONFLICT');assert.equal(f.project.title,'Моя работа');assert.equal(f.project.libraryId,id);assert.equal(readFolderLinks(f.storage).get(id).revision,first.record.revision);
 const copied=await session.save({copy:true});assert.equal(copied.record.project.title,'Моя работа');assert.notEqual(copied.record.id,first.record.id);
});

test('failed first save does not change identity, and duplicate writes are rejected',async()=>{
 const f=fixture();let finish;f.bridge.save=()=>new Promise(resolve=>finish=resolve);const session=f.session(),saving=session.save();await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(session.save(),/Сохранение уже выполняется/);finish({ok:false,error:{code:'NO_SPACE',message:'Нет места'}});await assert.rejects(saving,/Нет места/);assert.equal(f.project.libraryId,undefined);
});

test('preference and metadata tolerate corrupt storage and unavailable bridge',async()=>{
 const f=fixture(),session=f.session();session.prefer('folder');assert.equal(f.session().preferred(),'folder');session.prefer('local');assert.equal(session.preferred(),'local');
 assert.equal(readFolderLinks({getItem:()=>'{invalid'}).size,0);assert.equal(readFolderLinks({getItem:()=>JSON.stringify([['x',null],['x',{id:'a'}]])}).size,0);
 assert.throws(()=>unwrapFolderResult({ok:false,error:{code:'CONFLICT',message:'Повторите'}}),error=>error.code==='CONFLICT');
 await assert.rejects(createFolderSession({getProject:()=>createProject()}).save(),/Windows/);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('a completed save cannot replace a newer project or local library identity',async()=>{
 const f=fixture(),session=f.session(),wait=deferred(),original=f.project;f.bridge.save=()=>wait.promise;
 const saving=session.save();await tick();f.project=createProject();f.project.title='Новый проект';
 wait.resolve({ok:true,id:'old-snapshot',revision:'saved'});await saving;
 assert.equal(f.project.title,'Новый проект');assert.equal(f.project.libraryId,undefined);assert.equal(original.libraryId,undefined);
 const next=deferred();f.bridge.save=()=>next.promise;const another=session.save({copy:true});await tick();f.project.libraryId='new-local-identity';
 next.resolve({ok:true,id:'cloud-copy',revision:'copied'});await another;assert.equal(f.project.libraryId,'new-local-identity');
 assert.ok([...readFolderLinks(f.storage).values()].some(link=>link.id==='cloud-copy'));
});

test('save binds its write to the folder whose status and revision were read',async()=>{
 const f=fixture();await f.session().save();assert.equal(f.requests[0].expectedFolder,'Test sync/Cassette Studio Projects');
 f.changeFolder();await f.session().save();assert.equal(f.requests[1].expectedFolder,'Other sync/Cassette Studio Projects');
});

function uiFixture(){
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},status={ok:true,configured:true,available:true,folderLabel:'Test sync/Cassette Studio Projects'};
 let project=createProject(),click,localShown=0,closed=0,revision=0,openGeneration=0;const toasts=[],autosaves=[],renames=[],opens=[],openTickets=[],dialog={open:true},input={value:'Renamed',focus(){}};
 project.libraryId='local-working';const record={id:'cloud-record',revision:'first-revision',title:project.title,updatedAt:'2026-10-04T00:00:00.000Z',kind:'jcard',project:clone(project)},body={dataset:{},innerHTML:'',addEventListener(name,handler){if(name==='click')click=handler},closest(){return dialog},querySelector(){return input}};
 const bridge={status:async()=>({...status}),list:async()=>({ok:true,projects:[record]}),read:async()=>({ok:true,...record,project:clone(record.project)}),choose:async()=>({...status}),disconnect:async()=>({ok:true}),rename:async payload=>({ok:true,...record,title:payload.title,revision:'renamed-revision'}),save:async payload=>({ok:true,...record,title:payload.project.title,revision:'saved-revision'})};
 createFolderSession({bridge,storage,getProject:()=>project}).remember(project,record,status);
 const modal=(title,html)=>{delete body.dataset.libraryView;body.innerHTML=html;dialog.open=true};
 const ui=createProjectFolderUI({bridge,storage,getProject:()=>project,getMode:()=> 'jcard',getRevision:()=>revision,beginOpen:()=>({generation:++openGeneration}),body,modal,toast:text=>toasts.push(text),closeModal:()=>{closed++;dialog.open=false},showLocal:()=>{localShown++;modal('Local','LOCAL LIBRARY')},saveAutosave:async value=>autosaves.push(value),onProjectRename:async(value,title)=>{renames.push([value,title]);value.title=title},openProject:async(raw,ticket)=>{openTickets.push(ticket);project=clone(raw);opens.push(project);return project}});
 return {ui,body,bridge,storage,record,status,input,toasts,autosaves,renames,opens,openTickets,dialog,get project(){return project},set project(value){project=value},get openGeneration(){return openGeneration},get localShown(){return localShown},get closed(){return closed},edit(edit){edit(project);revision++},leave(){modal('Elsewhere','UNRELATED DIALOG')},click(action,id=record.id){const element={dataset:{folderAction:action,id},disabled:false};return click({target:{closest:()=>element}})}};
}

test('late folder selection or disconnection preserves a dialog opened meanwhile',async()=>{
 for(const action of ['choose','disconnect']){
  const f=uiFixture();await f.ui.show();const wait=deferred();f.bridge[action]=()=>wait.promise;
  const pending=f.click(action);await tick();f.leave();wait.resolve({ok:true,...f.status});await pending;
  assert.equal(f.body.innerHTML,'UNRELATED DIALOG');assert.equal(f.localShown,0);
 }
});

test('late rename updates the linked project only when its title and identity still match',async()=>{
 const f=uiFixture();await f.ui.show();await f.click('rename');const wait=deferred();f.bridge.rename=()=>wait.promise;
 const pending=f.click('rename-save');await tick();f.project.title='Edited during save';f.leave();wait.resolve({ok:true,...f.record,title:'Renamed',revision:'new-revision'});await pending;
 assert.equal(f.project.title,'Edited during save');assert.equal(f.renames.length,0);assert.equal(f.autosaves.length,0);assert.equal(f.body.innerHTML,'UNRELATED DIALOG');
 const g=uiFixture();await g.ui.show();await g.click('rename');await g.click('rename-save');assert.equal(g.project.title,'Renamed');assert.equal(g.renames.length,1);assert.equal(g.autosaves.length,1);
});

test('late conflict messages do not replace another dialog',async()=>{
 const f=uiFixture();await f.ui.show();await f.click('rename');const wait=deferred();f.bridge.rename=()=>wait.promise;
 const pending=f.click('rename-save');await tick();f.leave();wait.resolve({ok:false,error:{code:'CONFLICT',message:'Changed remotely'}});await pending;
 assert.equal(f.body.innerHTML,'UNRELATED DIALOG');assert.deepEqual(f.toasts,['Changed remotely']);
});

test('a stale open response cannot replace a new project or a different dialog',async()=>{
 for(const leave of [f=>f.leave(),f=>{f.project=createProject();f.project.title='Another project'}]){
  const f=uiFixture();await f.ui.show();const wait=deferred();f.bridge.read=()=>wait.promise;
  const pending=f.click('open');await tick();leave(f);const current=f.project;wait.resolve({ok:true,...f.record,project:clone(f.record.project)});await pending;
  assert.equal(f.project,current);assert.equal(f.opens.length,0);assert.equal(f.autosaves.length,0);assert.equal(f.closed,0);
 }
});

test('opening a current library record remembers its revision and autosaves the opened project',async()=>{
 const f=uiFixture();await f.ui.show();await f.click('open');
 assert.equal(f.opens.length,1);assert.equal(f.autosaves[0],f.project);assert.equal(f.closed,1);
 const link=readFolderLinks(f.storage).get(f.project.libraryId);assert.equal(link.id,f.record.id);assert.equal(link.revision,f.record.revision);
});

test('a folder read cannot overwrite manual changes in the same working project',async()=>{
 const f=uiFixture();await f.ui.show();const wait=deferred();f.bridge.read=()=>wait.promise;
 const pending=f.click('open');await tick();f.edit(project=>project.title='Changed while reading');const current=f.project;
 wait.resolve({ok:true,...f.record,project:clone(f.record.project)});await pending;
 assert.equal(f.project,current);assert.equal(f.project.title,'Changed while reading');assert.equal(f.opens.length,0);assert.equal(f.autosaves.length,0);assert.equal(f.closed,0);
});

test('folder open tickets are created at the click before disk reading and forwarded unchanged',async()=>{
 const f=uiFixture();await f.ui.show();const wait=deferred();f.bridge.read=()=>wait.promise;
 const pending=f.click('open');await tick();assert.equal(f.openGeneration,1);assert.equal(f.openTickets.length,0);
 wait.resolve({ok:true,...f.record,project:clone(f.record.project)});await pending;
 assert.deepEqual(f.openTickets,[{generation:1}]);assert.equal(f.opens.length,1);assert.equal(f.autosaves[0],f.project);
});

test('a superseded list response cannot redraw the current library',async()=>{
 const f=uiFixture(),wait=deferred();let requests=0;
 f.bridge.list=async()=>++requests===1?wait.promise:{ok:true,projects:[{...f.record,title:'Current response'}]};
 const first=f.ui.show();await tick();await f.ui.show();assert.match(f.body.innerHTML,/Current response/);
 wait.resolve({ok:true,projects:[{...f.record,title:'Obsolete response'}]});await first;
 assert.match(f.body.innerHTML,/Current response/);assert.doesNotMatch(f.body.innerHTML,/Obsolete response/);
});

test('a save finishing after switching projects cannot autosave the wrong working project',async()=>{
 const f=uiFixture();await f.ui.show();const wait=deferred();f.bridge.save=()=>wait.promise;
 const pending=f.ui.save();await tick();f.project=createProject();f.project.title='Keep this project';f.leave();wait.resolve({ok:true,...f.record,revision:'late-save'});await pending;
 assert.equal(f.project.title,'Keep this project');assert.equal(f.autosaves.length,0);assert.equal(f.body.innerHTML,'UNRELATED DIALOG');
});
