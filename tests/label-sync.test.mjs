import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,clone,makeLayer} from '../src/model.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';
import {synchronizeLabelLayers} from '../src/label-sync.js';

test('ordinary label synchronization copies the edited design and cover choice with independent layer ids',()=>{
 const p=createProject();applyAlbumArt(p,'data:image/png;base64,T0xE');
 albumArtLayer(p,'labelA').referenceCoverIndex=3;p.referenceCoverIndices={outer:8,labelA:1,labelB:2};
 p.surfaces.labelA.push(makeLayer('image',{src:'data:image/png;base64,TkVX',name:'Manual image',x:12,y:8,w:44,h:23,cropZoom:1.5}));
 const before=clone(p),result=synchronizeLabelLayers(p,'labelA');
 assert.deepEqual(result,{mirrored:true,blocked:false,other:'labelB'});assert.equal(p.layout.sync,true);
 assert.deepEqual(p.surfaces.labelA,before.surfaces.labelA);assert.deepEqual(p.surfaces.outer,before.surfaces.outer);assert.deepEqual(p.surfaces.inner,before.surfaces.inner);
 assert.equal(p.surfaces.labelB.length,p.surfaces.labelA.length);
 p.surfaces.labelB.forEach((layer,index)=>{assert.notEqual(layer.id,p.surfaces.labelA[index].id);assert.deepEqual({...layer,id:''},{...p.surfaces.labelA[index],id:''});assert.notEqual(layer,p.surfaces.labelA[index])});
 assert.deepEqual(p.referenceCoverIndices,{outer:8,labelA:3,labelB:3});
});

test('synchronization preserves a locked destination image and disables itself before replacing any layers',()=>{
 const p=createProject();applyAlbumArt(p,'data:image/png;base64,T0xE');const cover=albumArtLayer(p,'labelB');
 Object.assign(cover,{locked:true,src:'data:image/png;base64,TE9DSw==',cropZoom:1.8,cropX:4});
 p.referenceCoverIndices={labelA:1,labelB:7};const destination=p.surfaces.labelB,before=clone(p),result=synchronizeLabelLayers(p,'labelA');
 assert.deepEqual(result,{mirrored:false,blocked:true,other:'labelB'});assert.equal(p.layout.sync,false);assert.equal(p.surfaces.labelB,destination);
 assert.deepEqual(p.surfaces,before.surfaces);assert.deepEqual(p.referenceCoverIndices,before.referenceCoverIndices);
});

test('any locked destination layer protects an independently edited side when synchronization is enabled',()=>{
 const p=createProject();p.layout.sync=false;const layer=p.surfaces.labelA.find(item=>item.type==='text');layer.locked=true;layer.text='Custom B-side note';
 const before=clone(p.surfaces);p.layout.sync=true;const result=synchronizeLabelLayers(p,'labelB');
 assert.equal(result.blocked,true);assert.equal(p.layout.sync,false);assert.deepEqual(p.surfaces,before);
});

test('a blocked sync stays off until explicitly enabled after the destination is unlocked',()=>{
 const p=createProject();p.surfaces.labelB[0].locked=true;synchronizeLabelLayers(p,'labelA');
 p.surfaces.labelB[0].locked=false;const before=clone(p.surfaces.labelB);
 assert.deepEqual(synchronizeLabelLayers(p,'labelA'),{mirrored:false,blocked:false});assert.deepEqual(p.surfaces.labelB,before);
 p.layout.sync=true;assert.equal(synchronizeLabelLayers(p,'labelA').mirrored,true);
});

test('J-card edits do not trigger label synchronization or discard independent cover indices',()=>{
 const p=createProject();p.referenceCoverIndices={outer:4,labelA:2,labelB:3};const before=clone(p);
 assert.deepEqual(synchronizeLabelLayers(p,'outer'),{mirrored:false,blocked:false});assert.deepEqual(p,before);
});

test('synchronizing a side without an indexed cover removes stale paired indices only',()=>{
 const p=createProject();p.referenceCoverIndices={outer:4,labelA:2,labelB:3};
 synchronizeLabelLayers(p,'labelB');assert.deepEqual(p.referenceCoverIndices,{outer:4});
});
