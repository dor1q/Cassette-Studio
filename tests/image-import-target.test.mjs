import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer} from '../src/model.js';
import {captureImageImportTarget,assertImageImportTarget} from '../src/image-import-target.js';

function fixture(){const p=createProject();p.surfaces.outer=[makeLayer('image',{name:'One'}),makeLayer('image',{name:'Two'})];return p}
test('image replacement remembers the requested layer even if a different layer is selected later',()=>{
 const p=fixture(),first=p.surfaces.outer[0],target=captureImageImportTarget(p,'outer',{kind:'replace',selected:first.id,revision:4});
 assert.equal(target.layerId,first.id);assert.equal(assertImageImportTarget(target,p,'outer','jcard',4),first);
});
test('pending image imports reject a different project, side, mode or content revision',()=>{
 const p=fixture(),target=captureImageImportTarget(p,'outer',{kind:'background',revision:4});
 for(const args of [[fixture(),'outer','jcard',4],[p,'inner','jcard',4],[p,'outer','label',4],[p,'outer','jcard',5]])assert.throws(()=>assertImageImportTarget(target,...args),/макет изменился/);
});
test('a removed or newly locked replacement target cannot receive the pending file',()=>{
 const p=fixture(),first=p.surfaces.outer[0],target=captureImageImportTarget(p,'outer',{kind:'replace',selected:first.id});
 first.locked=true;assert.throws(()=>assertImageImportTarget(target,p,'outer','jcard',0),/закреплена/);
 p.surfaces.outer.shift();assert.throws(()=>assertImageImportTarget(target,p,'outer','jcard',0),/больше не существует/);
});
test('replacing text and replacing a locked cover are refused before file reading',()=>{
 const p=fixture();p.surfaces.outer.push(makeLayer('text',{id:'text'}));assert.throws(()=>captureImageImportTarget(p,'outer',{kind:'replace',selected:'text'}),/Выберите картинку/);
 p.surfaces.outer[0].category='albumCover';p.surfaces.outer[0].locked=true;assert.throws(()=>captureImageImportTarget(p,'outer',{kind:'art'}),/закреплена/);
});
