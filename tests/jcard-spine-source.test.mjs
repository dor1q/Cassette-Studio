import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,boundText,migrate} from '../src/model.js';
import {referenceJCardSpineMetric,referenceJCardSpineText} from '../src/jcard-spine.js';
import {jcardSpineFontScale,syncReferenceJCardFonts} from '../src/jcard-font.js';
import {REFERENCE_UNIT} from '../src/reference-format.js';
import {textLayout,renderSvg} from '../src/render.js';

const imported=(params={},project=createProject(),mode='jcard')=>importReference(project,'https://vhs.texs.org/en/'+mode+'?'+new URLSearchParams({musicArtist:'*Artist*',musicAlbum:'# **Album**',musicA:'Track (2:00)',...params}));
const spine=project=>project.surfaces.outer.find(layer=>layer.referenceSpine);

test('J-card playlist-style source names select an album-only spine without guessing from album IDs',()=>{
 for(const [params,playlist]of [
  [{},false],[{id:'sa.5SknXhmjHijD0uU1Pm2HBr',source:'spotify-album'},false],
  [{id:'sp.example',source:'spotify'},true],[{source:'youtube'},true],
  [{source:'spotify-playlist'},false],[{source:'youtube-playlist'},false],
  [{source:'Spotify'},false],[{playlistUrl:''},false],
  [{playlistUrl:'https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr',source:'spotify-album'},true]
 ]){
  const p=imported(params),layer=spine(p),expected=playlist?'# **Album**':'*Artist* # **Album**';
  assert.equal(p.referenceJCardPlaylistSpine,playlist);assert.equal(boundText(p,layer,'outer'),expected);
  assert.equal(referenceJCardSpineMetric(p),expected);
  // Restoring cover-gallery metadata alone must not turn an album into a playlist.
  p.referenceMusicMetadataSource='https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr';
  p.data.url='https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr';
  assert.equal(boundText(p,layer,'outer'),expected);assert.equal(referenceJCardSpineMetric(p),expected);
 }
});

test('two-line J-card spine takes priority only when both names remain visible',()=>{
 const p=imported({source:'spotify',s2l:'1'}),layer=spine(p);
 assert.equal(boundText(p,layer,'outer'),'*Artist*\n# **Album**');
 const metric=referenceJCardSpineMetric(p);
 layer.hideArtist=true;assert.equal(boundText(p,layer,'outer'),'# **Album**');
 layer.hideArtist=false;layer.hideAlbum=true;assert.equal(boundText(p,layer,'outer'),'');
 layer.hideArtist=true;assert.equal(boundText(p,layer,'outer'),'');
 assert.equal(referenceJCardSpineMetric(p),metric);
 p.referenceJCardPlaylistSpine=false;layer.hideArtist=false;assert.equal(boundText(p,layer,'outer'),'*Artist*');
 layer.hideArtist=true;assert.equal(boundText(p,layer,'outer'),'');
});

test('playlist spine retains literal punctuation and independent album styling after reopening',()=>{
 const p=imported({playlistUrl:'https://example.com/playlist',f2:'1.2s.4.2s.0',f3:'2.2s.6.2s.4'}),layer=spine(p);
 const layout=textLayout(boundText(p,layer,'outer'),{...layer,w:400,h:400},{project:p});
 assert.equal(layout.lineRuns.flat().map(run=>run.text).join(''),'# **Album**');
 assert.ok(layout.lineRuns.flat().every(run=>run.style?.font==='Times New Roman'));
 const reopened=migrate(JSON.parse(JSON.stringify(p))),savedSpine=spine(reopened);
 assert.equal(reopened.referenceJCardPlaylistSpine,true);assert.equal(boundText(reopened,savedSpine,'outer'),'# **Album**');
 assert.equal(savedSpine.albumStyle.font,'Times New Roman');assert.ok(renderSvg(reopened,'outer',{guides:false}).svg.includes('**Album**'));
});

test('importing another format or a fresh J-card clears an earlier playlist-spine decision',()=>{
 for(const mode of ['cassette','cd','cd-insert','cd-tray']){
  const p=imported({source:'youtube'});assert.equal(p.referenceJCardPlaylistSpine,true);
  imported({},p,mode);assert.equal(p.referenceJCardPlaylistSpine,undefined);
  imported({},p);assert.equal(p.referenceJCardPlaylistSpine,false);
  assert.equal(boundText(p,spine(p),'outer'),'*Artist* # **Album**');
 }
 const p=imported({source:'spotify'});imported({source:'spotify-album'},p);
 assert.equal(boundText(p,spine(p),'outer'),'*Artist* # **Album**');
});

test('J-card spine metric retains the complete source names independently of display visibility',()=>{
 const p={data:{artist:'Artist',album:''},referenceJCardPlaylistSpine:false},layer={hideArtist:true,hideAlbum:true};
 assert.equal(referenceJCardSpineText(p,layer),'');assert.equal(referenceJCardSpineMetric(p),'Artist ');
 p.data.artist='';p.data.album='Album';assert.equal(referenceJCardSpineMetric(p),'Album');
});

test('actual J-card automatic size follows the same saved source decision after artwork lookup',()=>{
 for(const params of [{source:'spotify'},{source:'youtube'},{source:'spotify-album',id:'sa.example'},{playlistUrl:'https://example.com/playlist'}]){
  const p=imported({...params,musicArtist:'A long artist name that should affect an album spine only',musicAlbum:'Short'}),layer=spine(p);
  const expectedSize=()=>Math.round(94*jcardSpineFontScale(referenceJCardSpineMetric(p))/100*(p.layout.spine/(300*REFERENCE_UNIT)))*REFERENCE_UNIT;
  assert.ok(Math.abs(layer.size-expectedSize())<1e-9);
  p.referenceMusicMetadataSource='https://open.spotify.com/album/example';p.data.url=p.referenceMusicMetadataSource;
  syncReferenceJCardFonts(p);assert.ok(Math.abs(layer.size-expectedSize())<1e-9);
  layer.hideArtist=true;layer.hideAlbum=true;syncReferenceJCardFonts(p);
  assert.equal(boundText(p,layer,'outer'),'');assert.ok(Math.abs(layer.size-expectedSize())<1e-9);
 }
});
