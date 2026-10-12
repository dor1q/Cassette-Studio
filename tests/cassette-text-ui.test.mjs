import test from 'node:test';
import assert from 'node:assert/strict';
import {cassetteTextOverflowControls} from '../src/cassette-text-ui.js';

test('cassette text limits expose independent wrap and crop controls without changing the layer',()=>{
 const layer={type:'text',nowrap:true,clipText:false},before=structuredClone(layer),properties=[];
 const html=cassetteTextOverflowControls(layer,{propCheck:(name,key)=>{properties.push(key);return '<label><input data-prop="'+key+'" '+(layer[key]?'checked':'')+'>'+name+'</label>'}});
 assert.deepEqual(properties,['nowrap','clipText']);assert.match(html,/data-prop="nowrap" checked/);assert.doesNotMatch(html,/data-prop="clipText" checked/);
 assert.deepEqual(layer,before);assert.equal(cassetteTextOverflowControls({type:'image'},{propCheck(){throw Error('Image text controls')}}),'');
});
