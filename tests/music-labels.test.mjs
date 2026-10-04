import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createMusicImporter,parseSpotifyEmbed} from '../music-importer.mjs';
import {startStudioServer} from '../server.mjs';
const id='5SknXhmjHijD0uU1Pm2HBr',response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const make=fetchImpl=>createMusicImporter({request:fetchImpl,spotifyToken:async()=> 'token',youtubeKey:()=>'',musicbrainzRequest:async()=>({}),musicbrainzAlbum:async()=>({})});

test('Spotify API album label and Deezer label are retained independently of note',async()=>{
 const spotify=make(async()=>response({type:'album',name:'Album',label:'Columbia Records',artists:[{name:'Artist'}],tracks:{items:[{type:'track',name:'Track',duration_ms:60000}]}}));
 const a=await spotify.importLink('spotify:album:'+id);assert.deepEqual(a.recordLabels,['Columbia Records']);assert.equal(a.recordLabelSource,'Spotify API');
 const deezer=make(async()=>response({title:'Album',label:'Polydor',release_date:'2008-01-01',tracks:{data:[{title:'Track',duration:60}]}}));
 const d=await deezer.importLink('https://www.deezer.com/album/123');assert.deepEqual(d.recordLabels,['Polydor']);assert.equal(d.recordLabelSource,'Deezer');assert.equal(d.note,'2008-01-01 · Polydor');
});

test('public Spotify and Apple import never turn artist or copyright into a record label',async()=>{
 const entity={uri:'spotify:album:'+id,title:'Album',subtitle:'Taylor Swift',copyrights:[{text:'Republic Records'}],trackList:[{title:'Track',duration:60000}]};
 const html='<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{state:{data:{entity}}}}})+'</script>';
 const spotify=parseSpotifyEmbed(html,{type:'album',id,url:'https://open.spotify.com/album/'+id});assert.deepEqual(spotify.recordLabels,[]);assert.equal(spotify.recordLabelSource,'');
 const apple=make(async()=>response({results:[{wrapperType:'collection',collectionName:'Album',artistName:'Taylor Swift',copyright:'© Republic Records'},{wrapperType:'track',kind:'song',trackId:1,trackName:'Track',trackTimeMillis:60000}]}));
 const a=await apple.importLink('https://music.apple.com/us/album/example/123');assert.deepEqual(a.recordLabels,[]);assert.equal(a.note,'© Republic Records');
});

test('playlists do not borrow the label from their owner or an arbitrary first track',async()=>{
 const spotify=make(async()=>response({name:'Playlist',label:'Republic Records',owner:{display_name:'Columbia Records'},items:{items:[{track:{type:'track',name:'Track',album:{label:'Island Records'}}}]}}));
 const s=await spotify.importLink('spotify:playlist:'+id);assert.deepEqual(s.recordLabels,[]);
 const deezer=make(async()=>response({title:'Playlist',label:'Atlantic Records',creator:{name:'Artist'},tracks:{data:[{title:'Track',album:{label:'Warner Records'}}]}}));
 const d=await deezer.importLink('https://www.deezer.com/playlist/123');assert.deepEqual(d.recordLabels,[]);
});

test('MusicBrainz public release endpoint retains all actual label names without no-label entries',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cassette-label-metadata-'));let server;
 try{
  server=await startStudioServer({port:0,configDir:dir,useEnvironment:false,fetchImpl:async url=>{assert.match(String(url),/musicbrainz\.org\/ws\/2\/release\//);return response({title:'Album','artist-credit':[{name:'Artist'}],'label-info':[{label:{name:'Republic Records'}},{label:{name:'Island Records'}},{label:{name:'[no label]'}}],media:[{tracks:[{title:'Track',length:60000}]}]})}});
  const result=await fetch(server.origin+'/api/album?provider=musicbrainz&id=01234567-89ab-cdef-0123-456789abcdef').then(r=>r.json());assert.deepEqual(result.recordLabels,['Republic Records','Island Records']);assert.equal(result.recordLabelSource,'MusicBrainz');assert.equal(result.tracks.length,1);
 }finally{await server?.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'cassette-label-metadata-'));await rm(dir,{recursive:true,force:true})}
});
