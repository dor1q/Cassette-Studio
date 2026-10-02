import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {startStudioServer} from '../server.mjs';
import {isAppUrl,externalUrl,proxyUrl,APP_ORIGIN,trustedInitiator} from '../desktop/policy.mjs';

test('desktop links stay inside the app or open only allowed external destinations',()=>{
 const origin='http://127.0.0.1:8769';
 assert.equal(isAppUrl('cassette://studio/'),true);assert.equal(isAppUrl('cassette://evil/'),false);
 assert.equal(isAppUrl('cassette://user@studio/'),false);
 for(const url of ['file:///C:/Windows','javascript:alert(1)','data:text/html,x','http://example.com','https://user:password@example.com','http://127.0.0.1:8769/api/settings'])assert.equal(externalUrl(url,origin),null);
 assert.equal(externalUrl('cassette://studio/api/spotify/login',origin),origin+'/api/spotify/login');
 assert.equal(externalUrl('https://open.spotify.com/album/test',origin),'https://open.spotify.com/album/test');
 assert.equal(proxyUrl('cassette://studio/api/search?q=album',origin),origin+'/api/search?q=album');
 assert.throws(()=>proxyUrl('cassette://other/api/status',origin));
 assert.equal(trustedInitiator(APP_ORIGIN),true);assert.equal(trustedInitiator(undefined),true);assert.equal(trustedInitiator('https://open.spotify.com'),false);assert.equal(trustedInitiator('null'),false);
});
test('embedded server stores desktop settings outside the package and keeps separate instances isolated',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cassette-desktop-')),a=path.join(root,'a'),b=path.join(root,'b');let first,second,reopened;
 try{
  first=await startStudioServer({port:0,configDir:a,useEnvironment:false,allowedOrigins:[APP_ORIGIN]});
  second=await startStudioServer({port:0,configDir:b,useEnvironment:false});
  const status=await fetch(first.origin+'/api/status').then(r=>r.json());
  assert.equal(status.redirect,first.origin+'/api/spotify/callback');
  const post=(origin,token,requestOrigin=APP_ORIGIN)=>fetch(origin+'/api/settings',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json','X-Settings-Token':token},body:JSON.stringify({SPOTIFY_CLIENT_ID:'c'.repeat(32),YOUTUBE_API_KEY:'K'.repeat(39)})});
  assert.equal((await post(first.origin,status.settingsToken)).status,200);
  assert.match(await readFile(path.join(a,'.env'),'utf8'),/SPOTIFY_CLIENT_ID=c{32}/);
  const other=await fetch(second.origin+'/api/status').then(r=>r.json());assert.equal(other.spotify,false);
  assert.equal((await post(second.origin,other.settingsToken)).status,403);
  const privateFiles=['/.env','/desktop/main.mjs','/package.json','/../.env','/data/.env'];for(const file of privateFiles)assert.equal((await fetch(first.origin+file)).status,404);
  await first.close();first=null;
  reopened=await startStudioServer({port:0,configDir:a,useEnvironment:false,allowedOrigins:[APP_ORIGIN]});
  const saved=await fetch(reopened.origin+'/api/status').then(r=>r.json());assert.equal(saved.spotify,true);assert.equal(saved.youtube,true);assert.ok(!JSON.stringify(saved).includes('K'.repeat(39)));
 }finally{
  await Promise.all([first,second,reopened].filter(Boolean).map(s=>s.close()));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep+'cassette-desktop-'));await rm(root,{recursive:true,force:true});
 }
});
test('desktop package includes the editor and excludes personal settings and development files',async()=>{
 const config=JSON.parse(await readFile(new URL('../desktop/builder.json',import.meta.url),'utf8'));
 assert.equal(config.asar,true);assert.ok(config.files.includes('app.js'));assert.ok(config.files.includes('server.mjs'));
 assert.ok(!config.files.some(f=>f.includes('.env')||f.includes('output')||f.includes('preview-')));
 assert.deepEqual(config.win.target.map(t=>t.target),['portable','nsis']);
});

test('public design artwork permits the original featured store and blocks foreign or private redirect targets',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cassette-artwork-'));let server;const calls=[];
 try{
  server=await startStudioServer({port:0,configDir:root,useEnvironment:false,fetchImpl:async url=>{
   calls.push(String(url));if(String(url).includes('redirect.png'))return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
   return new Response(Buffer.from('image'),{headers:{'content-type':'image/png'}});
  }});
  const get=url=>fetch(server.origin+'/api/image?url='+encodeURIComponent(url));
  const featured='https://eizyapzorzvzfyowkmdu.supabase.co/storage/v1/object/public/featured-assets/featured/test/cover.png';
  const response=await get(featured);assert.equal(response.status,200);assert.match((await response.json()).src,/^data:image\/png;base64,/);
  for(const url of ['https://eizyapzorzvzfyowkmdu.supabase.co/storage/v1/object/sign/user-uploads/private.png','https://other.supabase.co/storage/v1/object/public/featured-assets/image.png','https://user:secret@vhs.texs.org/image.png','http://127.0.0.1/private','https://vhs.texs.org/redirect.png'])assert.equal((await get(url)).status,400);
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.startsWith('https://')));
 }finally{await server?.close();assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep+'cassette-artwork-'));await rm(root,{recursive:true,force:true})}
});
