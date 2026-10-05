import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from '../src/model.js';
import {importReference} from '../src/reference-import.js';
import {referenceMusicUrl,referenceMusicGalleryScope,restoreReferenceMusicMetadata,restoreReferenceMusicArtwork} from '../src/reference-music.js';
import {referenceMusicSource,restoreReferenceSideMusic,sanitizeReferenceSideMusic} from '../src/reference-side-music.js';
import {albumArtLayer} from '../src/album-art.js';

const spotifyId='5SknXhmjHijD0uU1Pm2HBr',mainUrl='https://open.spotify.com/album/'+spotifyId;
const sideAUrl='https://music.apple.com/gb/album/id1441164426',sideBUrl='https://www.deezer.com/playlist/12345';
const main={url:mainUrl,artist:'Main artist',album:'Main album',cover:'https://example.com/main.png',recordLabels:['Main Records'],
 customPosters:[{file_path:'https://example.com/extra.png',label:'Extra'},{file_path:null,label:'Unavailable slot'}],tracks:[{title:'Main track',seconds:100,thumbnail:'https://example.com/track.png'}]};
const sideA={url:sideAUrl,artist:'Side artist',album:'Side album',cover:'https://example.com/side-a.png',recordLabels:['Side Records'],tracks:[{title:'A first',artist:'Singer',seconds:70},{title:'A second',seconds:80}]};
const sideB={url:sideBUrl,artist:'B artist',album:'B album',cover:'https://example.com/side-b.png',tracks:[{title:'B only',seconds:90}]};
const ref=params=>new URL('https://vhs.texs.org/en/jcard?'+new URLSearchParams({id:'sa.'+spotifyId,musicArtist:'Keep artist',musicAlbum:'Keep album',...params}));
const provider=(calls=[])=>async path=>{calls.push(path);const url=new URL(path,'https://studio.test').searchParams.get('url');if(url===mainUrl)return structuredClone(main);if(url===sideAUrl)return structuredClone(sideA);if(url===sideBUrl)return structuredClone(sideB);throw Error('Unavailable')};

test('saved side collection IDs and compact IDs normalize through the same supported service parser',()=>{
 const rows=[['spotify-album:'+spotifyId,mainUrl],['a.spotify-album:'+spotifyId,mainUrl],['sa.spotify-album:'+spotifyId,mainUrl],['spotify:'+spotifyId,'https://open.spotify.com/playlist/'+spotifyId],
  ['sp.'+spotifyId,'https://open.spotify.com/playlist/'+spotifyId],['spotify:track:'+spotifyId,'https://open.spotify.com/track/'+spotifyId],['youtube-video:dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['yt.PL1234567890123','https://www.youtube.com/playlist?list=PL1234567890123'],['deezer:12345',sideBUrl],['1441164426',sideAUrl],['a.1441164426',sideAUrl],
  ['apple:pl.0123456789abcdef0123456789abcdef','https://music.apple.com/gb/playlist/pl.0123456789abcdef0123456789abcdef'],['https://musicbrainz.org/release/01234567-89ab-cdef-0123-456789abcdef','https://musicbrainz.org/release/01234567-89ab-cdef-0123-456789abcdef']];
 for(const [input,expected]of rows)assert.equal(referenceMusicSource(input,{country:'GB'}),expected,input);
 assert.equal(referenceMusicUrl(new URLSearchParams({musicId:'spotify:'+spotifyId})),'https://open.spotify.com/playlist/'+spotifyId);
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'a.spotify-album:'+spotifyId})),mainUrl);
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'a.pl.123456abcdef',source:'apple'})),'https://music.apple.com/us/playlist/pl.123456abcdef');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'dz.12345',source:'deezer-album'})),'https://www.deezer.com/album/12345');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'1441164426'})),'');
 for(const input of ['https://127.0.0.1/private','https://music.apple.com.evil.test/album/123','spotify-album:123','apple:pl.123','file:///D:/private','spotify-episode:'+spotifyId])assert.equal(referenceMusicSource(input),'',input);
});

test('sai restores a real Apple playlist collection ID with tracks and selectable cover',async()=>{
 const playlistId='pl.0123456789abcdef0123456789abcdef',playlistUrl='https://music.apple.com/gb/playlist/'+playlistId;
 const url=ref({country:'gb',sai:'apple:'+playlistId,mp:'3.1.00.0.0.0'}),p=createProject();importReference(p,url);const calls=[];
 const request=async path=>{const source=new URL(path,'https://studio.test').searchParams.get('url');calls.push(source);if(source===playlistUrl)return {...sideA,url:playlistUrl};return provider()(path)};
 await restoreReferenceSideMusic(p,url.searchParams,request);await restoreReferenceMusicMetadata(p,url,request);
 assert.equal(p.referenceSideMusic.A.url,playlistUrl);assert.deepEqual(p.data.A.map(t=>t.title),['A first','A second']);assert.equal(p.referenceCoverChoices[3].file_path,sideA.cover);assert.deepEqual(calls,[playlistUrl,mainUrl]);
});

test('sai and sbi restore all side tracks while keeping cassette names, main cover, palette and record labels',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:'deezer:12345',bg:'131139'});importReference(p,url);
 const palette={...p.settings},calls=[];
 const result=await restoreReferenceSideMusic(p,url.searchParams,provider(calls));
 assert.deepEqual(result.restored,['A','B']);assert.deepEqual(result.warnings,[]);assert.equal(calls.length,2);
 assert.deepEqual(p.data.A.map(t=>t.title),['A first','A second']);assert.deepEqual(p.data.B.map(t=>t.title),['B only']);
 assert.equal(p.data.A[0].seconds,70);assert.equal(p.data.artist,'Keep artist');assert.equal(p.data.album,'Keep album');assert.deepEqual(p.settings,palette);assert.deepEqual(p.data.recordLabels,[]);
 assert.equal(albumArtLayer(p,'outer'),undefined);assert.equal(p.uploads.length,0);
 assert.equal(p.referenceSideMusic.A.url,sideAUrl);assert.equal(p.referenceSideMusic.B.album.cover,sideB.cover);
});

test('explicit side lists, including an empty list, remain authoritative over imported side tracks',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:'deezer:12345',musicA:'Custom - Owner (2:00)',musicB:''});importReference(p,url);
 const before=structuredClone(p.data);await restoreReferenceSideMusic(p,url.searchParams,provider());
 assert.deepEqual(p.data.A,before.A);assert.deepEqual(p.data.B,[]);assert.equal(p.referenceSideMusic.A.album.tracks.length,2);
});

test('side cover gallery appends A then B after existing slots and selected mp uses the corresponding actual image',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:'deezer:12345',mp:'4.1.00.0.0.0'});importReference(p,url);
 const calls=[],request=provider(calls);await restoreReferenceSideMusic(p,url.searchParams,request);
 await restoreReferenceMusicMetadata(p,url,request);
 assert.deepEqual(p.referenceCoverChoices.map(c=>c.file_path),[main.cover,'https://example.com/extra.png',null,sideA.cover,sideB.cover]);
 assert.deepEqual(p.referenceCoverChoices.slice(3).map(c=>c.type),['side-import','side-import']);
 assert.deepEqual(p.data.recordLabels,['Main Records']);assert.equal(p.referenceMusicMetadata.cover,main.cover);
 const images=[],bytes='data:image/png;base64,aGVsbG8=';
 const result=await restoreReferenceMusicArtwork(p,url,async path=>{if(path.startsWith('/api/image?')){images.push(new URL(path,'https://studio.test').searchParams.get('url'));return {src:bytes}}return request(path)},'jcard',p,async()=>({w:600,h:600}));
 assert.deepEqual(images,[sideB.cover]);assert.equal(result.index,4);assert.equal(albumArtLayer(p,'outer').src,bytes);assert.equal(p.referenceMusicMetadata.customPosters.length,4);
 await restoreReferenceMusicMetadata(p,url,()=>{throw Error('Unexpected request')});
 assert.equal(p.referenceCoverChoices.length,5);assert.equal(p.referenceCoverChoices[4].file_path,sideB.cover);
});

test('same source on A/B makes one request and appends one side poster without shifting existing indices',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:sideAUrl});importReference(p,url);const calls=[];
 await restoreReferenceSideMusic(p,url.searchParams,provider(calls));await restoreReferenceMusicMetadata(p,url,provider(calls));
 assert.equal(calls.length,2);assert.deepEqual(p.data.A.map(t=>t.title),p.data.B.map(t=>t.title));assert.notEqual(p.data.A[0].id,p.data.B[0].id);
 assert.deepEqual(p.referenceCoverChoices.map(c=>c.file_path),[main.cover,'https://example.com/extra.png',null,sideA.cover]);
});

test('failed or unsupported side sources leave that side intact and report a separate warning',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:'https://127.0.0.1/private'});importReference(p,url);p.data.B=[{id:'keep',title:'Keep B',seconds:2}];const calls=[];
 const result=await restoreReferenceSideMusic(p,url.searchParams,provider(calls));assert.deepEqual(result.restored,['A']);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/Сторона B/);assert.equal(calls.length,1);assert.equal(p.data.B[0].title,'Keep B');
 url.searchParams.set('sbi','deezer:77777');const failed=await restoreReferenceSideMusic(p,url.searchParams,provider());assert.match(failed.warnings[0],/Сторона B: Unavailable/);assert.equal(p.data.B[0].title,'Keep B');
});

test('side metadata survives JSON validation and restores the same reference galleries without music network requests',async()=>{
 const p=createProject(),url=ref({country:'gb',sai:'1441164426',sbi:'deezer:12345'});importReference(p,url);
 await restoreReferenceSideMusic(p,url.searchParams,provider());await restoreReferenceMusicMetadata(p,url,provider());
 const saved=validateProject(JSON.parse(JSON.stringify(p)));sanitizeReferenceSideMusic(saved);
 const next=createProject();importReference(next,url);
 const offline=()=>{throw Error('Offline network request')};
 await restoreReferenceSideMusic(next,url.searchParams,offline,{previous:saved});await restoreReferenceMusicMetadata(next,url,offline,saved);
 assert.deepEqual(next.data.A.map(t=>t.title),['A first','A second']);assert.equal(next.referenceCoverChoices[4].file_path,sideB.cover);
});

test('changing side source does not retain stale side posters from main metadata cache',async()=>{
 const previous=createProject(),url=ref({country:'gb',sai:'1441164426'});importReference(previous,url);
 await restoreReferenceSideMusic(previous,url.searchParams,provider());await restoreReferenceMusicMetadata(previous,url,provider());
 url.searchParams.delete('sai');url.searchParams.set('sbi','deezer:12345');const next=createProject();importReference(next,url);
 await restoreReferenceSideMusic(next,url.searchParams,provider(),{previous});await restoreReferenceMusicMetadata(next,url,()=>{throw Error('Must use main cache')},previous);
 assert.deepEqual(next.referenceCoverChoices.map(c=>c.file_path),[main.cover,'https://example.com/extra.png',null,sideB.cover]);
});

test('cached exact source remains usable offline when moved from A to B',async()=>{
 const previous=createProject(),url=ref({country:'gb',sai:'1441164426'});importReference(previous,url);
 await restoreReferenceSideMusic(previous,url.searchParams,provider());
 const next=createProject();url.searchParams.delete('sai');url.searchParams.set('sbi',sideAUrl);importReference(next,url);
 const result=await restoreReferenceSideMusic(next,url.searchParams,()=>{throw Error('Offline')},{previous});
 assert.deepEqual(result.restored,['B']);assert.deepEqual(result.warnings,[]);assert.equal(next.data.B[0].title,'A first');
});

test('side-only reference restores mp1 and offline bytes without assigning a fake main music URL',async()=>{
 const url=new URL('https://vhs.texs.org/en/jcard?'+new URLSearchParams({country:'gb',sai:'1441164426',mp:'1.1.00.0.0.0'})),p=createProject();importReference(p,url);
 const calls=[],bytes='data:image/png;base64,aGVsbG8=';
 const request=async path=>{if(path.startsWith('/api/image?')){calls.push(path);assert.equal(new URL(path,'https://studio.test').searchParams.get('url'),sideA.cover);return {src:bytes}}return provider(calls)(path)};
 await restoreReferenceSideMusic(p,url.searchParams,request);const metadata=await restoreReferenceMusicMetadata(p,url,request);
 assert.equal(metadata.musicUrl,'');assert.equal(metadata.album.cover,'');assert.equal(metadata.choices[0].file_path,null);assert.equal(metadata.choices[1].file_path,sideA.cover);
 const result=await restoreReferenceMusicArtwork(p,url,request,'jcard',p,async()=>({w:600,h:600}));
 assert.equal(result.index,1);assert.equal(result.artwork,bytes);assert.equal(p.data.url,'');assert.equal(p.referenceMusicMetadataSource,'');assert.equal(calls.length,2);
 const saved=validateProject(JSON.parse(JSON.stringify(p))),next=createProject();importReference(next,url);const offline=()=>{throw Error('Offline request')};
 await restoreReferenceSideMusic(next,url.searchParams,offline,{previous:saved});await restoreReferenceMusicMetadata(next,url,offline,saved);
 const reopened=await restoreReferenceMusicArtwork(next,url,offline,'jcard',saved,async()=>({w:600,h:600}));
 assert.equal(reopened.artwork,bytes);assert.equal(next.data.url,'');assert.equal(next.referenceCoverChoices[1].file_path,sideA.cover);
});

test('side-only mp0 gives a clear missing-main-cover result and side gallery scopes distinguish exact sources',async()=>{
 const url=new URL('https://vhs.texs.org/en/jcard?country=gb&sai=1441164426&mp=0.1.00.0.0.0'),p=createProject();importReference(p,url);
 await restoreReferenceSideMusic(p,url.searchParams,provider());await restoreReferenceMusicMetadata(p,url,()=>{throw Error('No main request')});
 await assert.rejects(restoreReferenceMusicArtwork(p,url,()=>{throw Error('No image request')}),/нет основной обложки/);
 const scope=referenceMusicGalleryScope(url.searchParams);assert.equal(p.referenceBackgroundChoicesScope,scope);
 url.searchParams.set('sai',sideAUrl);assert.equal(referenceMusicGalleryScope(url.searchParams),scope);
 url.searchParams.set('sai','deezer:12345');assert.notEqual(referenceMusicGalleryScope(url.searchParams),scope);
});

test('saved side cache keeps bounded public metadata and discards secrets and malformed entries',()=>{
 const p=createProject();p.referenceSideMusic={A:{source:'saved',url:sideAUrl,album:{...sideA,privateToken:'secret',tracks:[{...sideA.tracks[0],authorization:'secret'}]}},B:{url:'http://127.0.0.1',album:sideB}};
 sanitizeReferenceSideMusic(p);assert.equal(p.referenceSideMusic.A.album.privateToken,undefined);assert.equal(p.referenceSideMusic.A.album.tracks[0].authorization,undefined);assert.equal(p.referenceSideMusic.B,undefined);
});
