import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference} from '../src/model.js';

test('side-specific backgrounds disable implicit label synchronization but respect an explicit choice',()=>{
 for(const suffix of ['bg=ffffff.0.100.0&bgp=2','bg=fff&bgl=1_p0_f_100_500_500_100_normal_0_0_0']){
  const p=createProject();
  importReference(p,'https://vhs.texs.org/en/cassette?'+suffix);
  assert.equal(p.layout.sync,false);
  importReference(p,'https://vhs.texs.org/en/cassette?'+suffix+'&ss=1');
  assert.equal(p.layout.sync,true);
 }
});

test('a plain color or background shared by both sides preserves synchronization',()=>{
 for(const suffix of ['bg=123','bg=ffffff.0.100.0&bgp=3','bg=clear']){
  const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?'+suffix);
  assert.equal(p.layout.sync,true);
  if(suffix==='bg=123')assert.equal(p.settings.bg,'#112233');
  if(suffix==='bg=clear')assert.equal(p.settings.referenceTransparentBackground,true);
 }
});
