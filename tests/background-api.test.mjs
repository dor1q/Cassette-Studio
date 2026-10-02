import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startStudioServer} from '../server.mjs';

test('AVIF background transfer is restricted to the original public pattern directory',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cassette-background-'));
 const bytes=Buffer.from('00000020667479706176696600000000617669666d696631','hex');
 const studio=await startStudioServer({port:0,configDir:folder,useEnvironment:false,fetchImpl:async()=>new Response(bytes,{headers:{'Content-Type':'image/avif'}})});
 try{
  const fetchImage=url=>fetch(studio.origin+'/api/image?url='+encodeURIComponent(url));
  const pattern=await fetchImage('https://vhs.texs.org/_patterns/02-marbe-bg-2.avif');
  assert.equal(pattern.status,200);assert.equal((await pattern.json()).src,'data:image/avif;base64,'+bytes.toString('base64'));
  for(const url of ['https://vhs.texs.org/unrelated.avif','https://i.scdn.co/image/example']){
   const rejected=await fetchImage(url);assert.ok(rejected.status>=400);
  }
 }finally{await studio.close();await rm(folder,{recursive:true,force:true})}
});
