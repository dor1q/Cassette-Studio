import test from 'node:test';
import assert from 'node:assert/strict';
import {snapMove} from '../src/snapping.js';
test('smart snapping aligns panel edges and other object centers',()=>{
 const l={id:'a',w:20,h:10,rotation:0};
 assert.deepEqual(snapMove(l,39.4,44.5,{w:100,h:100}),{x:40,y:45});
 assert.equal(snapMove(l,24.9,12,{w:200,h:100},[{x:25.4,w:12.7}]).x,25.4);
 assert.equal(snapMove(l,72.4,12,{w:200,h:100},[],[{id:'b',visible:true,rotation:0,x:72,w:20,y:70,h:10}]).x,72);
 assert.equal(snapMove(l,14,17,{w:200,h:100}).x,14);
});
