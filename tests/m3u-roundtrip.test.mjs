import test from 'node:test';
import assert from 'node:assert/strict';
import {parseM3U,serializeM3U} from '../src/m3u.js';
import {createProject,migrate} from '../src/model.js';

test('M3U preserves artist, ambiguous titles, duration and original paths through export and JSON',()=>{
 const tracks=[{title:'Song — Remix',artist:'A - B',seconds:120,sourcePath:'../Музыка/01 Song.flac'},{title:'Intro - Live',artist:'',seconds:0,sourcePath:'https://example.com/music/live.mp3'}];
 const parsed=parseM3U(serializeM3U(tracks));
 for(let i=0;i<tracks.length;i++)for(const key of ['title','artist','seconds','sourcePath'])assert.equal(parsed[i][key],tracks[i][key]);
 const project=createProject();project.data.A=parsed;project.data.B=[];
 const reopened=migrate(JSON.parse(JSON.stringify(project)));
 assert.equal(reopened.data.A[0].sourcePath,tracks[0].sourcePath);
 assert.equal(reopened.data.A[1].sourcePath,tracks[1].sourcePath);
});

test('ordinary EXTINF artist-title metadata and unlabelled paths are imported',()=>{
 const tracks=parseM3U('\uFEFF#EXTM3U\n#EXTINF:201,Кино — Пачка сигарет\nfolder/01.flac\nfolder/unknown.flac\n#EXTINF:-1,Outro\nlast.mp3');
 assert.equal(tracks.length,3);assert.equal(tracks[0].artist,'Кино');assert.equal(tracks[0].title,'Пачка сигарет');
 assert.equal(tracks[0].sourcePath,'folder/01.flac');assert.equal(tracks[1].title,'unknown');assert.equal(tracks[2].seconds,0);
});

test('M3U export cannot add playlist directives through a multiline field',()=>{
 const text=serializeM3U([{title:'Title\n#EXTINF:9,Injected',artist:'Artist\r\nMore',seconds:10,sourcePath:'file.mp3\nother.mp3'}]);
 assert.equal((text.match(/^#EXTINF:/gm)||[]).length,1);
 assert.equal(parseM3U(text).length,1);
});
