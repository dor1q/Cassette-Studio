import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate} from '../src/model.js';
import {applyAlbumColors} from '../src/album-colors.js';
import {setProjectTextColor} from '../src/text-color.js';
import {parseReferenceBlocks,referenceBlockStyle} from '../src/reference-freeplace.js';

test('block copies use their normalized identity to avoid duplicate base and copy transforms',()=>{
 const entries=parseReferenceBlocks('bdefault-spineText_10_20_100_0_5_0|bdefault-spineText*1_90_80_200_0_50_0|bdefault-spineText*02_40_30_100_0_5_0|bdefault-spineText*2_80_70_100_0_5_0');
 assert.deepEqual(entries.map(e=>[e.copy,e.x]),[[1,10],[2,40]]);
 const params=new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',bx:'bdefault-spineText_10_20_100_0_5_0|bdefault-spineText*1_90_80_200_0_50_0'});
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+params);
 assert.equal(p.referenceFreePlace.applied,1);
 assert.equal(p.surfaces.outer.filter(l=>l.referenceBlock==='default-spineText').length,1);
});

test('a J-card block own color survives shared foreground and album palette changes',()=>{
 const params=new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',bx:'bdefault-spineText_20_45_100_0_5_0_0__~Arial.7.2s.0.0.140.ff6600|bdefault-inside1_50_50_100_0_16_0_0__~Arial.7.2s.0.0.140.44cc88'});
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+params);
 const spine=p.surfaces.outer.find(l=>l.source==='spine'),inside=p.surfaces.outer.find(l=>l.referenceFlow);
 assert.equal(spine.referenceOwnColor,true);assert.equal(inside.referenceOwnColor,true);
 setProjectTextColor(p,'#112233');applyAlbumColors(p,{bg:'#101010',fg:'#ffffff'});
 assert.equal(spine.color,'#ff6600');assert.equal(inside.color,'#44cc88');
 const saved=migrate(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.surfaces.outer.find(l=>l.source==='spine').referenceOwnColor,true);
 assert.equal(saved.surfaces.outer.find(l=>l.referenceFlow).color,'#44cc88');
});

test('invalid block numeric styles leave inherited properties intact',()=>{
 const style=referenceBlockStyle('~Arial.bad.!.0.wrong.wrong.abcdef',1);
 assert.equal(style.font,'Arial');assert.equal(style.color,'#abcdef');
 for(const key of ['fontWeight','bold','fontStretch','spacing','lineHeight'])assert.equal(Object.hasOwn(style,key),false);
 assert.deepEqual(referenceBlockStyle('...0.0',1),{});
 assert.equal(referenceBlockStyle('...0.-999.1',1).spacing,-20);
 assert.equal(referenceBlockStyle('...0.-999.1',1).lineHeight,.5);
 assert.equal(Object.hasOwn(referenceBlockStyle('...0...abcdef0',1),'color'),false);
 const overflowing='9'.repeat(400);
 assert.deepEqual(referenceBlockStyle('.'+overflowing+'.'+overflowing+'.0.'+overflowing+'.'+overflowing,1),{});
});
