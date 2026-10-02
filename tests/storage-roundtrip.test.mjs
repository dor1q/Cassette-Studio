import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB,IDBObjectStore} from 'fake-indexeddb';
import {createProject,migrate} from '../src/model.js';
globalThis.indexedDB=indexedDB;
const storage=await import('../src/storage.js');

test('Save, reopen and Save retain one library record and the same autosave identity',async()=>{
 const p=createProject(),id='library-reload-test';p.title='Проверка сохранения';
 await storage.saveLibraryProject(id,p);
 const reopened=await import('../src/storage.js?reopened');
 const records=await reopened.loadProjects(),project=migrate(records.find(r=>r.id==='autosave').project);
 assert.equal(project.libraryId,id);project.title='Обновлённый проект';
 await reopened.saveLibraryProject(project.libraryId,project);
 const saved=await reopened.loadProjects();assert.equal(saved.filter(r=>r.id!=='autosave').length,1);
 assert.equal(saved.find(r=>r.id===id).project.title,'Обновлённый проект');assert.equal(saved.find(r=>r.id==='autosave').project.libraryId,id);
});

test('failure of the second storage write aborts the entire save and leaves the previous project intact',async()=>{
 const previous=(await storage.loadProjects()).find(r=>r.id==='autosave'),put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(record,...args){if(record.id==='autosave')throw new DOMException('Quota exceeded','QuotaExceededError');return put.call(this,record,...args)};
 try{await assert.rejects(storage.saveLibraryProject('failed-library-save',createProject()),/Quota exceeded/)}finally{IDBObjectStore.prototype.put=put}
 const records=await storage.loadProjects();assert.equal(records.some(r=>r.id==='failed-library-save'),false);
 assert.deepEqual(records.find(r=>r.id==='autosave').project,previous.project);
});
