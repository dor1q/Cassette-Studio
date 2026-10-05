import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,clone} from '../src/model.js';
import {applyAlbumArt,albumArtLayer,canReplaceAlbumArt} from '../src/album-art.js';
import {importMusicData} from '../src/music-import.js';

const previous='data:image/png;base64,T0xE',next='data:image/png;base64,TkVX';
function project(){const p=createProject();applyAlbumArt(p,previous);return p}
function lock(p,surface){const layer=albumArtLayer(p,surface);Object.assign(layer,{locked:true,x:18,y:7,w:43,h:33,rotation:27,cropZoom:1.8,cropX:4,cropY:-3,fit:'slice',imageTile:true,tileWidth:11,tileHeight:9,referenceAssetKey:'https://example.com/manual.jpg'});return layer}

test('an imported album preserves a locked J-card cover while updating music and unlocked label covers',()=>{
 const p=project(),layer=lock(p,'outer'),before=clone(layer);
 importMusicData(p,{artist:'New artist',album:'New album',url:'https://example.com/album',tracks:[{title:'New track',seconds:180}]});
 const result=applyAlbumArt(p,next);
 assert.deepEqual(layer,before);assert.equal(p.data.album,'New album');assert.equal([...p.data.A,...p.data.B][0].title,'New track');
 assert.equal(albumArtLayer(p,'labelA').src,next);assert.equal(albumArtLayer(p,'labelB').src,next);
 assert.deepEqual(result,{applied:['labelA','labelB'],locked:['outer']});assert.equal(canReplaceAlbumArt(p,'outer'),false);
});

test('a locked synchronized cover protects both label sides but does not block the J-card',()=>{
 const p=project();lock(p,'labelB');const beforeA=clone(albumArtLayer(p,'labelA')),beforeB=clone(albumArtLayer(p,'labelB'));
 const result=applyAlbumArt(p,next);
 assert.deepEqual(albumArtLayer(p,'labelA'),beforeA);assert.deepEqual(albumArtLayer(p,'labelB'),beforeB);
 assert.equal(albumArtLayer(p,'outer').src,next);assert.deepEqual(result,{applied:['outer'],locked:['labelA','labelB']});
 assert.equal(canReplaceAlbumArt(p,'labelA'),false);assert.equal(canReplaceAlbumArt(p,'labelB'),false);
});

test('independent label sides can replace an unlocked cover without touching a locked other side',()=>{
 const p=project();p.layout.sync=false;const locked=lock(p,'labelB'),before=clone(locked),outer=clone(p.surfaces.outer);
 const result=applyAlbumArt(p,next,'A');
 assert.equal(albumArtLayer(p,'labelA').src,next);assert.deepEqual(locked,before);assert.deepEqual(p.surfaces.outer,outer);
 assert.equal(canReplaceAlbumArt(p,'labelA'),true);assert.deepEqual(result,{applied:['labelA'],locked:[]});
});

test('a locked synchronized counterpart prevents insertion of a previously missing label cover',()=>{
 const p=project();lock(p,'labelA');p.surfaces.labelB=p.surfaces.labelB.filter(layer=>layer!==albumArtLayer(p,'labelB'));
 const before=clone(p.surfaces.labelB),result=applyAlbumArt(p,next,'B');
 assert.deepEqual(p.surfaces.labelB,before);assert.deepEqual(result,{applied:[],locked:['labelB']});
});

test('locked unrelated label elements do not block replacement of an unlocked cover',()=>{
 const p=project();p.surfaces.labelB.find(layer=>layer.type==='text').locked=true;
 const result=applyAlbumArt(p,next,'A');
 assert.equal(albumArtLayer(p,'labelA').src,next);assert.deepEqual(result,{applied:['labelA'],locked:[]});
});
