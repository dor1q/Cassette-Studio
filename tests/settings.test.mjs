import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('local settings reject foreign requests and persist without exposing the API key',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cassette-settings-'));
 await copyFile(new URL('../server.mjs',import.meta.url),path.join(dir,'server.mjs'));
 await copyFile(new URL('../google-fonts.mjs',import.meta.url),path.join(dir,'google-fonts.mjs'));
 await copyFile(new URL('../decal-catalog.mjs',import.meta.url),path.join(dir,'decal-catalog.mjs'));
 await copyFile(new URL('../catalog-match.mjs',import.meta.url),path.join(dir,'catalog-match.mjs'));
 for(const file of ['music-importer.mjs','music-links.mjs','music-network.mjs'])await copyFile(new URL('../'+file,import.meta.url),path.join(dir,file));
 await copyFile(new URL('../studio-logos.json',import.meta.url),path.join(dir,'studio-logos.json'));
 const port=19000+Math.floor(Math.random()*10000),origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:String(port),SPOTIFY_CLIENT_ID:'',YOUTUBE_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server did not start')),5000).unref())]);
  const status=await (await fetch(origin+'/api/status')).json();
  const post=(value,headers={})=>fetch(origin+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Settings-Token':status.settingsToken,...headers},body:JSON.stringify(value)});
  assert.equal((await post({}, {Origin:'https://example.com'})).status,403);
  assert.equal((await post({}, {'X-Settings-Token':'wrong'})).status,400);
  assert.equal((await post({SPOTIFY_CLIENT_ID:'bad\nPORT=1'})).status,400);
  const fakeKey='A'.repeat(39),client='b'.repeat(32);
  assert.equal((await post({SPOTIFY_CLIENT_ID:client,YOUTUBE_API_KEY:fakeKey})).status,200);
  const saved=await (await fetch(origin+'/api/status')).json();
  assert.equal(saved.spotifyClientId,client);assert.equal(saved.youtube,true);
  assert.ok(!JSON.stringify(saved).includes(fakeKey));
  assert.match(await readFile(path.join(dir,'.env'),'utf8'),new RegExp('YOUTUBE_API_KEY='+fakeKey));
  assert.equal((await fetch(origin+'/.env')).status,404);
  assert.equal((await post({YOUTUBE_API_KEY:''})).status,200);
  assert.equal((await (await fetch(origin+'/api/status')).json()).youtube,false);
 }finally{if(child.exitCode===null){child.kill();await once(child,'exit')}assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'cassette-settings-'));await rm(dir,{recursive:true,force:true})}
});
