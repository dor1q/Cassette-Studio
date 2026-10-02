import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer} from '../src/model.js';
import {restoreReferenceBackgrounds} from '../src/reference-background.js';

const main='https://example.com/main.jpg',custom='https://example.com/custom.jpg',track='https://example.com/track.jpg';
const image='data:image/png;base64,bWFpbg==',selected='data:image/png;base64,c2VsZWN0ZWQ=',size=async()=>[800,400];
const prepared=()=>{const p=createProject();p.referenceBackgroundChoices=[{file_path:main},{file_path:custom},{file_path:track}];p.surfaces.outer.unshift(makeLayer('image',{category:'albumCover',src:selected}));p.referenceCoverIndex=1;return p};

test('t0 loads the main gallery picture even when mp selected a different cover',async()=>{
 const p=prepared(),calls=[];
 const result=await restoreReferenceBackgrounds(p,new URLSearchParams({bg:'ffffff.t0.100.0',mp:'1.1.00.0.0.0'}),async path=>{calls.push(path);return {src:image}},'jcard',[],size);
 assert.equal(new URL('http://localhost'+calls[0]).searchParams.get('url'),main);assert.equal(result.restored,1);
 assert.equal(p.surfaces.outer.find(layer=>layer.referenceBackground).src,image);
 assert.equal(p.surfaces.outer.find(layer=>layer.category==='albumCover').src,selected);
});

test('bgl tN addresses its own gallery entry on both cassette sides',async()=>{
 const p=prepared(),calls=[];
 const result=await restoreReferenceBackgrounds(p,new URLSearchParams({bgl:'_t2_f'}),async path=>{calls.push(path);return {src:image}},'label',[],size);
 assert.equal(calls.length,1);assert.equal(new URL('http://localhost'+calls[0]).searchParams.get('url'),track);assert.equal(result.restored,1);
 for(const surface of ['labelA','labelB'])assert.equal(p.surfaces[surface][0].referenceAssetKey,track);
});

test('unknown gallery indices remain missing rather than substituting cp or the selected cover',async()=>{
 for(const [choices,index] of [[[],0],[[],9],[[{file_path:main}],9]]){
  const p=prepared();p.referenceBackgroundChoices=choices;let calls=0;
  const result=await restoreReferenceBackgrounds(p,new URLSearchParams({bg:'ffffff.t'+index+'.100.0',cp:custom}),async()=>{calls++;return {src:selected}},'jcard',[],size);
  assert.equal(calls,0);assert.equal(result.missing,1);assert.equal(p.surfaces.outer[0].src,'');assert.equal(p.surfaces.outer[0].missingReference,true);
 }
});

test('unavailable and private gallery pictures retain placeholders without trying another index',async()=>{
 for(const file_path of [custom,'storage:owner/private.jpg']){
  const p=prepared();p.referenceBackgroundChoices[1]={file_path};const calls=[];
  const result=await restoreReferenceBackgrounds(p,new URLSearchParams({bg:'ffffff.t1.100.0'}),async path=>{calls.push(path);throw Error('Unavailable')},'jcard',[],size);
  assert.equal(result.missing,1);assert.equal(p.surfaces.outer[0].src,'');assert.equal(calls.length,file_path.startsWith('storage:')?0:1);
  assert.ok(calls.every(path=>new URL('http://localhost'+path).searchParams.get('url')===custom));
 }
});

test('old t0 behavior remains available only when gallery metadata is absent',async()=>{
 const p=createProject();p.surfaces.outer.unshift(makeLayer('image',{category:'albumCover',src:selected}));
 const result=await restoreReferenceBackgrounds(p,new URLSearchParams({bg:'ffffff.t0.100.0'}),()=>{throw Error('Unexpected request')},'jcard',[],size);
 assert.equal(result.restored,1);assert.equal(p.surfaces.outer[0].src,selected);
});
