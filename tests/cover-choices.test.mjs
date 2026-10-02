import test from 'node:test';
import assert from 'node:assert/strict';
import {coverChoices,selectCoverChoice,referenceCoverIndex,buildTrackCoverPosters,audioBackgroundChoices} from '../src/cover-choices.js';
import {restoreReferenceMusicArtwork,restoreReferenceMusicMetadata,referenceMusicUrl} from '../src/reference-music.js';
import {albumArtLayer,referenceArtworkKey} from '../src/album-art.js';
import {loadGalleryChoice} from '../src/cover-gallery.js';
import {createProject,clone,importReference,migrate} from '../src/model.js';

const main='https://example.com/main.jpg',first='https://example.com/first.jpg',second='https://example.com/second.jpg';
const album={cover:main,coverAlternatives:['https://example.com/main-small.jpg'],customPosters:[{file_path:first,label:'First',type:'youtube-thumb'},{file_path:second,label:'Second',type:'youtube-thumb'}]};
const image='data:image/png;base64,aGVsbG8=';
const params=index=>new URLSearchParams({mp:index+'.1.00.0.0.0'});

test('mp indices select actual custom posters in source order, never cover resolution alternatives',()=>{
 assert.deepEqual(coverChoices(album).map(p=>[p.index,p.file_path]),[[0,main],[1,first],[2,second]]);
 for(const [index,file_path] of [[0,main],[1,first],[2,second]]){
  const result=selectCoverChoice(album,params(index));assert.equal(result.file_path,file_path);assert.equal(result.index,index);assert.equal(result.fallback,false);
 }
 assert.equal(selectCoverChoice({...album,customPosters:[]},1).file_path,main);
});

test('missing and unsafe poster slots fall back without moving subsequent indices',()=>{
 const a={cover:main,customPosters:[{file_path:'javascript:alert(1)'},{file_path:second}]};
 assert.equal(coverChoices(a)[1].file_path,null);
 assert.equal(selectCoverChoice(a,1).fallback,true);assert.equal(selectCoverChoice(a,1).index,0);
 assert.equal(selectCoverChoice(a,2).file_path,second);assert.equal(selectCoverChoice(a,50).file_path,main);
 assert.equal(selectCoverChoice({cover:main,customPosters:[{file_path:'https://user:password@example.com/cover.jpg'}]},1).index,0);
});

test('cp upload and saved poster precede provider pictures and duplicate uploads do not change indices',()=>{
 const cp='https://example.com/upload.jpg',savedCover='https://example.com/saved.jpg';
 assert.deepEqual(coverChoices(album,{cp,savedCover}).map(p=>p.file_path),[main,cp,savedCover,first,second]);
 assert.deepEqual(coverChoices(album,{cp,savedCover:cp}).map(p=>p.file_path),[main,cp,first,second]);
 const p=new URLSearchParams({cp});assert.equal(referenceCoverIndex(p),1);assert.equal(selectCoverChoice(album,p).file_path,cp);
 assert.equal(selectCoverChoice(album,new URLSearchParams({cp:second})).file_path,second,'cp always occupies the upload slot even when a provider picture has the same URL');
 p.set('mp','2.1.00.0.0.0');assert.equal(selectCoverChoice(album,p).file_path,first);
 p.set('mp','_');assert.equal(selectCoverChoice(album,p).hidden,true);
 assert.equal(referenceCoverIndex(new URLSearchParams({cp:'2.1.00.0.0.0'})),2);
 assert.equal(referenceCoverIndex(new URLSearchParams({mp:'0.1.00.0.0.0',cp:'2.1.00.0.0.0'})),0);
});

test('track thumbnails create at most twelve unique real pictures, preserving track order',()=>{
 const tracks=[{title:'Main',thumbnail:main},{title:'First',thumbnail:first},{title:'Duplicate',thumbnail:first},{title:'Second',thumbnail:second},...Array.from({length:15},(_,n)=>({title:'Track '+n,thumbnail:'https://example.com/'+n+'.jpg'}))];
 const posters=buildTrackCoverPosters(tracks,{exclude:[main],type:'apple-thumb'});
 assert.equal(posters.length,12);assert.deepEqual(posters.slice(0,2).map(p=>[p.file_path,p.label,p.type]),[[first,'First','apple-thumb'],[second,'Second','apple-thumb']]);
 assert.deepEqual(buildTrackCoverPosters(tracks,{limit:0}),[]);
});

test('tN background gallery has its own deduplicated ordering and includes tracks beyond twelve posters',()=>{
 const tracks=Array.from({length:15},(_,n)=>({title:'Track '+n,thumbnail:'https://example.com/track-'+n+'.jpg'}));
 const choices=audioBackgroundChoices({...album,tracks:[{thumbnail:first},...tracks]});
 assert.equal(choices.length,18);assert.deepEqual(choices.slice(0,4).map(p=>p.file_path),[main,first,second,tracks[0].thumbnail]);
 assert.equal(choices.at(-1).file_path,tracks[14].thumbnail);assert.equal(choices.at(-1).index,17);
});

test('original source prefixes identify playlists rather than inventing album types',()=>{
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'dz.12345'})),'https://www.deezer.com/playlist/12345');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'ap.pl.123456abcdef'})),'https://music.apple.com/us/playlist/pl.123456abcdef');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'12345',source:'deezer-album'})),'https://www.deezer.com/album/12345');
});

test('reference restore requests selected poster and retains index metadata for the UI',async()=>{
 const p=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=2.1.00.0.0.0'),calls=[];
 const result=await restoreReferenceMusicArtwork(p,url,async path=>{calls.push(path);return path.startsWith('/api/import?')?album:{src:image}},'jcard',createProject(),async()=>[1200,600]);
 assert.equal(new URL('http://localhost'+calls[1]).searchParams.get('url'),second);
 assert.equal(result.index,2);assert.equal(p.referenceCoverIndex,2);assert.equal(p.referenceCoverChoices[1].file_path,first);
 const layer=albumArtLayer(p,'outer');
 const factor=Math.max(layer.w/1200,layer.h/600)/Math.min(layer.w/1200,layer.h/600);
 assert.ok(Math.abs(layer.cropZoom-1/factor)<1e-10,'array dimensions must retain the non-square aspect ratio');
});

test('failed selected image loads the main cover and reports the fallback',async()=>{
 const p=createProject(),url=new URL('https://vhs.texs.org/en/cassette?id=a.123&mp=1.1.00.0.0.0'),calls=[];
 const result=await restoreReferenceMusicArtwork(p,url,async path=>{
  calls.push(path);if(path.startsWith('/api/import?'))return album;
  if(new URL('http://localhost'+path).searchParams.get('url')===first)throw Error('Unavailable');return {src:image};
 },'label',createProject(),async()=>({w:600,h:600}));
 assert.equal(calls.length,3);assert.equal(result.index,0);assert.equal(result.fallback,true);assert.equal(result.warnings.length,1);
 assert.equal(p.referenceRequestedCoverIndex,1);assert.equal(p.lastCover,main);
 assert.equal(albumArtLayer(p,'labelA').src,image);assert.equal(albumArtLayer(p,'labelB').src,image);
});

test('artwork cache distinguishes poster indices but not only transform changes',()=>{
 const one=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=1.1.00.0.0.0'),two=new URL(one);
 two.searchParams.set('mp','2.1.00.0.0.0');assert.notEqual(referenceArtworkKey(one),referenceArtworkKey(two));
 two.searchParams.set('mp','1.1.50.15.30.90');assert.equal(referenceArtworkKey(one),referenceArtworkKey(two));
});

test('restore does not use cached bytes of a different indexed poster',async()=>{
 const previous=createProject(),one=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=1.1.00.0.0.0');
 previous.referenceArtworkSource=referenceArtworkKey(one);previous.uploads.push({category:'albumCover',src:image});
 const two=new URL(one);two.searchParams.set('mp','2.1.00.0.0.0');const calls=[];
 const result=await restoreReferenceMusicArtwork(createProject(),two,async path=>{calls.push(path);return path.startsWith('/api/import?')?album:{src:image}},'jcard',previous,async()=>[600,600]);
 assert.equal(calls.length,2);assert.equal(result.index,2);assert.equal(new URL('http://localhost'+calls[1]).searchParams.get('url'),second);
});

test('cp artwork can load gallery metadata without changing its layer, then reuse that import response',async()=>{
 const p=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.123&cp=https%3A%2F%2Fexample.com%2Fupload.jpg&mp=2.1.00.0.0.0'),calls=[];
 const before=JSON.stringify(p.surfaces);p.referenceCoverIndex=1;
 const request=async path=>{calls.push(path);return path.startsWith('/api/import?')?album:{src:image}};
 const meta=await restoreReferenceMusicMetadata(p,url,request);
 assert.equal(meta.cached,false);assert.equal(JSON.stringify(p.surfaces),before);assert.equal(p.referenceCoverIndex,1);
 assert.equal(p.referenceCoverChoices[1].file_path,'https://example.com/upload.jpg');assert.equal(p.referenceBackgroundChoices[0].file_path,main);
 const result=await restoreReferenceMusicArtwork(p,url,request,'jcard',createProject(),async()=>[600,600]);
 assert.equal(calls.filter(path=>path.startsWith('/api/import?')).length,1);assert.equal(result.index,2);assert.equal(result.choices[2].file_path,first);
});

test('gallery metadata cache survives a change of poster index and a project JSON roundtrip',async()=>{
 const previous=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=1.1.00.0.0.0');
 await restoreReferenceMusicMetadata(previous,url,async()=>({...album,tracks:[{title:'Song',thumbnail:second}]}));
 const saved=JSON.parse(JSON.stringify(previous)),next=createProject();url.searchParams.set('mp','2.1.00.0.0.0');
 const result=await restoreReferenceMusicMetadata(next,url,()=>{throw Error('Unexpected service request')},saved);
 assert.equal(result.cached,true);assert.equal(next.referenceCoverChoices[2].file_path,second);assert.equal(next.referenceBackgroundChoices[0].file_path,main);
});

test('reopening a cached reference keeps gallery metadata and permits another saved poster offline',async()=>{
 const previous=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=1.1.00.0.0.0');
 await restoreReferenceMusicArtwork(previous,url,async path=>path.startsWith('/api/import?')?album:{src:image},'jcard',createProject(),async()=>[600,600]);
 const otherImage='data:image/png;base64,d29ybGQ=';
 previous.uploads.push({category:'galleryCover',src:otherImage,referenceAssetKey:second});
 const saved=migrate(JSON.parse(JSON.stringify(previous))),next=clone(saved);importReference(next,url.href);
 const offline=()=>{throw Error('Unexpected network request')};
 await restoreReferenceMusicArtwork(next,url,offline,'jcard',saved,async()=>[600,600]);
 assert.equal(next.referenceMusicMetadataSource,'https://music.apple.com/us/album/id123');
 assert.equal(next.referenceMusicMetadata.customPosters[1].file_path,second);
 assert.equal(next.lastCover,first);assert.equal(next.referenceRequestedCoverIndex,1);
 const another=clone(next);url.searchParams.set('mp','2.1.00.0.0.0');importReference(another,url.href);
 const result=await restoreReferenceMusicArtwork(another,url,offline,'jcard',next,async()=>[600,600]);
 assert.equal(result.index,2);assert.equal(result.artwork,otherImage);
});

test('reopening fallback cover retains the requested index and a visible warning',async()=>{
 const previous=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.123&mp=1.1.00.0.0.0');
 await restoreReferenceMusicArtwork(previous,url,async path=>{
  if(path.startsWith('/api/import?'))return album;
  if(new URL('http://localhost'+path).searchParams.get('url')===first)throw Error('404');return {src:image};
 },'jcard',createProject(),async()=>[600,600]);
 const saved=migrate(JSON.parse(JSON.stringify(previous))),next=clone(saved);importReference(next,url.href);
 const result=await restoreReferenceMusicArtwork(next,url,()=>{throw Error('Offline')},'jcard',saved,async()=>[600,600]);
 assert.equal(result.fallback,true);assert.equal(result.index,0);assert.equal(result.warnings.length,1);
 assert.equal(next.referenceRequestedCoverIndex,1);assert.equal(next.lastCover,main);assert.ok(next.referenceMusicMetadata);
});

test('artwork identity separates regions and providers with the same numeric release ID',async()=>{
 const us=new URL('https://vhs.texs.org/en/jcard?id=a.123&country=us'),gb=new URL(us);gb.searchParams.set('country','gb');
 assert.notEqual(referenceArtworkKey(us),referenceArtworkKey(gb));
 const variants=['apple-track','apple-album','deezer-album'].map(source=>referenceArtworkKey(new URL('https://vhs.texs.org/en/jcard?id=123&source='+source)));
 assert.equal(new Set(variants).size,3);
 const previous=createProject();await restoreReferenceMusicArtwork(previous,us,async path=>path.startsWith('/api/import?')?album:{src:image},'jcard',createProject(),async()=>[600,600]);
 const next=createProject(),calls=[];await restoreReferenceMusicArtwork(next,gb,async path=>{calls.push(path);return path.startsWith('/api/import?')?album:{src:image}},'jcard',previous,async()=>[600,600]);
 assert.equal(calls.filter(path=>path.startsWith('/api/import?')).length,1);assert.match(decodeURIComponent(calls[0]),/music\.apple\.com\/gb\/album/);
 assert.equal(next.data.url,'https://music.apple.com/gb/album/id123');
});

test('both label sides keep the cached main-cover source available to the gallery offline',async()=>{
 const p=createProject(),url=new URL('https://vhs.texs.org/en/cassette?id=a.123');
 await restoreReferenceMusicArtwork(p,url,async path=>path.startsWith('/api/import?')?album:{src:image},'label',createProject(),async()=>[600,600]);
 const saved=migrate(JSON.parse(JSON.stringify(p)));
 const loaded=await loadGalleryChoice(saved,saved.referenceCoverChoices[0],()=>{throw Error('Offline')},async()=>[600,600]);
 assert.equal(loaded.src,image);assert.equal(loaded.key,main);
 assert.equal(albumArtLayer(saved,'labelA').src,image);assert.equal(albumArtLayer(saved,'labelB').src,image);
});
