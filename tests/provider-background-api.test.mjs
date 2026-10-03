import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startStudioServer} from '../server.mjs';
import {createProject,migrate} from '../src/model.js';
import {restoreReferenceBackgrounds} from '../src/reference-background.js';

const igdb='https://images.igdb.com/igdb/image/upload/t_original/co123.jpg';
const steam='https://cdn2.steamgriddb.com/grid/abcdef123456.png';
const bytes=Buffer.from('public image bytes');
const raster=(mime='image/png',data=bytes)=>new Response(data,{headers:{'Content-Type':mime}});
const withServer=async(fetchImpl,run)=>{
 const folder=await mkdtemp(join(tmpdir(),'cassette-provider-background-'));
 const studio=await startStudioServer({port:0,configDir:folder,useEnvironment:false,fetchImpl});
 try{await run(studio)}finally{await studio.close();await rm(folder,{recursive:true,force:true})}
};
const fetchImage=(studio,url)=>fetch(studio.origin+'/api/image?url='+encodeURIComponent(url));

test('exact public IGDB and SteamGridDB image paths embed allowed raster bytes',async()=>{
 const calls=[];
 await withServer(async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');return raster()},async studio=>{
  for(const url of [igdb,igdb.replace('t_original','t_cover_big_2x'),steam,steam.replace('/grid/','/hero/').replace('.png','.webp')]){
   const response=await fetchImage(studio,url);
   assert.equal(response.status,200);assert.equal((await response.json()).src,'data:image/png;base64,'+bytes.toString('base64'));
  }
  assert.equal(calls.length,4);
 });
});

test('provider admission rejects unrelated endpoints, subdomains and altered URLs before fetch',async()=>{
 let calls=0;
 await withServer(async()=>{calls++;return raster()},async studio=>{
  for(const url of [
   'https://igdb.com/igdb/image/upload/t_original/co123.jpg',
   igdb.replace('images.igdb.com','evil.images.igdb.com'),
   igdb.replace('/igdb/image/upload/','/api/'),
   igdb.replace('co123.jpg','co123.svg'),
   igdb.replace('co123.jpg','co-123.jpg'),
   igdb.replace('https:','http:'),
   igdb.replace('images.igdb.com','images.igdb.com:8443'),
   igdb.replace('https://','https://user:password@'),
   igdb+'?token=private',igdb+'#fragment',
   steam.replace('cdn2.steamgriddb.com','cdn3.steamgriddb.com'),
   steam.replace('cdn2.steamgriddb.com','nested.cdn2.steamgriddb.com'),
   steam.replace('/grid/','/api/grid/'),
   steam.replace('abcdef123456.png','not-a-hash.png'),
   steam.replace('.png','.svg'),steam+'?download=1',
  ])assert.equal((await fetchImage(studio,url)).status,400,url);
  assert.equal(calls,0);
 });
});

test('provider redirects to another known public image path still embed bytes',async()=>{
 const calls=[];
 await withServer(async url=>{calls.push(url);return calls.length===1?new Response(null,{status:302,headers:{Location:steam}}):raster('image/webp')},async studio=>{
  const response=await fetchImage(studio,igdb);
  assert.equal(response.status,200);assert.equal((await response.json()).src,'data:image/webp;base64,'+bytes.toString('base64'));
  assert.deepEqual(calls,[igdb,steam]);
 });
});

test('every provider redirect revalidates the host, image path and protocol',async()=>{
 for(const destination of ['http://127.0.0.1/private',igdb.replace('co123.jpg','private.json'),steam.replace('cdn2.','unknown.'),igdb+'?token=private']){
  const calls=[];
  await withServer(async url=>{calls.push(url);return new Response(null,{status:302,headers:{Location:destination}})},async studio=>{
   assert.equal((await fetchImage(studio,igdb)).status,400);assert.deepEqual(calls,[igdb]);
  });
 }
});

test('new provider sources retain image format and byte limits',async()=>{
 for(const [mime,data] of [['image/svg+xml',bytes],['text/html',bytes],['image/avif',bytes],['image/png',new Uint8Array(15_000_001)]]){
  await withServer(async()=>raster(mime,data),async studio=>{
   const response=await fetchImage(studio,igdb);assert.equal(response.status,400);
   assert.match((await response.json()).error,mime==='image/png'?/слишком большая/:/формат/);
  });
 }
});

test('main and extra provider backgrounds restore on both cassette faces and reopen offline',async()=>{
 const calls=[],params=new URLSearchParams({bg:'131139.tg_co123_cover_big.75.0',bgl:'_ts-grid-abcdef123456-png_f_125_620_470_60_multiply_2__90'});
 await withServer(async url=>{calls.push(url);return raster()},async studio=>{
  const project=createProject();
  const request=async path=>{const response=await fetch(studio.origin+path),data=await response.json();if(!response.ok)throw Error(data.error);return data};
  assert.deepEqual(await restoreReferenceBackgrounds(project,params,request,'label',[],async()=>[800,400]),{restored:2,missing:0});
  assert.deepEqual(calls,[igdb.replace('t_original','t_cover_big'),steam]);
  for(const surface of ['labelA','labelB']){
   const layers=project.surfaces[surface].filter(layer=>layer.referenceBackground);
   assert.equal(layers.length,2);assert.equal(layers[0].opacity,.75);assert.equal(layers[1].opacity,.6);
   assert.equal(layers[1].blendMode,'multiply');assert.equal(layers[1].rotation,90);
  }
  const saved=migrate(JSON.parse(JSON.stringify(project))),cache=Object.values(saved.surfaces).flat(),reopened=createProject();
  assert.deepEqual(await restoreReferenceBackgrounds(reopened,params,()=>{throw Error('offline')},'label',cache,async()=>[800,400]),{restored:2,missing:0});
  for(const surface of ['labelA','labelB']){
   const select=layer=>Object.fromEntries(['src','referenceAssetKey','x','y','w','h','opacity','rotation','fit','blur','blendMode'].map(key=>[key,layer[key]]));
   assert.deepEqual(reopened.surfaces[surface].filter(layer=>layer.referenceBackground).map(select),saved.surfaces[surface].filter(layer=>layer.referenceBackground).map(select));
  }
 });
});
