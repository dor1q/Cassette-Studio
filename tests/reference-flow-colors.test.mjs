import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate} from '../src/model.js';
import {rebuildReferenceFlow,referenceFlowLayers} from '../src/reference-flow.js';
import {setProjectTextColor} from '../src/text-color.js';
import {applyAlbumColors} from '../src/album-colors.js';

test('inactive reference panels follow shared color changes and retain explicit own colors when restored',()=>{
 const project=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&color=ffffff');
 const inner=project.surfaces.inner.filter(layer=>layer.referenceFlow);
 assert.ok(inner.length>=2);inner[1].referenceOwnColor=true;inner[1].color='#ff6600';
 project.layout.double=false;rebuildReferenceFlow(project);
 setProjectTextColor(project,'#112233');applyAlbumColors(project,{bg:'#ffffff',fg:'#000000'});
 project.layout.double=true;rebuildReferenceFlow(project);
 const restored=project.surfaces.inner.filter(layer=>layer.referenceFlow);
 assert.equal(restored[0].color,'#000000');assert.equal(restored[1].color,'#ff6600');
});

test('shared content visibility also reaches inactive panels and survives project reopening',()=>{
 const project=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1');
 project.layout.double=false;rebuildReferenceFlow(project);
 for(const layer of referenceFlowLayers(project)){layer.hideA=true;layer.trackOptions={...layer.trackOptions,showProduction:false}}
 const reopened=migrate(JSON.parse(JSON.stringify(project)));reopened.layout.double=true;rebuildReferenceFlow(reopened);
 for(const layer of reopened.surfaces.inner.filter(layer=>layer.referenceFlow)){assert.equal(layer.hideA,true);assert.equal(layer.trackOptions.showProduction,false)}
});

test('a new original link clears the old inactive panel archive for either editor',()=>{
 const project=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1');
 project.surfaces.inner.find(layer=>layer.referenceFlow).name='Previous project only';
 project.layout.double=false;rebuildReferenceFlow(project);
 importReference(project,'https://vhs.texs.org/en/cassette?musicAlbum=New');
 assert.equal(project.referenceFlowArchive,undefined);assert.equal(project.referenceFlowTemplate,undefined);
 importReference(project,'https://vhs.texs.org/en/jcard?p=5&ds=1');
 assert.ok(!referenceFlowLayers(project).some(layer=>layer.name==='Previous project only'));
});
