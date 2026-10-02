import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,migrate,clone} from '../src/model.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';
import {storeMusicGallery,loadGalleryChoice,applyGalleryCover,applyGalleryBackground} from '../src/cover-gallery.js';
const art='data:image/png;base64,aGVsbG8=',other='data:image/png;base64,b3RoZXI=',choice={index:1,file_path:'https://example.com/other.jpg',label:'Other'},loaded={src:other,key:choice.file_path,w:1200,h:600};

test('choosing a cover changes only the selected surface and saves its image and index',()=>{
 const p=createProject();applyAlbumArt(p,art);const old=clone(p);applyGalleryCover(p,'labelA',choice,loaded);
 assert.deepEqual(p.surfaces.labelB,old.surfaces.labelB);assert.deepEqual(p.surfaces.outer,old.surfaces.outer);
 assert.equal(albumArtLayer(p,'labelA').src,other);assert.equal(albumArtLayer(p,'labelA').fit,'meet');
 const saved=migrate(JSON.parse(JSON.stringify(p)));assert.equal(saved.referenceCoverIndices.labelA,1);assert.equal(albumArtLayer(saved,'labelA').src,other);
});
test('a locked cover cannot be replaced through the gallery',()=>{
 const p=createProject();applyAlbumArt(p,art);albumArtLayer(p,'labelA').locked=true;const old=clone(p);
 assert.throws(()=>applyGalleryCover(p,'labelA',choice,loaded),/закреплена/);assert.deepEqual(p,old);
});
test('gallery background sits below the cover and remains on its chosen side',()=>{
 const p=createProject();applyAlbumArt(p,art);const old=clone(p);const background=applyGalleryBackground(p,'labelB',choice,loaded);
 assert.equal(p.surfaces.labelB[0],background);assert.equal(albumArtLayer(p,'labelB').src,art);assert.deepEqual(p.surfaces.labelA,old.surfaces.labelA);
});
test('the gallery loader reuses saved bytes without another network request',async()=>{
 const p=createProject();applyGalleryCover(p,'outer',choice,loaded);
 const request=()=>{throw Error('Unexpected network request')};const result=await loadGalleryChoice(p,choice,request,async()=>[1200,600]);
 assert.equal(result.src,other);assert.deepEqual([result.w,result.h],[1200,600]);
});
test('new imported music replaces old gallery indices and excludes resolution variants',()=>{
 const p=createProject();p.referenceMusicMetadata={cover:'old'};p.referenceCoverIndex=3;
 storeMusicGallery(p,{cover:'https://example.com/main.jpg',coverAlternatives:['https://example.com/main-small.jpg'],customPosters:[{file_path:choice.file_path,label:'Other'}],tracks:[{title:'Track',thumbnail:'https://example.com/track.jpg'}]});
 assert.equal(p.referenceCoverChoices.length,2);assert.equal(p.referenceBackgroundChoices.length,3);assert.equal(p.referenceCoverIndex,0);assert.equal(p.referenceMusicMetadata,undefined);
});
