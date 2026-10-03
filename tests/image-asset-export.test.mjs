import test from 'node:test';
import assert from 'node:assert/strict';
import {imageAssetCanvas} from '../src/image-asset-export.js';
test('raw decal export uses all original pixels instead of its cropped layer frame',()=>{
 const calls=[],image={naturalWidth:1800,naturalHeight:1200,w:20,h:5,cropZoom:3,tintMode:'solid'},canvas={getContext:()=>({drawImage:(...args)=>calls.push(args)})};
 const result=imageAssetCanvas(image,()=>canvas);assert.equal(result.width,1800);assert.equal(result.height,1200);assert.deepEqual(calls,[[image,0,0,1800,1200]]);
});
test('invalid and unbounded image sizes are rejected before allocating a canvas',()=>{
 const create=()=>{throw Error('Allocated')};
 assert.throws(()=>imageAssetCanvas({naturalWidth:0,naturalHeight:12},create),/размер/);
 assert.throws(()=>imageAssetCanvas({naturalWidth:10000,naturalHeight:10000},create),/слишком большая/);
});
