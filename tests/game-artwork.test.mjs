import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createGameArtwork} from '../game-artwork.mjs';
import {startStudioServer} from '../server.mjs';

const credentials=()=>({STEAMGRIDDB_API_KEY:'k'.repeat(32),IGDB_CLIENT_ID:'c'.repeat(30),IGDB_CLIENT_SECRET:'s'.repeat(30)});
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
const token=()=>({access_token:'t'.repeat(30),expires_in:7200,token_type:'bearer'});
function make(fetchImpl,options={}){let clock=1000;return createGameArtwork({fetchImpl,getConfig:credentials,now:()=>clock,sleep:async delay=>{clock+=delay},...options})}

test('unconfigured providers explain which local connection settings are missing',async()=>{
 const gallery=createGameArtwork({getConfig:()=>({IGDB_CLIENT_ID:'c'.repeat(30)}),fetchImpl:()=>assert.fail('Missing keys must not make requests')});
 assert.deepEqual(gallery.status(),{steamgriddb:false,igdb:false,igdbClientIdConfigured:true,igdbClientSecretConfigured:false});
 await assert.rejects(gallery.search('igdb','Halo'),/Client ID и Client Secret/);
 await assert.rejects(gallery.search('steamgriddb','Halo'),/свой API-ключ/);
});

test('invalid provider, query and game id are rejected before any upstream request',async()=>{
 const gallery=make(()=>assert.fail('Invalid input must not make requests'));
 for(const query of ['a','x'.repeat(101),'Halo\nfields *;'])await assert.rejects(gallery.search('igdb',query),/от 2 до 100/);
 for(const provider of ['https://127.0.0.1','constructor','toString'])await assert.rejects(gallery.search(provider,'Halo'),/Выберите IGDB/);
 for(const id of ['1; where id=2;','https://example.com','../1','0','-1','1.5','1'.repeat(11)])await assert.rejects(gallery.images('igdb',id),/ID игры/);
 const bad=make(()=>assert.fail('Malformed credentials must not be sent'),{getConfig:()=>({STEAMGRIDDB_API_KEY:'wrong\nAuthorization: secret'})});
 await assert.rejects(bad.search('steamgriddb','Halo'),/формат ключей/);
});

test('IGDB uses application credentials in the POST body and escaped bounded search queries',async()=>{
 const calls=[],keys=credentials(),query='Halo "; fields *; \\';
 const gallery=make(async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  if(url==='https://id.twitch.tv/oauth2/token'){
   assert.equal(options.method,'POST');assert.equal(new URL(url).search,'');const body=new URLSearchParams(options.body);
   assert.equal(body.get('client_id'),keys.IGDB_CLIENT_ID);assert.equal(body.get('client_secret'),keys.IGDB_CLIENT_SECRET);assert.equal(body.get('grant_type'),'client_credentials');return json(token());
  }
  assert.equal(url,'https://api.igdb.com/v4/games');assert.equal(options.method,'POST');assert.equal(options.headers['Client-ID'],keys.IGDB_CLIENT_ID);assert.equal(options.headers.Authorization,'Bearer '+token().access_token);
  assert.equal(options.body,'search '+JSON.stringify(query)+'; fields name,first_release_date; limit 20;');
  return json([{id:42,name:'Halo\nInfinite',first_release_date:1638316800},{id:42,name:'Duplicate'},{id:'../43',name:'Invalid'},{id:44,name:''}]);
 });
 const result=await gallery.search('igdb',query);assert.deepEqual(result,[{id:'42',title:'Halo Infinite',year:'2021'}]);
 result[0].title='Mutated';assert.equal((await gallery.search('igdb',query))[0].title,'Halo Infinite');assert.equal(calls.length,2);
 assert.ok(!JSON.stringify(await gallery.search('igdb',query)).includes(keys.IGDB_CLIENT_SECRET));
});

test('IGDB expands this game only and returns full-picture documented CDN sizes',async()=>{
 const gallery=make(async(url,options)=>{
  if(url==='https://id.twitch.tv/oauth2/token')return json(token());
  assert.equal(url,'https://api.igdb.com/v4/games');assert.match(options.body,/cover\.image_id/);assert.match(options.body,/artworks\.width/);assert.match(options.body,/screenshots\.height/);assert.match(options.body,/where id = 42; limit 1;$/);
  return json([{id:42,cover:{image_id:'CoverOne',width:1200,height:1800},artworks:[{image_id:'ArtOne',width:3840,height:2160},{image_id:'../../bad',width:10,height:10},{image_id:'CoverOne',width:1200,height:1800}],screenshots:[{image_id:'ShotOne',width:800,height:600},{image_id:'Animation',width:800,height:600,animated:true},{image_id:'MissingSize'}]},{id:43,cover:{image_id:'WrongGame',width:800,height:600}}]);
 });
 const images=await gallery.images('igdb','42');assert.deepEqual(images,[
  {file_path:'https://images.igdb.com/igdb/image/upload/t_1080p/CoverOne.jpg',width:720,height:1080,label:'Обложка',provider:'igdb'},
  {file_path:'https://images.igdb.com/igdb/image/upload/t_1080p/ArtOne.jpg',width:1920,height:1080,label:'Иллюстрация · 1',provider:'igdb'},
  {file_path:'https://images.igdb.com/igdb/image/upload/t_1080p/ShotOne.jpg',width:800,height:600,label:'Скриншот · 1',provider:'igdb'}
 ]);
});

test('SteamGridDB search uses a Bearer header and bounded normalized results',async()=>{
 let calls=0;const gallery=make(async(url,options)=>{
  calls++;assert.equal(url,'https://www.steamgriddb.com/api/v2/search/autocomplete/Halo%20Wars');assert.equal(options.headers.Authorization,'Bearer '+credentials().STEAMGRIDDB_API_KEY);
  return json({success:true,data:Array.from({length:30},(_,index)=>({id:index+1,name:'Game '+index}))});
 });
 const found=await gallery.search('steamgriddb',' Halo Wars ');assert.equal(found.length,20);assert.deepEqual(found[0],{id:'1',title:'Game 0'});
 await gallery.search('steamgriddb','Halo Wars');assert.equal(calls,1);
});

test('SteamGridDB images keep exact supported CDN addresses and reject unsafe or unsupported assets',async()=>{
 const calls=[],gallery=make(async(url,options)=>{
  calls.push(url);assert.equal(options.headers.Authorization,'Bearer '+credentials().STEAMGRIDDB_API_KEY);const u=new URL(url);
  assert.equal(u.hostname,'www.steamgriddb.com');assert.equal(u.searchParams.get('types'),'static');assert.equal(u.searchParams.get('limit'),'25');assert.equal(u.searchParams.get('page'),'0');
  const kind=u.pathname.split('/')[3],category={grids:'grid',heroes:'hero',logos:'logo',icons:'icon'}[kind];
  const base={width:600,height:900},urlFor=suffix=>'https://cdn2.steamgriddb.com/'+category+'/'+suffix;
  return json({success:true,data:[{...base,url:urlFor('abc123.png')},{...base,url:urlFor('abc123.png')},{...base,url:'http://127.0.0.1/private.png'},{...base,url:'https://cdn2.steamgriddb.com.evil.test/'+category+'/ab.png'},{...base,url:urlFor('bad.svg')},{...base,url:urlFor('abc.png?secret=yes')},{...base,url:urlFor('abc.png#anchor')},{...base,url:urlFor('abc.webp'),animated:true},{url:urlFor('ab.png')},{...base,url:'https://user:pass@cdn2.steamgriddb.com/'+category+'/ac.png'},{...base,url:'https://cdn2.steamgriddb.com:8443/'+category+'/aa.png'}]});
 });
 const images=await gallery.images('steamgriddb','42');assert.equal(calls.length,4);assert.equal(images.length,4);
 assert.deepEqual(images.map(image=>image.file_path),['grid','hero','logo','icon'].map(kind=>'https://cdn2.steamgriddb.com/'+kind+'/abc123.png'));
 assert.ok(images.every(image=>image.width===600&&image.height===900&&image.provider==='steamgriddb'));
 await gallery.images('steamgriddb','42');assert.equal(calls.length,4);
});

test('empty SteamGridDB image categories do not hide the available categories',async()=>{
 const gallery=make(async url=>url.includes('/grids/')?json({success:true,data:[{url:'https://cdn2.steamgriddb.com/grid/abc123.png',width:600,height:900}]}):json({success:false},404));
 assert.equal((await gallery.images('steamgriddb','42')).length,1);
});

test('redirects and upstream errors never expose credential-bearing response text',async()=>{
 let calls=0;const gallery=make(async()=>{calls++;return json({error:credentials().STEAMGRIDDB_API_KEY},302,{Location:'http://127.0.0.1/private'})});
 await assert.rejects(gallery.search('steamgriddb','Halo'),error=>!error.message.includes(credentials().STEAMGRIDDB_API_KEY));assert.equal(calls,1);
 const denied=make(async()=>json({error:credentials().STEAMGRIDDB_API_KEY},403));
 await assert.rejects(denied.search('steamgriddb','Halo'),error=>error.message.includes('Подключениях')&&!error.message.includes(credentials().STEAMGRIDDB_API_KEY));
 const limited=make(async()=>json({error:'rate-limit'},429));await assert.rejects(limited.search('steamgriddb','Halo'),/слишком много запросов/);
});

test('IGDB renews a rejected app token once without reusing stale cached results',async()=>{
 let tokens=0,games=0;const gallery=make(async(url,options)=>{
  if(url==='https://id.twitch.tv/oauth2/token'){tokens++;return json({...token(),access_token:String(tokens).repeat(30)})}
  games++;if(games===1)return json({error:'expired'},401);
  assert.equal(options.headers.Authorization,'Bearer '+'2'.repeat(30));return json([{id:42,name:'Halo'}]);
 });
 assert.deepEqual(await gallery.search('igdb','Halo'),[{id:'42',title:'Halo'}]);assert.equal(tokens,2);assert.equal(games,2);
});

test('hourly Twitch validation checks that a cached app token belongs to the configured client',async()=>{
 let clock=1000,tokens=0,validations=0;const gallery=make(async(url,options)=>{
  if(url==='https://id.twitch.tv/oauth2/token'){tokens++;return json(token())}
  if(url==='https://id.twitch.tv/oauth2/validate'){validations++;assert.equal(options.headers.Authorization,'OAuth '+token().access_token);return json({client_id:credentials().IGDB_CLIENT_ID,expires_in:3599})}
  return json([{id:42,name:'Halo'}]);
 },{now:()=>clock});
 await gallery.search('igdb','Halo');clock+=3600001;await gallery.search('igdb','Halo 2');assert.equal(tokens,1);assert.equal(validations,1);
});

test('changing credentials during authentication prevents the old response from reaching the gallery',async()=>{
 const config=credentials();let gameRequests=0;
 const gallery=make(async url=>{if(url==='https://id.twitch.tv/oauth2/token'){config.IGDB_CLIENT_SECRET='n'.repeat(30);return json(token())}gameRequests++;return json([{id:42,name:'Halo'}])},{getConfig:()=>config});
 await assert.rejects(gallery.search('igdb','Halo'),/Настройки игровых каталогов изменились/);assert.equal(gameRequests,0);
});

test('response budgets and timeouts stop oversized or hanging catalog requests',async()=>{
 const declared=make(async()=>json({success:true,data:[]},200,{'Content-Length':'2000001'}));await assert.rejects(declared.search('steamgriddb','Halo'),/ответ слишком большой/);
 const actual=make(async()=>new Response('x'.repeat(2000001),{headers:{'Content-Type':'application/json'}}));await assert.rejects(actual.search('steamgriddb','Halo'),/ответ слишком большой/);
 const timeout=make(async(url,{signal})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(json({success:true,data:[]})),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('timeout'))},{once:true})}),{timeout:10});
 await assert.rejects(timeout.search('steamgriddb','Halo'),/слишком много времени/);
});

test('IGDB query scheduling stays below its four-per-second limit and shares concurrent requests',async()=>{
 let clock=1000;const starts=[],delays=[];
 const gallery=make(async url=>{if(url==='https://id.twitch.tv/oauth2/token')return json(token());starts.push(clock);return json([{id:42,name:'Halo'}])},{now:()=>clock,sleep:async delay=>{delays.push(delay);clock+=delay}});
 await Promise.all([gallery.search('igdb','Halo 1'),gallery.search('igdb','Halo 2'),gallery.search('igdb','Halo 3'),gallery.search('igdb','Halo 1')]);
 assert.deepEqual(starts,[1000,1260,1520]);assert.deepEqual(delays,[260,260]);
});

test('slow authentication and token renewal cannot cause a burst of IGDB game requests',async()=>{
 let clock=1000,calls=0;const starts=[];
 const gallery=make(async url=>{
  if(url==='https://id.twitch.tv/oauth2/token'){clock+=500;return json(token())}
  starts.push(clock);calls++;return calls===1?json({error:'expired'},401):json([{id:42,name:'Halo'}]);
 },{now:()=>clock,sleep:async delay=>{clock+=delay}});
 await Promise.all([gallery.search('igdb','Halo 1'),gallery.search('igdb','Halo 2'),gallery.search('igdb','Halo 3')]);
 assert.equal(starts.length,4);assert.ok(starts.slice(1).every((start,index)=>start-starts[index]>=260));
});

test('server settings persist local keys, expose only flags and retain the image-proxy contract',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cassette-game-artwork-')),keys=credentials();let server;
 const fetchImpl=async(url,options)=>{
  if(url==='https://id.twitch.tv/oauth2/token')return json(token());
  if(url==='https://api.igdb.com/v4/games')return json([{id:42,name:'Halo',cover:{image_id:'CoverOne',width:800,height:600}}]);
  if(url.startsWith('https://www.steamgriddb.com/api/v2/search/autocomplete/'))return json({success:true,data:[{id:42,name:'Halo'}]});
  if(url==='https://images.igdb.com/igdb/image/upload/t_1080p/CoverOne.jpg')return new Response(Buffer.from('image bytes'),{headers:{'Content-Type':'image/jpeg'}});
  assert.fail('Unexpected external address: '+url);
 };
 try{
  server=await startStudioServer({port:0,configDir:dir,useEnvironment:false,fetchImpl});
  const status=await fetch(server.origin+'/api/status').then(response=>response.json()),post=value=>fetch(server.origin+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:server.origin,'X-Settings-Token':status.settingsToken},body:JSON.stringify(value)});
  assert.equal((await post(keys)).status,200);assert.equal((await post({IGDB_CLIENT_SECRET:'bad\nPORT=1'})).status,400);
  const saved=await fetch(server.origin+'/api/status').then(response=>response.json());assert.equal(saved.steamgriddb,true);assert.equal(saved.igdb,true);
  for(const value of Object.values(keys))assert.ok(!JSON.stringify(saved).includes(value));
  const local=await readFile(path.join(dir,'.env'),'utf8');for(const [key,value]of Object.entries(keys))assert.ok(local.includes(key+'='+value));
  assert.equal((await fetch(server.origin+'/.env')).status,404);
  assert.deepEqual(await fetch(server.origin+'/api/artwork/search?provider=steamgriddb&q=Halo').then(response=>response.json()),[{id:'42',title:'Halo'}]);
  const images=await fetch(server.origin+'/api/artwork/images?provider=igdb&id=42').then(response=>response.json());assert.equal(images.length,1);
  assert.match((await fetch(server.origin+'/api/image?url='+encodeURIComponent(images[0].file_path)).then(response=>response.json())).src,/^data:image\/jpeg;base64,/);
  await server.close();server=await startStudioServer({port:0,configDir:dir,useEnvironment:false,fetchImpl});assert.equal((await fetch(server.origin+'/api/status').then(response=>response.json())).igdb,true);
  const reopened=await fetch(server.origin+'/api/status').then(response=>response.json());assert.equal((await fetch(server.origin+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:server.origin,'X-Settings-Token':reopened.settingsToken},body:JSON.stringify({STEAMGRIDDB_API_KEY:'',IGDB_CLIENT_SECRET:''})})).status,200);
  const cleared=await fetch(server.origin+'/api/status').then(response=>response.json());assert.equal(cleared.steamgriddb,false);assert.equal(cleared.igdb,false);assert.equal(cleared.igdbClientIdConfigured,true);assert.equal(cleared.igdbClientSecretConfigured,false);
 }finally{await server?.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'cassette-game-artwork-'));await rm(dir,{recursive:true,force:true})}
});
