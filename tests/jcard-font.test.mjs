import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,clone,validateProject,parseTracks,time} from '../src/model.js';
import {jcardSpineFontScale,jcardTrackMetric,jcardFlapFontScale,referenceJCardFontPreset,syncReferenceJCardFonts,referenceJCardFontState,enableReferenceJCardAutoFont} from '../src/jcard-font.js';
import {duplicateSelection} from '../src/selection-edit.js';
import {renderSvg} from '../src/render.js';

const unit=25.4/600,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const reference=params=>'https://vhs.texs.org/en/jcard?'+new URLSearchParams(params);
const imported=params=>importReference(createProject(),reference({musicArtist:'Artist',musicAlbum:'Album',musicA:'Track (1:00)',color:'112233',...params}));
const spine=p=>p.surfaces.outer.find(layer=>layer.source==='spine'&&layer.referenceSpine&&!layer.standardBlockCopy);
const flap=p=>p.surfaces.outer.find(layer=>layer.source==='flapTracks'&&!layer.standardBlockCopy);
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const named=(title,artist='',seconds=0)=>({title,artist,seconds});

test('J-card spine auto percentages match public boundaries and rounded interpolation',()=>{
 for(const [length,expected]of [[0,150],[6,150],[7,148],[13,133],[20,115],[21,113],[27,101],[35,85],[36,84],[49,71],[50,70],[200,70]])assert.equal(jcardSpineFontScale('x'.repeat(length)),expected,`length ${length}`);
 assert.equal(jcardSpineFontScale('😀'.repeat(10)),115);
 assert.equal(jcardSpineFontScale('x'.repeat(200),150),150);
 assert.equal(jcardSpineFontScale('x'.repeat(200),100),70);
});

test('J-card flap auto percentages measure both full lists at 122, 264 and 593 characters',()=>{
 for(const [length,expected]of [[0,100],[122,100],[123,100],[126,99],[193,90],[264,80],[265,80],[429,70],[592,61],[593,61],[900,61]])assert.equal(jcardFlapFontScale({A:[named('x'.repeat(length))],B:[]}),expected,`length ${length}`);
 assert.equal(jcardFlapFontScale({A:[named('x'.repeat(130))],B:[named('x'.repeat(134))]}),80);
 assert.equal(jcardFlapFontScale({A:[named('x'.repeat(900))],B:[]},125),125);
});

test('flap metric keeps complete metadata and canonical durations independent of display flags',()=>{
 const tracks=parseTracks('Zero (0:00)|Leading - Artist (03:07)|Hour (1:00:00)'.replaceAll('|','\n'),true);
 assert.equal(jcardTrackMetric(tracks),'Zero\nLeading - Artist (3:07)\nHour (60:00)');
 assert.equal(time(6000),'1:40:00');
 assert.equal(jcardTrackMetric([named('Name','Artist',6000)]),'Name - Artist (1:40:00)');
 const p=imported({musicA:'x'.repeat(122)+' - Artist (03:07)',tf:'f',jh:'10'}),layer=flap(p),scale=layer.referenceJCardFontScale;
 assert.ok(scale<100);assert.equal(layer.trackOptions.artists,false);assert.equal(layer.trackOptions.durations,false);
 p.settings.artists=true;p.settings.durations=true;layer.trackOptions.artists=true;layer.trackOptions.durations=true;syncReferenceJCardFonts(p);
 assert.equal(layer.referenceJCardFontScale,scale);
});

test('94px spine size rounds after width scaling and the 44px flap is independent of flap width',()=>{
 const p=imported({playlistUrl:'https://open.spotify.com/album/example',musicAlbum:'x'.repeat(20)}),s=spine(p),f=flap(p);
 near(s.size,108*unit);near(f.size,44*unit);
 p.layout.spine=300*unit*1.5;p.layout.flap=50;syncReferenceJCardFonts(p);
 near(s.size,162*unit);near(f.size,44*unit);
 const dataOnly=imported({musicArtist:'Artist',musicAlbum:'Album'});assert.equal(spine(dataOnly).referenceJCardFontScale,jcardSpineFontScale('Artist Album'));
});

test('playlist font metric uses only the original URL source flag and remains independent of two-line display',()=>{
 const main={musicArtist:'Artist',musicAlbum:'x'.repeat(20)},album=imported({...main,id:'sa.album',source:'spotify-album'}),playlist=imported({...main,playlistUrl:'https://open.spotify.com/album/example'}),sourcePlaylist=imported({...main,source:'spotify'});
 assert.equal(spine(album).referenceJCardFontScale,jcardSpineFontScale('Artist '+main.musicAlbum));assert.equal(spine(playlist).referenceJCardFontScale,115);assert.equal(spine(sourcePlaylist).referenceJCardFontScale,115);
 album.data.url='https://open.spotify.com/album/example';album.referenceMusicMetadataSource={kind:'spotify-album'};syncReferenceJCardFonts(album);assert.equal(spine(album).referenceJCardFontScale,jcardSpineFontScale('Artist '+main.musicAlbum));
 spine(playlist).spineTwoLines=true;spine(playlist).hideAlbum=true;syncReferenceJCardFonts(playlist);assert.equal(spine(playlist).referenceJCardFontScale,115);
});

test('font URL 100 enables auto while explicit other percentages retain family and effects',()=>{
 const p=imported({musicArtist:'',musicAlbum:'x'.repeat(50),musicA:'x'.repeat(593),f2:'~Georgia.2s.7.2s.4',fb:'~Arial.3h.4.2s.0'});
 assert.equal(spine(p).referenceJCardRequestedFontScale,100);assert.equal(spine(p).referenceJCardFontScale,70);near(spine(p).size,66*unit);
 assert.equal(spine(p).font,'Georgia');assert.equal(spine(p).fontWeight,700);assert.equal(spine(p).italic,true);
 assert.equal(flap(p).referenceJCardRequestedFontScale,125);assert.equal(flap(p).referenceJCardFontScale,125);near(flap(p).size,55*unit);
 const fixed=referenceJCardFontPreset(p,new URLSearchParams({f2:'~Georgia.2i.4.2s.0'}),'spine');assert.equal(fixed.state.referenceJCardRequestedFontScale,90);near(fixed.style.size,85*unit);
});

test('artist and independent album fonts follow separate auto, explicit and manually edited snapshots',()=>{
 const p=imported({musicArtist:'',musicAlbum:'Small',f3:'~Georgia.3h.4.2s.0'}),s=spine(p);
 near(s.size,141*unit);near(s.albumStyle.size,118*unit);assert.equal(s.albumStyle.font,'Georgia');
 s.albumStyle.size=3;s.albumStyle.italic=true;const album=clone(s.albumStyle);p.data.album='x'.repeat(50);syncReferenceJCardFonts(p);
 near(s.size,66*unit);assert.deepEqual(s.albumStyle,album);assert.equal(referenceJCardFontState(p,s,{album:true}).automatic,false);
 const size=s.size;assert.equal(enableReferenceJCardAutoFont(p,s,{album:true}).applied,true);near(s.albumStyle.size,66*unit);near(s.size,size);assert.equal(s.albumStyle.italic,true);
 s.size=4;const manual=clone(s);p.data.album='Short';syncReferenceJCardFonts(p);near(s.size,manual.size);near(s.albumStyle.size,141*unit);
});

test('dynamic auto sizes preserve manual geometry, lock, copies and free-place blocks',()=>{
 const p=imported({musicArtist:'',musicAlbum:'Small'}),s=spine(p),f=flap(p);s.x+=2;s.y+=1;s.font='Georgia';s.spacing=.2;s.color='#ff0000';const storedFrame=frame(s);
 const [copy]=duplicateSelection(p,s,'outer',{joined:false});p.surfaces.outer.push(copy);const manualCopy=clone(copy);
 f.locked=true;const locked=clone(f);const free={...clone(s),id:'free-place',referenceBlock:true};p.surfaces.outer.push(free);const storedFree=clone(free);
 p.data.album='x'.repeat(50);p.data.A=[named('x'.repeat(593))];syncReferenceJCardFonts(p);
 near(s.size,66*unit);assert.deepEqual(frame(s),storedFrame);assert.equal(s.font,'Georgia');assert.equal(s.spacing,.2);assert.equal(s.color,'#ff0000');
 assert.deepEqual(f,locked);assert.deepEqual(copy,manualCopy);assert.deepEqual(free,storedFree);
 s.size=4;const manual=clone(s);p.data.album='Small';syncReferenceJCardFonts(p);assert.deepEqual(s,manual);
});

test('legacy 2.4.5 projects keep stored sizes on reopen and offer an explicit restore action',()=>{
 const p=imported({musicArtist:'',musicAlbum:'Small',f3:'~Georgia.2s.4.2s.0'}),s=spine(p),f=flap(p);
 for(const layer of [s,f])for(const key of Object.keys(layer))if(key.startsWith('referenceJCard'))delete layer[key];
 s.size=3;s.albumStyle.size=2;f.size=1.7;const saved=validateProject(JSON.parse(JSON.stringify(p))),old=clone(saved);
 assert.deepEqual(syncReferenceJCardFonts(saved),{updated:0,preserved:3});assert.deepEqual(saved,old);
 assert.equal(referenceJCardFontState(saved,spine(saved)).automatic,false);
 assert.equal(enableReferenceJCardAutoFont(saved,spine(saved)).applied,true);near(spine(saved).size,141*unit);near(spine(saved).albumStyle.size,2);near(flap(saved).size,1.7);
 assert.equal(enableReferenceJCardAutoFont(saved,spine(saved),{album:true}).applied,true);near(spine(saved).albumStyle.size,141*unit);
});

test('restore action rejects locked, copied, free-place and generic layers without mutation',()=>{
 const p=imported({f3:'~Georgia.2s.4.2s.0'}),s=spine(p);s.locked=true;let before=JSON.stringify(p);
 assert.deepEqual(enableReferenceJCardAutoFont(p,s),{applied:false,reason:'locked'});assert.deepEqual(enableReferenceJCardAutoFont(p,s,{album:true}),{applied:false,reason:'locked'});assert.equal(JSON.stringify(p),before);
 s.locked=false;const [copy]=duplicateSelection(p,s,'outer',{joined:false});p.surfaces.outer.push(copy);before=JSON.stringify(p);
 assert.deepEqual(enableReferenceJCardAutoFont(p,copy),{applied:false,reason:'unsupported'});assert.equal(JSON.stringify(p),before);
 s.referenceBlock=true;before=JSON.stringify(p);assert.deepEqual(enableReferenceJCardAutoFont(p,s),{applied:false,reason:'unsupported'});assert.equal(JSON.stringify(p),before);
 const generic=createProject(),stored=JSON.stringify(generic);assert.deepEqual(syncReferenceJCardFonts(generic),{updated:0,preserved:0});assert.equal(JSON.stringify(generic),stored);
});

test('saved requested sizes remain dynamic after reopen and SVG export reads the computed millimetres',()=>{
 const p=validateProject(imported({musicArtist:'',musicAlbum:'Small',f3:'~Georgia.2s.4.2s.0'}));p.data.album='x'.repeat(50);syncReferenceJCardFonts(p);
 near(spine(p).size,66*unit);near(spine(p).albumStyle.size,66*unit);const before=JSON.stringify(p),svg=renderSvg(p,'outer',{guides:false}).svg;
 assert.match(svg,new RegExp('font-size="'+spine(p).size.toFixed(3).replace('.','\\.')+'"'));assert.equal(JSON.stringify(p),before);
});

test('short-flap production follows the track scale while manual and locked production keeps its own size',()=>{
 const p=imported({sb:'1',jh:'w',musicProd:'Credits'}),f=flap(p),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);near(production.size,f.size*.85);
 p.data.A=[named('x'.repeat(593))];syncReferenceJCardFonts(p);near(f.size,27*unit);near(production.size,f.size*.85);
 production.size=2;const manual=clone(production);p.data.A=[named('Small')];syncReferenceJCardFonts(p);assert.deepEqual(production,manual);
 production.referenceJCardFlapProductionSize=2;production.locked=true;const locked=clone(production);p.data.A=[named('x'.repeat(593))];syncReferenceJCardFonts(p);assert.deepEqual(production,locked);
});
