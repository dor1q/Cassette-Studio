import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceMusicUrl,restoreReferenceMusicArtwork} from '../src/reference-music.js';
import {createProject} from '../src/model.js';
import {albumArtLayer,referenceArtworkKey} from '../src/album-art.js';

test('original project links restore artwork through the shared importer for every supported service',async()=>{
 const links=['https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr','https://open.spotify.com/track/5SknXhmjHijD0uU1Pm2HBr','https://open.spotify.com/playlist/5SknXhmjHijD0uU1Pm2HBr','https://music.apple.com/us/album/example/1504111352','https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://music.youtube.com/playlist?list=PL1234567890123','https://www.deezer.com/album/12345','https://www.deezer.com/playlist/12345'];
 for(const musicUrl of links){
  const p=createProject(),reference=new URL('https://vhs.texs.org/en/cassette');reference.searchParams.set('playlistUrl',musicUrl);
  const calls=[];const artwork='data:image/png;base64,aGVsbG8=';
  const request=async path=>{calls.push(path);return path.startsWith('/api/import?')?{cover:'https://example.com/public-cover.jpg',url:musicUrl}:{src:artwork}};
  const result=await restoreReferenceMusicArtwork(p,reference,request,'label',createProject(),async()=>({w:600,h:600}));
  assert.equal(result.restored,1);assert.match(calls[0],/^\/api\/import\?url=/);assert.equal(calls.length,2);
  assert.equal(albumArtLayer(p,'labelA').src,artwork);assert.equal(albumArtLayer(p,'labelB').src,artwork);
 }
});

test('reference IDs and source metadata work when a playlist URL is absent',()=>{
 const id='5SknXhmjHijD0uU1Pm2HBr';
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'sa.'+id})),'https://open.spotify.com/album/'+id);
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'st.'+id})),'https://open.spotify.com/track/'+id);
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'sp.'+id})),'https://open.spotify.com/playlist/'+id);
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'a.1504111352'})),'https://music.apple.com/us/album/id1504111352');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'12345',source:'deezer-track'})),'https://www.deezer.com/track/12345');
 assert.equal(referenceMusicUrl(new URLSearchParams({id:'dQw4w9WgXcQ',source:'youtube-track'})),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(referenceMusicUrl(new URLSearchParams({playlistUrl:'http://127.0.0.1/private'})),'');
});

test('hidden artwork never contacts the service and cached artwork avoids repeated downloads',async()=>{
 const p=createProject(),url=new URL('https://vhs.texs.org/en/jcard?id=a.1504111352&mp=_');
 const request=()=>{throw Error('Unexpected network request')};
 assert.equal((await restoreReferenceMusicArtwork(p,url,request)).restored,0);
 url.searchParams.delete('mp');p.referenceArtworkSource=referenceArtworkKey(url);p.uploads.push({category:'albumCover',src:'data:image/png;base64,aGVsbG8='});
 assert.equal((await restoreReferenceMusicArtwork(p,url,request,'jcard',p,async()=>({w:600,h:600}))).restored,1);
 assert.equal(albumArtLayer(p,'outer').src,p.uploads[0].src);
});
