import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrackDuration,parseTracks,serializeTracks,time,total,balance,createProject,importReference,migrate,boundText} from '../src/model.js';

test('manual track text accepts hours while retaining minute-only durations and artist order',()=>{
 const tracks=parseTracks('DJ Name — Long mix (1:03:07)\nArtist — Short song (3:07)\nArtist — Live (75:09)');
 assert.deepEqual(tracks.map(({title,artist,seconds})=>({title,artist,seconds})),[
  {title:'Long mix',artist:'DJ Name',seconds:3787},{title:'Short song',artist:'Artist',seconds:187},{title:'Live',artist:'Artist',seconds:4509}
 ]);
 const imported=parseTracks('Long mix - DJ Name (1:03:07)',true)[0];
 assert.equal(imported.title,'Long mix');assert.equal(imported.artist,'DJ Name');assert.equal(imported.seconds,3787);
});

test('invalid hour minutes or seconds stay in the title and cannot produce an invalid total',()=>{
 const lines=['Bad minutes (1:63:07)','Bad seconds (1:03:67)','Short seconds (3:65)','Negative (-1:03:07)','Bad shape (1:3:07)','Huge (999999999999999999999999999999:03:07)'];
 const tracks=parseTracks(lines.join('\n'));
 assert.deepEqual(tracks.map(t=>t.title),lines);assert.ok(tracks.every(t=>t.seconds===0));assert.equal(total(tracks),0);
});

test('hour tracks preserve elapsed time when serialized and balanced between cassette sides',()=>{
 const tracks=parseTracks('One (1:00:00)\nTwo (0:30:00)\nThree (30:00)');
 const reopened=parseTracks(serializeTracks(tracks));assert.deepEqual(reopened.map(t=>t.seconds),[3600,1800,1800]);
 const [a,b]=balance(reopened);assert.equal(total(a),3600);assert.equal(total(b),3600);assert.deepEqual([...a,...b],reopened);
});

test('display uses hours from one hundred minutes and its editable text parses without changing the duration',()=>{
 for(const [seconds,display]of [[0,'0:00'],[59,'0:59'],[3600,'60:00'],[5999,'99:59'],[6000,'1:40:00'],[7205,'2:00:05']]){
  assert.equal(time(seconds),display);assert.equal(parseTrackDuration(display),seconds);
 }
 assert.equal(time(5999.9),'99:59');assert.equal(time(Infinity),'0:00');assert.equal(time(-1),'0:00');
 for(const invalid of ['1:60:00','1:40:60','-1:00','NaN','Infinity','1:4:00',''])assert.equal(parseTrackDuration(invalid),null);
 const project=createProject();project.data.A=parseTracks('Artist — Extended mix (2:00:05)');
 const serialized=serializeTracks(project.data.A);assert.equal(serialized,'Artist — Extended mix (2:00:05)');
 const restored=migrate(JSON.parse(JSON.stringify(project)));assert.equal(restored.data.A[0].seconds,7205);
 assert.match(boundText(restored,{source:'tracks'},'labelA'),/Extended mix \(2:00:05\)/);
 assert.equal(parseTracks(serialized)[0].seconds,7205);
});

test('public J-card and cassette links import hour durations on both sides and preserve them after saving',()=>{
 for(const mode of ['jcard','cassette']){
  const project=createProject(),params=new URLSearchParams({musicA:'Long mix - DJ (1:03:07)|Short (3:07)',musicB:'Live - Artist (0:45:20)'});
  importReference(project,'https://vhs.texs.org/en/'+mode+'?'+params);
  assert.equal(project.data.A[0].title,'Long mix');assert.equal(project.data.A[0].artist,'DJ');assert.equal(total(project.data.A),3974);assert.equal(total(project.data.B),2720);
  const saved=migrate(JSON.parse(JSON.stringify(project)));assert.equal(saved.data.A[0].seconds,3787);assert.equal(saved.data.B[0].seconds,2720);
  assert.match(boundText(saved,{source:'tracks'},'labelA'),/Long mix — DJ \(63:07\)/);
 }
});
