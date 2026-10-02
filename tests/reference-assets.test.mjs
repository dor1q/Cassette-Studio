import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,dimensions,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {parseReferenceDecals,referenceDecalLayer,restoreReferenceDecals} from '../src/reference-assets.js';

test('original decal coordinates restore size and center on J-card',()=>{
 const [decal]=parseReferenceDecals('cro2_16.2_95.1_0_229_o_f');
 const project=createProject(),layer=referenceDecalLayer(project,decal,{name:'Chrome dioxide'},'data:image/png;base64,iVBORw0KGgo=',800,120);
 assert.ok(Math.abs(layer.w-77.55)<.1);
 assert.ok(Math.abs((layer.x+layer.w/2)/dimensions(project,'outer').w-.3912)<.01);
 assert.ok(Math.abs((layer.y+layer.h/2)/dimensions(project,'outer').h-.951)<.001);
});

test('original decal import embeds public catalog image and reports unavailable uploads',async()=>{
 const project=createProject(),params=new URLSearchParams({d:'cro2_16.2_95.1_0_229_o_f|custom-under-1790193336820_14.1_51.3_-90_356_u_b_r90'});
 const request=async path=>path==='/api/decals'?[{id:'cassetteGraphics',items:[{id:'cro2',name:'Chrome dioxide'}]}]:{src:'data:image/png;base64,iVBORw0KGgo='};
 const result=await restoreReferenceDecals(project,params,request,async()=>[800,120]);
 assert.deepEqual(result,{restored:1,missing:1,placeholders:1});
 const placeholder=project.surfaces.outer.find(l=>l.missingReference);
 assert.equal(placeholder.referenceId,'custom-under-1790193336820');
 assert.equal(placeholder.src,'');
 assert.equal(project.surfaces.outer.at(-1).referenceId,'cro2');
});

test('unavailable uploaded artwork survives saving and shows a guide only in editor',async()=>{
 const project=createProject(),params=new URLSearchParams({d:'custom-under-1790193336820_14.1_51.3_-90_356_u_b_r90'});
 await restoreReferenceDecals(project,params,async()=>[]);
 const saved=migrate(JSON.parse(JSON.stringify(project))),layer=saved.surfaces.outer.find(l=>l.missingReference);
 assert.equal(layer.referenceId,'custom-under-1790193336820');
 assert.equal(layer.rotation,-90);
 const editor=renderSvg(saved,'outer',{editing:true}),print=renderSvg(saved,'outer',{editing:false});
 assert.match(editor.svg,/Загрузите изображение/);
 assert.doesNotMatch(print.svg,/Загрузите изображение/);
 assert.ok(print.warnings.some(w=>w.includes('Загрузите файл')));
});
