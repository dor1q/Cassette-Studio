import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMusicLink} from '../music-links.mjs';
import {createMusicImporter,parseApplePlaylistPage} from '../music-importer.mjs';
import {createServiceRequest} from '../music-network.mjs';

const playlistId='pl.f4d106fed2bd41149aaacabb233eb5eb';
const link={provider:'apple',type:'playlist',id:playlistId,country:'US',url:`https://music.apple.com/us/playlist/test/${playlistId}`};
const descriptor=(id=playlistId,kind='playlist')=>({kind,identifiers:{storeAdamID:id}});
const artwork=name=>({dictionary:{url:`https://is1-ssl.mzstatic.com/image/thumb/${name}/{w}x{h}bb.{f}`,width:3000,height:3000}});
const track=(title,extra={})=>({id:'track-lockup - '+playlistId+' - 123',title,artistName:'Artist',duration:187966,trackNumber:1,contentDescriptor:descriptor('123','song'),artwork:artwork('album'),...extra});
function page(tracks,{count=tracks.length,id=playlistId,headerId=id,headerArtwork=artwork('playlist'),extraSections=[],scriptAttributes='type="application/json" id="serialized-server-data"'}={}){
 const data={data:[{intent:{contentDescriptor:descriptor(id)},data:{sections:[
  {itemKind:'containerDetailHeaderLockup',items:[{title:'Playlist',trackCount:count,artwork:headerArtwork,subtitleLinks:[{title:'Curator'}],contentDescriptor:descriptor(headerId)}]},
  {itemKind:'trackLockup',containerContentDescriptor:descriptor(id),items:tracks},...extraSections,
 ]}}]};
 return `<script ${scriptAttributes}>${JSON.stringify(data)}</script>`;
}
const importer=fetchImpl=>createMusicImporter({request:createServiceRequest({fetchImpl,sleep:async()=>{}}),spotifyToken:async()=>{throw Error('Not connected')}});

test('Apple public playlist links preserve storefront and accept editorial and user IDs',()=>{
 for(const path of [`/gb/playlist/test/${playlistId}`,`/gb/playlist/${playlistId}`]){
  const result=parseMusicLink('https://music.apple.com'+path+'?l=en-GB');
  assert.equal(result.provider,'apple');assert.equal(result.type,'playlist');assert.equal(result.id,playlistId);assert.equal(result.country,'GB');
 }
 assert.equal(parseMusicLink('music.apple.com/us/playlist/ch-79/pl.u-90gLTG0Me1').id,'pl.u-90gLTG0Me1');
 assert.equal(parseMusicLink('https://music.apple.com/us/playlist/radio/pl.pm-20e9f373919da080a99321c6a079cca9').type,'playlist');
 for(const bad of ['pl.123','pl.u-a','pl.'+'a'.repeat(33),'pl.u-90gLTG0Me1/extra'])assert.throws(()=>parseMusicLink('https://music.apple.com/us/playlist/test/'+bad));
});

test('Apple public page keeps playlist order, duplicates, milliseconds and album-cover choices',()=>{
 const parsed=parseApplePlaylistPage(page([track('Second',{artistName:'B',duration:187966,artwork:artwork('different')}),track('First',{artistName:'A',duration:86520,artwork:artwork('playlist')}),track('Second',{artistName:'B',duration:187966,artwork:artwork('different')})]),link);
 assert.deepEqual(parsed.tracks.map(t=>[t.title,t.artist,t.seconds]),[['Second','B',187],['First','A',86],['Second','B',187]]);
 assert.equal(parsed.album,'Playlist');assert.equal(parsed.artist,'Curator');assert.equal(parsed.url,link.url);assert.equal(parsed.importSource,'Apple Music Public Playlist');
 assert.equal(parsed.cover,'https://is1-ssl.mzstatic.com/image/thumb/playlist/1200x1200bb.jpg');
 assert.deepEqual(parsed.coverAlternatives,['https://is1-ssl.mzstatic.com/image/thumb/playlist/600x600bb.jpg','https://is1-ssl.mzstatic.com/image/thumb/playlist/100x100bb.jpg']);
 assert.deepEqual(parsed.customPosters,[{file_path:'https://is1-ssl.mzstatic.com/image/thumb/different/600x600bb.jpg',type:'apple-thumb',label:'Second'}]);
 assert.equal(parsed.tracks[0].thumbnail,parsed.tracks[0].cover);assert.deepEqual(parsed.warnings,[]);
});

test('Apple public playlist imports all 300 page tracks and caps only unique alternative covers',()=>{
 const tracks=Array.from({length:300},(_,i)=>track('Song '+i,{artwork:artwork('album-'+i),duration:100000+i}));
 const parsed=parseApplePlaylistPage(page(tracks),link);
 assert.equal(parsed.tracks.length,300);assert.equal(parsed.tracks.at(-1).title,'Song 299');assert.equal(parsed.customPosters.length,12);
 assert.equal(parsed.customPosters.at(-1).label,'Song 11');assert.deepEqual(parsed.warnings,[]);
 assert.throws(()=>parseApplePlaylistPage(page(Array.from({length:2001},(_,i)=>track('Song '+i))),link),/2000/);
});

test('incomplete, disabled and unknown-duration records are reported without substituting songs',()=>{
 const raw=[track('Present',{isDisabled:true}),track('No duration',{duration:null}),track('',{contentDescriptor:descriptor('removed','song')}),track('Video',{contentDescriptor:descriptor('video','musicVideo')})];
 const parsed=parseApplePlaylistPage(page(raw,{count:5}),link);
 assert.deepEqual(parsed.tracks.map(t=>t.title),['Present','No duration']);assert.equal(parsed.tracks[0].unavailable,true);assert.equal(parsed.tracks[1].seconds,0);
 const warnings=parsed.warnings.join(' ');assert.match(warnings,/2 из 5/);assert.match(warnings,/неполный/);assert.match(warnings,/не заменялись/);assert.match(warnings,/без музыкальных метаданных: 2/);assert.match(warnings,/длительность/);assert.match(warnings,/воспроизведение/);
 assert.match(parseApplePlaylistPage(page([track('One')],{count:null}),link).warnings.join(' '),/Полноту/);
});

test('Apple parser binds the page to the requested playlist and excludes recommendations',()=>{
 const otherId='pl.'+'a'.repeat(32);
 assert.throws(()=>parseApplePlaylistPage(page([track('Other')],{id:otherId}),link),/публичный список/);
 assert.throws(()=>parseApplePlaylistPage(page([track('Other')],{headerId:otherId}),link),/другого плейлиста/);
 for(const html of ['<html>private playlist</html>','<script id="serialized-server-data">bad JSON</script>'])assert.throws(()=>parseApplePlaylistPage(html,link),/публичный список/);
 const parsed=parseApplePlaylistPage(page([track('One')],{extraSections:[{itemKind:'trackLockup',containerContentDescriptor:descriptor(otherId),items:[track('Recommendation')]}],scriptAttributes:"id='serialized-server-data' type='application/json'"}),link);
 assert.deepEqual(parsed.tracks.map(t=>t.title),['One']);
 assert.throws(()=>parseApplePlaylistPage(page([],{count:0}),link),/названий треков/);
});

test('Apple artwork templates cannot introduce foreign, private or executable image sources',()=>{
 for(const source of ['http://127.0.0.1/image','https://user:secret@is1-ssl.mzstatic.com/image','https://is1-ssl.mzstatic.com:9000/image','https://mzstatic.com.evil.example/image','javascript:alert(1)']){
  const parsed=parseApplePlaylistPage(page([track('One',{artwork:{dictionary:{url:source}}})],{headerArtwork:{dictionary:{url:source}}}),link);
  assert.equal(parsed.cover,'');assert.deepEqual(parsed.coverAlternatives,[]);assert.deepEqual(parsed.customPosters,[]);assert.equal(parsed.tracks[0].thumbnail,undefined);
 }
});

test('Apple importer uses public HTML only and follows the same playlist redirect without credentials',async()=>{
 const calls=[],canonical=`https://music.apple.com/us/playlist/${playlistId}`;
 const m=importer(async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
  return url===canonical?new Response(null,{status:301,headers:{location:link.url}}):new Response(page([track('One')]));
 });
 const result=await m.importLink(canonical);
 assert.deepEqual(calls,[canonical,link.url]);assert.equal(result.tracks[0].seconds,187);assert.equal(result.url,link.url);
 assert.ok(!calls.some(url=>url.includes('api.music.apple.com')||url.includes('itunes.apple.com')));
});

test('Apple public redirects reject foreign hosts, different playlists, HTTP and storefront changes before fetching',async()=>{
 for(const destination of ['https://spotify.link/another','https://127.0.0.1/private','http://music.apple.com/us/playlist/'+playlistId,'https://music.apple.com/gb/playlist/'+playlistId,'https://music.apple.com/us/playlist/pl.'+'a'.repeat(32),'https://music.apple.com/us/album/123']){
  let calls=0;const m=importer(async()=>{calls++;return new Response(null,{status:302,headers:{location:destination}})});
  await assert.rejects(m.importLink(link.url));assert.equal(calls,1);
 }
 let calls=0;const looping=importer(async()=>{calls++;return new Response(null,{status:301,headers:{location:link.url}})});
 await assert.rejects(looping.importLink(link.url),/переадресаций/);assert.equal(calls,5);
});

test('Apple albums retain per-track cover choices without replacing their main cover',async()=>{
 const rows=[{wrapperType:'collection',collectionName:'Album',artworkUrl100:'https://is1-ssl.mzstatic.com/main/100x100bb.jpg',trackCount:2},{wrapperType:'track',kind:'song',trackId:1,trackName:'Main',trackTimeMillis:120000,artworkUrl100:'https://is1-ssl.mzstatic.com/main/100x100bb.jpg'},{wrapperType:'track',kind:'song',trackId:2,trackName:'Alternate',trackTimeMillis:180000,artworkUrl100:'https://is1-ssl.mzstatic.com/alternate/100x100bb.jpg'}];
 const m=importer(async()=>new Response(JSON.stringify({results:rows})));
 const result=await m.importLink('https://music.apple.com/us/album/test/123');
 assert.equal(result.cover,'https://is1-ssl.mzstatic.com/main/1200x1200bb.jpg');assert.equal(result.tracks[1].thumbnail,'https://is1-ssl.mzstatic.com/alternate/600x600bb.jpg');
 assert.deepEqual(result.customPosters,[{file_path:'https://is1-ssl.mzstatic.com/alternate/600x600bb.jpg',type:'apple-thumb',label:'Alternate'}]);
});
