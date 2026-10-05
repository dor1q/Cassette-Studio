import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTrackDuration} from '../src/model.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handler=app.match(/if\(el.dataset.trackField\)\{[^\n]*?changed\(\)\}/)?.[0];
assert.ok(handler,'The actual track editor callback must be found');
const edit=new Function('el','p','trackSide','checkpoint','changed','parseTrackDuration',handler);

test('the track editor accepts hour durations and retains the selected side and track',()=>{
 const p={data:{A:[{seconds:10}],B:[{seconds:20},{seconds:30}]}},history=[],saved=[];
 edit({dataset:{trackField:'seconds',i:'1'},value:'1:40:00'},p,'B',()=>history.push(1),()=>saved.push(1),parseTrackDuration);
 assert.deepEqual(p.data,{A:[{seconds:10}],B:[{seconds:20},{seconds:6000}]});
 assert.equal(history.length,1);assert.equal(saved.length,1);
});

test('invalid durations leave both the track and undo history intact',()=>{
 for(const value of ['1:60:00','1:00:60','bad','']){
  const p={data:{A:[{seconds:10}]}},history=[],saved=[];
  edit({dataset:{trackField:'seconds',i:'0'},value},p,'A',()=>history.push(1),()=>saved.push(1),parseTrackDuration);
  assert.equal(p.data.A[0].seconds,10);assert.equal(history.length,0);assert.equal(saved.length,0);
 }
});
