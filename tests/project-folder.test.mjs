import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink,link,rename,realpath,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createProjectFolderStore,PROJECT_FOLDER_NAME,projectFolderLockDirectory} from '../desktop/project-folder.mjs';

async function fixture(t,options){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'cassette-folder-test-')));
 const links=[];
 t.after(async()=>{assert.ok(path.basename(root).startsWith('cassette-folder-test-'));for(const target of links.reverse())await unlink(target);await rm(projectFolderLockDirectory(directory),{recursive:true,force:true});await rm(root,{recursive:true,force:true})});
 const parent=path.join(root,'cloud'),config=path.join(root,'profile');await mkdir(parent);await mkdir(config);
 const store=createProjectFolderStore(config,options),directory=path.join(parent,PROJECT_FOLDER_NAME);
 return {root,parent,config,directory,store,links};
}
const project=()=>({version:2,title:'Альбом',data:{artist:'Crystal Castles',album:'Crystal Castles',A:[{title:'Alice Practice',seconds:101}],B:[]},layout:{panels:3},settings:{bg:'#123456'},surfaces:{outer:[{type:'image',src:'data:image/png;base64,aW1hZ2U='}],inner:[],labelA:[],labelB:[]},uploads:[{src:'data:image/png;base64,aW1hZ2U='}],fonts:[{name:'My Font',data:'data:font/ttf;base64,Zm9udA=='}]});
const code=value=>error=>error.code===value;

test('folder library persists the selected folder and complete embedded project across profiles',async t=>{
 const {store,parent,config,root,directory}=await fixture(t);
 assert.deepEqual(await store.status(),{configured:false,available:false,folderLabel:''});
 assert.deepEqual(await store.configure(parent),{configured:true,available:true,folderLabel:directory});
 const original=project(),saved=await store.save({project:original});
 assert.match(saved.id,/^[a-z0-9-]+$/);assert.ok(saved.revision);assert.equal(saved.title,original.title);
 assert.deepEqual((await store.read(saved.id)).project,original);
 const restarted=createProjectFolderStore(config);assert.equal((await restarted.status()).available,true);
 assert.equal((await restarted.list()).projects.length,1);
 const other=createProjectFolderStore(path.join(root,'profile-other'));await other.configure(parent);
 assert.deepEqual((await other.read(saved.id)).project,original);
 const bytes=JSON.parse(await readFile(path.join(directory,saved.id+'.cassette.json'),'utf8'));
 assert.equal(bytes.format,'cassette-studio-project');assert.equal(bytes.version,1);assert.equal(bytes.id,saved.id);
 assert.deepEqual(bytes.project.fonts,original.fonts);assert.deepEqual(bytes.project.uploads,original.uploads);
});

test('updates, renames and favorites require current revision; trash preserves removed file',async t=>{
 const {store,parent,directory}=await fixture(t);await store.configure(parent);
 const original=project(),initial=await store.save({id:'project-first',project:original});
 const updated=await store.save({id:initial.id,project:{...original,title:'Другой альбом'},expectedRevision:initial.revision});
 assert.notEqual(updated.revision,initial.revision);assert.equal(updated.createdAt,initial.createdAt);
 const renamed=await store.rename({id:initial.id,title:'  Имя\nпосле переименования  ',expectedRevision:updated.revision});
 assert.equal(renamed.title,'Имя после переименования');assert.equal((await store.read(initial.id)).project.title,renamed.title);
 const favorite=await store.favorite({id:initial.id,favorite:true,expectedRevision:renamed.revision});
 assert.equal(favorite.favorite,true);assert.equal((await store.list()).projects[0].favorite,true);
 await assert.rejects(store.remove({id:initial.id,expectedRevision:renamed.revision}),code('CONFLICT'));
 const before=await readFile(path.join(directory,initial.id+'.cassette.json'),'utf8');
 assert.deepEqual(await store.remove({id:initial.id,expectedRevision:favorite.revision}),{id:initial.id,removed:true,recoverable:true});
 assert.equal((await store.list()).projects.length,0);await assert.rejects(store.read(initial.id),code('NOT_FOUND'));
 const archived=(await readdir(path.join(directory,'.trash'))).filter(name=>name.endsWith('.cassette.json'));
 assert.equal(archived.length,1);assert.equal(await readFile(path.join(directory,'.trash',archived[0]),'utf8'),before);
});

test('stale revision, missing expected revision and removed project never silently overwrite',async t=>{
 const {store,parent,root}=await fixture(t);await store.configure(parent);
 const other=createProjectFolderStore(path.join(root,'second-profile'));await other.configure(parent);
 const first=await store.save({id:'shared',project:project()});
 await assert.rejects(other.save({id:first.id,project:project()}),code('CONFLICT'));
 const second=await other.save({id:first.id,project:{...project(),title:'Из второго компьютера'},expectedRevision:first.revision});
 await assert.rejects(store.save({id:first.id,project:{...project(),title:'Старая копия'},expectedRevision:first.revision}),code('CONFLICT'));
 assert.equal((await store.read(first.id)).title,'Из второго компьютера');
 await other.remove({id:first.id,expectedRevision:second.revision});
 await assert.rejects(store.save({id:first.id,project:project(),expectedRevision:second.revision}),code('CONFLICT'));
 const recreated=await store.save({id:first.id,project:project()});assert.notEqual(recreated.revision,second.revision);
});

test('concurrent profile writes produce exactly one successful revision',async t=>{
 const {store,parent,root}=await fixture(t);await store.configure(parent);
 const other=createProjectFolderStore(path.join(root,'second-profile'));await other.configure(parent);
 const initial=await store.save({id:'concurrent',project:project()});
 const results=await Promise.allSettled([store.save({id:initial.id,project:{...project(),title:'First'},expectedRevision:initial.revision}),other.save({id:initial.id,project:{...project(),title:'Second'},expectedRevision:initial.revision})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.ok(['CONFLICT','BUSY'].includes(results.find(r=>r.status==='rejected').reason.code));
 assert.equal((await store.read(initial.id)).revision,results.find(r=>r.status==='fulfilled').value.revision);
});

test('disconnect leaves projects intact and persists disconnected state',async t=>{
 const {store,parent,config,directory}=await fixture(t);await store.configure(parent);
 const saved=await store.save({project:project()});await store.disconnect();
 assert.equal((await store.status()).configured,false);assert.equal((await createProjectFolderStore(config).status()).configured,false);
 await assert.rejects(store.list(),code('NOT_CONFIGURED'));assert.ok(await readFile(path.join(directory,saved.id+'.cassette.json')));
 await store.configure(parent);assert.equal((await store.read(saved.id)).revision,saved.revision);
});

test('files in an unowned managed-name folder and foreign project JSON are preserved',async t=>{
 const {store,parent,directory}=await fixture(t);await mkdir(directory);await writeFile(path.join(directory,'notes.json'),'Private unrelated data');
 await assert.rejects(store.configure(parent),code('INVALID_FOLDER'));assert.equal(await readFile(path.join(directory,'notes.json'),'utf8'),'Private unrelated data');
 await rm(path.join(directory,'notes.json'));await store.configure(parent);
 const foreign='{"id":"foreign","title":"Never overwrite"}';await writeFile(path.join(directory,'foreign.cassette.json'),foreign);
 await assert.rejects(store.save({id:'foreign',project:project()}),code('INVALID_PROJECT'));
 await assert.rejects(store.rename({id:'foreign',title:'Changed',expectedRevision:'anything'}),code('INVALID_PROJECT'));
 await assert.rejects(store.remove({id:'foreign',expectedRevision:'anything'}),code('INVALID_PROJECT'));
 assert.equal(await readFile(path.join(directory,'foreign.cassette.json'),'utf8'),foreign);
 const listed=await store.list();assert.equal(listed.projects.length,0);assert.equal(listed.skipped,1);
});

test('unsafe identifiers, invalid project and oversized payload are rejected without writing records',async t=>{
 const {store,parent,directory}=await fixture(t,{maxBytes:4096});await store.configure(parent);
 for(const id of ['../outside','x/y','x\\y','Upper','CON','con','nul','com1','project.txt','','x'.repeat(81)])await assert.rejects(store.save({id,project:project()}),code('INVALID_ID'));
 await assert.rejects(store.save({project:null}),code('INVALID_PROJECT'));
 await assert.rejects(store.save({project:{...project(),title:'Huge',uploads:[{src:'x'.repeat(10000)}]}}),code('TOO_LARGE'));
 assert.equal((await store.list()).projects.length,0);assert.deepEqual(await readdir(directory),['.cassette-studio-library.json']);
});

test('selected directory and managed child junctions cannot redirect file operations',async t=>{
 const {store,parent,root,directory,links}=await fixture(t),outside=path.join(root,'outside');await mkdir(outside);
 const redirected=path.join(root,'linked-cloud');await symlink(outside,redirected,process.platform==='win32'?'junction':'dir');links.push(redirected);
 await assert.rejects(store.configure(redirected),code('UNSAFE_PATH'));assert.deepEqual(await readdir(outside),[]);
 await store.configure(parent);const saved=await store.save({id:'before-redirect',project:project()});
 await rename(directory,path.join(parent,'kept-library'));await symlink(outside,directory,process.platform==='win32'?'junction':'dir');links.push(directory);
 assert.equal((await store.status()).available,false);await assert.rejects(store.read(saved.id),code('UNSAFE_PATH'));
 await assert.rejects(store.save({project:project()}),code('UNSAFE_PATH'));assert.deepEqual(await readdir(outside),[]);
});

test('hard-linked files cannot read or replace files outside the library',async t=>{
 const {store,parent,root,directory}=await fixture(t);await store.configure(parent);
 const saved=await store.save({id:'hardlinked',project:project()}),file=path.join(directory,saved.id+'.cassette.json'),outside=path.join(root,'outside-record.json');
 await link(file,outside);const before=await readFile(outside,'utf8');
 await assert.rejects(store.read(saved.id),code('UNSAFE_PATH'));
 await assert.rejects(store.save({id:saved.id,project:project(),expectedRevision:saved.revision}),code('UNSAFE_PATH'));
 await assert.rejects(store.remove({id:saved.id,expectedRevision:saved.revision}),code('UNSAFE_PATH'));
 assert.equal(await readFile(outside,'utf8'),before);assert.equal((await store.list()).projects.length,0);
});

test('a junction replacing the trash cannot move projects outside the library',async t=>{
 const {store,parent,root,directory,links}=await fixture(t);await store.configure(parent);
 const saved=await store.save({id:'trash-redirect',project:project()}),outside=path.join(root,'outside-trash');await mkdir(outside);
 await symlink(outside,path.join(directory,'.trash'),process.platform==='win32'?'junction':'dir');links.push(path.join(directory,'.trash'));
 await assert.rejects(store.remove({id:saved.id,expectedRevision:saved.revision}),code('UNSAFE_PATH'));
 assert.equal((await store.read(saved.id)).revision,saved.revision);assert.deepEqual(await readdir(outside),[]);
});

test('disconnected or temporarily missing cloud folder returns a useful status',async t=>{
 const {store,parent,directory}=await fixture(t);await store.configure(parent);
 await rename(directory,directory+'-temporarily-unavailable');
 const status=await store.status();assert.equal(status.configured,true);assert.equal(status.available,false);assert.equal(status.error.code,'UNAVAILABLE');
 await rename(directory+'-temporarily-unavailable',directory);assert.equal((await store.status()).available,true);
});

test('a lock left by a crashed local app is recovered without changing the project',async t=>{
 const {store,parent,directory}=await fixture(t);await store.configure(parent);
 const saved=await store.save({id:'recover-after-crash',project:project()});
 const ended=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});assert.equal(ended.status,0);
 const lock={format:'cassette-studio-project-lock',id:saved.id,nonce:randomUUID(),machine:createHash('sha256').update(os.hostname().toLowerCase()).digest('hex').slice(0,32),pid:Number(ended.stdout),createdAt:new Date().toISOString()};
 const locks=projectFolderLockDirectory(directory);await writeFile(path.join(locks,`.${saved.id}.lock`),JSON.stringify(lock));
 const updated=await store.save({id:saved.id,project:{...project(),title:'После перезапуска'},expectedRevision:saved.revision});
 assert.notEqual(updated.revision,saved.revision);assert.equal((await store.read(saved.id)).title,'После перезапуска');
 assert.equal((await readdir(locks)).some(name=>name.endsWith('.lock')),false);
});

test('unknown locks and active local locks are preserved',async t=>{
 const {store,parent,directory}=await fixture(t);await store.configure(parent);
 const saved=await store.save({id:'active-lock',project:project()}),file=path.join(projectFolderLockDirectory(directory),`.${saved.id}.lock`);
 const active={format:'cassette-studio-project-lock',id:saved.id,nonce:randomUUID(),machine:createHash('sha256').update(os.hostname().toLowerCase()).digest('hex').slice(0,32),pid:process.pid,createdAt:new Date().toISOString()};
 for(const bytes of ['Unknown data',JSON.stringify(active)]){
  await writeFile(file,bytes);await assert.rejects(store.save({id:saved.id,project:project(),expectedRevision:saved.revision}),code('BUSY'));
  assert.equal(await readFile(file,'utf8'),bytes);assert.equal((await store.read(saved.id)).revision,saved.revision);
 }
});

test('large embedded artwork remains out of the library metadata response',async t=>{
 const {store,parent}=await fixture(t);await store.configure(parent);
 const original=project();original.title='Literal ,"project": metadata';original.uploads=[{src:'data:image/png;base64,'+'YQ=='.repeat(50000)}];
 const saved=await store.save({project:original}),list=await store.list();
 assert.equal(list.projects.length,1);assert.equal(list.projects[0].title,original.title);assert.equal(list.projects[0].revision,saved.revision);
 assert.ok(!('project' in list.projects[0]));assert.deepEqual((await store.read(saved.id)).project.uploads,original.uploads);
});

test('mutations reject a changed folder rather than writing the newly selected library',async t=>{
 const {store,parent,root,directory}=await fixture(t);await store.configure(parent);
 const original=await store.save({id:'same-name',project:project(),expectedFolder:directory});
 const secondParent=path.join(root,'other-cloud');await mkdir(secondParent);await store.configure(secondParent);
 const secondDirectory=path.join(secondParent,PROJECT_FOLDER_NAME),other=await store.save({id:original.id,project:{...project(),title:'Other library'}});
 t.after(()=>rm(projectFolderLockDirectory(secondDirectory),{recursive:true,force:true}));
 const payload={id:other.id,expectedRevision:other.revision,expectedFolder:directory};
 for(const action of [()=>store.save({...payload,project:project()}),()=>store.rename({...payload,title:'Unexpected'}),()=>store.favorite({...payload,favorite:true}),()=>store.remove(payload)])await assert.rejects(action(),code('FOLDER_CHANGED'));
 assert.equal((await store.read(other.id)).title,'Other library');assert.equal((await store.read(other.id)).revision,other.revision);
 await store.configure(parent);assert.equal((await store.read(original.id)).revision,original.revision);
});

test('old synced remote lock files cannot block local saves and no new lock enters cloud files',async t=>{
 const {store,parent,directory}=await fixture(t);await store.configure(parent);
 const saved=await store.save({id:'foreign-crash',project:project()}),file=path.join(directory,`.${saved.id}.lock`);
 const remote=JSON.stringify({format:'cassette-studio-project-lock',id:saved.id,machine:'another-computer',nonce:randomUUID(),pid:100,createdAt:new Date().toISOString()});await writeFile(file,remote);
 const updated=await store.save({id:saved.id,project:{...project(),title:'Local save'},expectedRevision:saved.revision});
 assert.notEqual(updated.revision,saved.revision);assert.equal(await readFile(file,'utf8'),remote);
 assert.deepEqual((await readdir(directory)).sort(),['.cassette-studio-library.json',`.${saved.id}.lock`,`${saved.id}.cassette.json`].sort());
 assert.deepEqual(await readdir(projectFolderLockDirectory(directory)),[]);
});
