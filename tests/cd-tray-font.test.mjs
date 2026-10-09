import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,clone,validateProject,boundText,parseTracks} from '../src/model.js';
import {referenceCDTrayFontScale,referenceCDTrayFontStyle,referenceCDTrayTrackDuration,syncReferenceCDTrayFonts,enableReferenceCDTrayAutoFont} from '../src/cd-tray-font.js';
import {restoreReferenceMusicMetadata} from '../src/reference-music.js';
import {restoreReferenceSideMusic} from '../src/reference-side-music.js';
import {importMusicData} from '../src/music-import.js';
import {editCDTrack} from '../src/cd-track-editing.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {duplicateSelection} from '../src/selection-edit.js';
import {renderSvg} from '../src/render.js';

const unit=25.4/600,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const reference=params=>'https://vhs.texs.org/en/cd-tray?'+new URLSearchParams(params);
const imported=params=>importReference(createProject(),reference({musicA:'Track (1:00)',color:'112233',...params}));
const layers=p=>p.surfaces.cdTray.filter(layer=>layer.source==='cdTracks'&&layer.referenceCDTrayTrack&&!layer.referenceBlockCopy);
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const named=(title,artist='',seconds=0)=>({title,artist,seconds});

test('tray automatic percentages match original boundaries and rounded interpolation',()=>{
 for(const [length,expected]of [[1,100],[200,100],[206,100],[207,99],[350,88],[500,75],[501,75],[850,63],[1199,50],[1200,50],[2000,50]])assert.equal(referenceCDTrayFontScale({A:[named('x'.repeat(length))],B:[]}),expected,`length ${length}`);
 assert.equal(referenceCDTrayFontScale({A:[],B:[]}),75);
 assert.equal(referenceCDTrayFontScale({A:[named('x'.repeat(2000))],B:[]},90),90);
});

test('provider duration uses original minutes through 99 and switches to hours at 100 minutes',()=>{
 assert.equal(referenceCDTrayTrackDuration(named('Long','',3600)),'60:00');assert.equal(referenceCDTrayTrackDuration(named('Long','',5999)),'99:59');assert.equal(referenceCDTrayTrackDuration(named('Long','',6000)),'1:40:00');
 assert.equal(referenceCDTrayTrackDuration({...named('Raw','',3600),referenceDuration:'1:00:00',referenceDurationSeconds:3600}),'1:00:00');
});

test('metric counts artists and written durations regardless of display flags, side concatenation and UTF-16 characters',()=>{
 const data={A:[named('x'.repeat(100)),named('x'.repeat(99))],B:[named('x'.repeat(6))]};
 assert.equal(referenceCDTrayFontScale(data),100);data.B[0].artist='a';assert.equal(referenceCDTrayFontScale(data),99);
 assert.equal(referenceCDTrayFontScale({A:[named('😀'.repeat(104))],B:[]}),99);
 const p=imported({musicA:'x'.repeat(199)+' - Artist (03:07)',ts:'f',cdh:'4',musicProd:'z'.repeat(1000)}),track=layers(p)[0];
 assert.equal(track.referenceCDTrayFontScale,99);assert.equal(track.visible,true);assert.equal(track.trackOptions.hideTracks,true);
 const scale=track.referenceCDTrayFontScale;p.settings.artists=true;p.settings.durations=true;p.settings.numbers=true;p.data.production='';syncReferenceCDTrayFonts(p);assert.equal(track.referenceCDTrayFontScale,scale);
});

test('fb absolute percentage keeps explicit 100 fixed and explicit 75 automatic without changing family or effects',()=>{
 const data={A:[named('x'.repeat(850))],B:[]};
 const fixed=referenceCDTrayFontStyle(new URLSearchParams({fb:'~Georgia.2s.7.2s.4'}),data),automatic=referenceCDTrayFontStyle(new URLSearchParams({fb:'~Georgia.23.7.2s.4'}),data);
 assert.equal(fixed.referenceCDTrayRequestedFontScale,100);assert.equal(fixed.referenceCDTrayFontScale,100);near(fixed.size,72*unit);
 assert.equal(automatic.referenceCDTrayRequestedFontScale,75);assert.equal(automatic.referenceCDTrayFontScale,63);near(automatic.size,45*unit);
 assert.equal(automatic.font,'Georgia');assert.equal(automatic.fontWeight,700);assert.equal(automatic.italic,true);
});

test('raw URL tracks keep zero, leading-zero, hour and invalid-written duration metrics through project reopening',()=>{
 const p=imported({musicA:'Zero (0:00)|Leading - Artist (03:07)|Hour (1:00:00)|Written (1:99)'});
 assert.deepEqual(p.data.A.map(track=>[track.title,track.seconds,referenceCDTrayTrackDuration(track)]),[['Zero',0,'0:00'],['Leading',187,'03:07'],['Hour',3600,'1:00:00'],['Written',0,'1:99']]);
 const saved=validateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.data.A.map(referenceCDTrayTrackDuration),['0:00','03:07','1:00:00','1:99']);
 const malformed=clone(p);malformed.data.A[0].referenceDuration='<script>';malformed.data.A[1].referenceDurationSeconds='187';
 const sanitized=validateProject(malformed);assert.equal(sanitized.data.A[0].referenceDuration,undefined);assert.equal(sanitized.data.A[1].referenceDuration,undefined);
 assert.ok(editCDTrack(saved,1,'seconds','4:01'));assert.equal(referenceCDTrayTrackDuration(saved.data.A[1]),'4:01');
 assert.equal(parseTracks('Zero (0:00)',true)[0].referenceDuration,undefined);
});

test('short raw URL lists resize text and native frame immediately while the empty list uses default 75',()=>{
 const p=imported({musicProd:'Credits'}),layer=layers(p)[0];near(layer.size,72*unit);near(layer.y,279*unit);assert.deepEqual(frame(layer),layer.referenceCDTrayTrackFrame);assert.equal(layer.autoFit,false);
 const empty=imported({musicA:'',musicB:''}),emptyLayer=layers(empty)[0];near(emptyLayer.size,54*unit);near(emptyLayer.y,167*unit);
 const before=JSON.stringify(p),rendered=renderSvg(p,'cdTray',{guides:false});assert.ok(rendered.svg.includes('Track'));assert.equal(JSON.stringify(p),before);
});

test('late provider metadata and cached rehydration recalculate real current tracks and typography',async()=>{
 const url=new URL(reference({id:'sa.5SknXhmjHijD0uU1Pm2HBr'})),p=createProject();importReference(p,url.href);const original=layers(p)[0];near(original.size,54*unit);
 const album={artist:'Artist',album:'Album',tracks:[named('x'.repeat(850),'',0)]};
 await restoreReferenceMusicMetadata(p,url,async()=>album);assert.equal(original.referenceCDTrayFontScale,63);near(original.size,45*unit);assert.deepEqual(frame(original),original.referenceCDTrayTrackFrame);
 const cached=validateProject(p),next=createProject();importReference(next,url.href);await restoreReferenceMusicMetadata(next,url,async()=>{throw Error('Unexpected network')},cached);assert.equal(layers(next)[0].referenceCDTrayFontScale,63);
 const rawURL=new URL(reference({id:'sa.5SknXhmjHijD0uU1Pm2HBr',musicA:'Manual (1:00)'})),raw=createProject();importReference(raw,rawURL.href);await restoreReferenceMusicMetadata(raw,rawURL,async()=>album);assert.equal(layers(raw)[0].referenceCDTrayFontScale,100);assert.equal(raw.data.A[0].title,'Manual');
});

test('raw main A receives only an absent matching artist from metadata without losing its written duration',async()=>{
 const title='x'.repeat(199),url=new URL(reference({id:'sa.5SknXhmjHijD0uU1Pm2HBr',musicA:title+' (03:07)|Explicit - Override (0:00)',musicB:title+' (1:00)'})),p=createProject();importReference(p,url.href);
 await restoreReferenceMusicMetadata(p,url,async()=>({tracks:[named(title,'a'.repeat(50),187),named('Explicit','Service',90)]}));
 assert.equal(p.data.A[0].artist,'a'.repeat(50));assert.equal(referenceCDTrayTrackDuration(p.data.A[0]),'03:07');assert.equal(p.data.A[1].artist,'Override');assert.equal(referenceCDTrayTrackDuration(p.data.A[1]),'0:00');assert.equal(p.data.B[0].artist,'');
 assert.ok(layers(p)[0].referenceCDTrayFontScale<100);const saved=validateProject(p);assert.equal(saved.data.A[0].artist,p.data.A[0].artist);assert.equal(layers(saved)[0].referenceCDTrayFontScale,layers(p)[0].referenceCDTrayFontScale);
});

test('per-side restore and design-preserving service import stay dynamic while a fresh generic import stays generic',async()=>{
 const url=new URL(reference({sbi:'spotify-album:5SknXhmjHijD0uU1Pm2HBr'})),p=createProject();importReference(p,url.href);
 await restoreReferenceSideMusic(p,url.searchParams,async()=>({tracks:[named('x'.repeat(950),'a'.repeat(250))]}));syncReferenceCDTrayFonts(p);assert.equal(layers(p)[0].referenceCDTrayFontScale,50);
 const layer=layers(p)[0],id=layer.id;p.settings.lockDesign=true;importMusicData(p,{tracks:[named('Small')]});syncReferenceCDTrayFonts(p);assert.equal(layers(p)[0].id,id);assert.equal(layer.referenceCDTrayFontScale,100);
 p.settings.lockDesign=false;importMusicData(p,{tracks:[named('Small')]});const before=JSON.stringify(p);assert.equal(layers(p).length,0);assert.deepEqual(syncReferenceCDTrayFonts(p),{updated:0,preserved:0});assert.equal(JSON.stringify(p),before);
});

test('font synchronization preserves manual size, manual geometry, locked columns, other typography and old unknown profiles',()=>{
 const p=imported({dc:'1'}),[first,second]=layers(p);first.font='Georgia';first.color='#ff0000';first.italic=true;first.x+=3;const manualFrame=frame(first);
 second.locked=true;const locked=clone(second);p.data.A=[named('x'.repeat(1200))];syncReferenceCDTrayFonts(p);assert.equal(first.referenceCDTrayFontScale,50);assert.deepEqual(frame(first),manualFrame);assert.equal(first.font,'Georgia');assert.equal(first.color,'#ff0000');assert.equal(first.italic,true);assert.deepEqual(second,locked);
 first.size=4;const manual=clone(first);p.data.A=[named('Short')];syncReferenceCDTrayFonts(p);assert.deepEqual(first,manual);
 second.locked=false;for(const key of ['referenceCDTrayRequestedFontScale','referenceCDTrayFontScale','referenceCDTrayFontSize'])delete second[key];const legacy=clone(second);syncReferenceCDTrayFonts(p);assert.deepEqual(second,legacy);
 p.editorMode='jcard';const stored=JSON.stringify(p);assert.deepEqual(syncReferenceCDTrayFonts(p),{updated:0,preserved:0});assert.equal(JSON.stringify(p),stored);
});

test('latent columns inherit font provenance and update without absorbing manual copies',()=>{
 const p=imported({musicA:'x'.repeat(850)}),first=layers(p)[0],previous=clone(p.layout);p.layout.columns=2;updateCDLayout(p,'cd-tray',previous);const second=layers(p)[1];assert.equal(second.referenceCDTrayRequestedFontScale,75);assert.equal(second.referenceCDTrayFontScale,63);
 const [copy]=duplicateSelection(p,second,'cdTray',{joined:false});p.surfaces.cdTray.push(copy);const manual=clone(copy);const before=clone(p.layout);p.layout.columns=1;updateCDLayout(p,'cd-tray',before);
 p.data.A=[named('Short')];syncReferenceCDTrayFonts(p);assert.equal(first.referenceCDTrayFontScale,100);assert.equal(second.referenceCDTrayFontScale,100);assert.deepEqual(copy,manual);
});

test('restore-auto action includes inactive peers and rejects locked or independent blocks without mutation',()=>{
 const p=imported({dc:'1',fb:'~Arial.2s.4.2s.0'}),[first,second]=layers(p);first.size=4;first.x+=2;const manualFrame=frame(first);const old=clone(p.layout);p.layout.columns=1;updateCDLayout(p,'cd-tray',old);
 second.locked=true;let before=JSON.stringify(p);assert.deepEqual(enableReferenceCDTrayAutoFont(p,first),{applied:false,reason:'locked'});assert.equal(JSON.stringify(p),before);
 second.locked=false;assert.equal(enableReferenceCDTrayAutoFont(p,first).applied,true);assert.equal(first.referenceCDTrayRequestedFontScale,75);assert.equal(second.referenceCDTrayRequestedFontScale,75);near(first.size,72*unit);assert.deepEqual(frame(first),manualFrame);
 const [copy]=duplicateSelection(p,first,'cdTray',{joined:false});p.surfaces.cdTray.push(copy);before=JSON.stringify(p);assert.deepEqual(enableReferenceCDTrayAutoFont(p,copy),{applied:false,reason:'unsupported'});assert.equal(JSON.stringify(p),before);
});

test('tray cdh track flag hides both side lists while preserving credits and ignored bit8 keeps both lists visible',()=>{
 const p=imported({musicA:'ATOKEN',musicB:'BTOKEN',musicProd:'CREDITSTOKEN',cdh:'4'}),layer=layers(p)[0];
 assert.equal(layer.visible,true);assert.equal(boundText(p,layer,'cdTray'),'CREDITSTOKEN');assert.ok(renderSvg(p,'cdTray',{guides:false}).svg.includes('CREDITSTOKEN'));
 const visible=imported({musicA:'ATOKEN',musicB:'BTOKEN',musicProd:'CREDITSTOKEN',cdh:'8'});assert.match(boundText(visible,layers(visible)[0],'cdTray'),/ATOKEN.*BTOKEN.*CREDITSTOKEN/s);
});
