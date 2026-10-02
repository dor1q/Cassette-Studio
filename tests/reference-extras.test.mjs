import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate,dimensions} from '../src/model.js';
import {parseReferenceBlocks,referenceBlockStyle} from '../src/reference-freeplace.js';
import {jcardSlitPaths} from '../src/jcard-slits.js';
import {renderSvg} from '../src/render.js';
import {spotifyCodeUrl,parseReferenceOverlays,restoreReferenceExtras} from '../src/reference-extras.js';
import {referenceCenterX} from '../src/reference-format.js';
const image='data:image/png;base64,iVBORw0KGgo=';
test('free placement parses duplicates, disabled placement and independent text styling',()=>{
 const p=parseReferenceBlocks('bA-artist_50_15_120_30_60_0_1__~Arial.7.3c.6.12.140.abc.r|bA-artist_5_5_100_0_10_0|bA-album*2_10_90_80_0_40_1');
 assert.equal(p.length,2);assert.equal(p[0].locked,true);assert.equal(p[1].copy,2);assert.equal(p[1].hidden,true);
 assert.deepEqual(parseReferenceBlocks('~|bA-artist_10_10_100_0_50_0'),[]);
 const s=referenceBlockStyle(p[0].style,1);assert.equal(s.font,'Arial');assert.equal(s.fontStretch,120);assert.equal(s.uppercase,true);assert.equal(s.italic,true);assert.equal(s.spacing,1.2);assert.equal(s.color,'#aabbcc');assert.equal(s.align,'right');
});
test('cassette free placement moves only the target side, preserves styles and duplicates after reload',()=>{
 const p=createProject();const q=new URLSearchParams({ss:'0',bx:'bA-artist_50_15_120_0_60_0_1__~Arial.5.3c.4.12.140.ff6600.r|bB-album*2_30_80_100_0_40_1'});
 importReference(p,'https://vhs.texs.org/en/cassette?'+q);
 const a=p.surfaces.labelA.find(l=>l.source==='artist'),b=p.surfaces.labelB.find(l=>l.source==='artist');
 assert.notEqual(a.y,b.y);assert.equal(a.locked,true);assert.equal(a.color,'#ff6600');assert.equal(a.fontWeight,500);assert.equal(a.italic,true);assert.equal(a.align,'right');
 assert.equal(p.surfaces.labelB.filter(l=>l.source==='album').length,2);assert.equal(p.referenceFreePlace.applied,2);
 const saved=migrate(JSON.parse(JSON.stringify(p)));assert.equal(saved.surfaces.labelA.find(l=>l.source==='artist').locked,true);assert.equal(saved.surfaces.labelB.find(l=>l.name.includes('копия')).visible,false);
});
test('extended J-card spindle cut guides mirror correctly and stay absent on ordinary flaps',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?eb=1&bsl=1&ds=1');
 const f=jcardSlitPaths(p,'outer'),b=jcardSlitPaths(p,'inner');assert.equal(f.length,2);assert.equal(b.length,2);
 const center=path=>{const x=[...path.matchAll(/[ML](-?\d+(?:\.\d+)?) /g)].map(m=>Number(m[1]));return (Math.min(...x)+Math.max(...x))/2};
 assert.ok(Math.abs(center(f[0])+center(b[0])-dimensions(p,'outer').w)<.01);
 assert.equal((renderSvg(p,'outer',{guides:true}).svg.match(/data-jcard-slit=/g)||[]).length,2);
 assert.ok(!renderSvg(p,'outer',{guides:false}).svg.includes('data-jcard-slit'));
 importReference(p,'https://vhs.texs.org/en/jcard?sb=1&tb=1&bsl=1');assert.equal(p.layout.flapShape,'short');assert.equal(jcardSlitPaths(p,'outer').length,0);
});
test('free placement preserves the center of vertical J-card spine text and global visibility',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?musicArtist=A&musicAlbum=B&bx=bdefault-spineText_20_45_150_30_5_0');
 const l=p.surfaces.outer.find(l=>l.source==='spine'),a=l.rotation*Math.PI/180,cx=l.x+(l.w*Math.cos(a)-l.h*Math.sin(a))/2,cy=l.y+(l.w*Math.sin(a)+l.h*Math.cos(a))/2;
 assert.ok(Math.abs(cx-referenceCenterX(p,20))<1e-8);assert.ok(Math.abs(cy-p.layout.height*.45)<1e-8);
 importReference(p,'https://vhs.texs.org/en/cassette?ch=1&bx=bA-artist_50_50_100_0_50_0');assert.equal(p.surfaces.labelA.find(l=>l.source==='artist').visible,false);
});
test('Spotify Codes use album or playlist identity and restore separate sides using cached bytes',async()=>{
 const params=new URLSearchParams({playlistUrl:'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc',sc:'20_80_100_90|b~80_20_50_0',ss:'0'}),url=spotifyCodeUrl(params);
 assert.match(url,/spotify:playlist:37i9dQZF1DXcBWIGoYBM5M$/);assert.equal(spotifyCodeUrl(new URLSearchParams({playlistUrl:'javascript:fake'})),null);
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?'+params);
 const result=await restoreReferenceExtras(p,params,async()=>{throw Error('offline')},'label',[{referenceAssetKey:url,src:image}]);
 assert.equal(result.restored,2);assert.equal(result.missing,0);assert.equal(p.surfaces.labelA.filter(l=>l.category==='spotifyCode').length,1);assert.equal(p.surfaces.labelB.filter(l=>l.category==='spotifyCode').length,1);
 assert.equal(p.surfaces.labelA.at(-1).rotation,90);assert.equal(migrate(p).surfaces.labelB.at(-1).src,image);
});
test('overlay parameters restore opacity, blending, layer order and cached offline images',async()=>{
 const params=new URLSearchParams({ol:'1.2.45|a1.1.70.c|c.1.100',col:'https://vhs.texs.org/_overlays/custom.png',ds:'1',cxt:'Caption|50|50|0|50'}),overlays=parseReferenceOverlays(params.get('ol'));
 assert.equal(overlays.length,3);assert.equal(overlays[0].blendMode,'hard-light');assert.equal(overlays[1].seed,12);assert.equal(parseReferenceOverlays('2.1.70','label').length,0);
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+params);
 const cached=[{referenceAssetKey:'overlay:wild-america:1',src:image},{referenceAssetKey:'overlay:wild-america-remix:12',src:image},{referenceAssetKey:'overlay:custom:'+params.get('col'),src:image}];
 const result=await restoreReferenceExtras(p,params,async()=>{throw Error('offline')},'jcard',cached);assert.equal(result.restored,3);assert.equal(result.missing,0);
 const layers=p.surfaces.outer;assert.equal(layers.filter(l=>l.category==='overlay').length,3);assert.ok(layers.findIndex(l=>l.category==='overlay')<layers.findIndex(l=>l.category==='referenceText'));
 const saved=migrate(p).surfaces.inner.filter(l=>l.category==='overlay');assert.equal(saved[0].opacity,.45);assert.equal(saved[0].blendMode,'hard-light');assert.equal(saved[0].src,image);
});
