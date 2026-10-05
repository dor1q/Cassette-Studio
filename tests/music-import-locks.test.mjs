import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,clone,makeLayer,importReference,boundText} from '../src/model.js';
import {applyAlbumArt,albumArtLayer} from '../src/album-art.js';
import {importMusicData} from '../src/music-import.js';
import {groupFor,frameFor,copyGroup} from '../src/flow-editing.js';
import {flowText,renderSvg} from '../src/render.js';

const image='data:image/png;base64,T0xE',next='data:image/png;base64,TkVX';
const album={artist:'New artist',album:'New album',url:'https://example.com/new',tracks:[{title:'First new song',seconds:120},{title:'Second new song',seconds:120}]};
function project(){const p=createProject();p.settings.lockDesign=false;applyAlbumArt(p,image);return p}

test('resetting design for a music import retains locked cover, text and manual image without default duplicates',()=>{
 const p=project(),cover=albumArtLayer(p,'outer'),note=p.surfaces.outer.find(layer=>layer.source==='note'),artist=p.surfaces.outer.find(layer=>layer.source==='artist');
 Object.assign(cover,{locked:true,x:12,y:9,w:43,h:31,rotation:35,cropZoom:1.8,cropX:4,opacity:.7});
 Object.assign(note,{locked:true,x:24,y:72,font:'Georgia',size:5,text:'Keep note',referenceOwnColor:true});artist.size=99;
 const decal=makeLayer('image',{locked:true,name:'Manual locked overlay',category:'overlay',src:image,x:80,y:41,w:12,h:9,rotation:-29,opacity:.6});p.surfaces.outer.push(decal);
 const preserved=[cover,note,decal],snapshots=preserved.map(clone);
 importMusicData(p,album);const applied=applyAlbumArt(p,next);
 preserved.forEach((layer,index)=>{assert.equal(p.surfaces.outer.find(peer=>peer.id===layer.id),layer);assert.deepEqual(layer,snapshots[index])});
 assert.equal(p.surfaces.outer.filter(layer=>layer.source==='note').length,1);assert.equal(p.surfaces.outer.filter(layer=>layer.category==='albumCover').length,1);
 assert.notEqual(p.surfaces.outer.find(layer=>layer.source==='artist').id,artist.id);assert.equal(p.surfaces.outer.find(layer=>layer.source==='artist').size,4);
 assert.equal(p.data.album,'New album');assert.equal(boundText(p,p.surfaces.outer.find(layer=>layer.source==='artist'),'outer'),'New artist');
 assert.deepEqual(applied,{applied:['labelA','labelB'],locked:['outer']});
});

test('resetting all surfaces preserves a synchronized old cover pair if either side is locked',()=>{
 const p=project(),a=albumArtLayer(p,'labelA'),b=albumArtLayer(p,'labelB');Object.assign(b,{locked:true,cropZoom:1.7,cropX:-4});a.cropY=3;
 const before=[clone(a),clone(b)];importMusicData(p,album);const result=applyAlbumArt(p,next);
 assert.equal(albumArtLayer(p,'labelA'),a);assert.equal(albumArtLayer(p,'labelB'),b);assert.deepEqual([a,b],before);
 assert.deepEqual(result,{applied:['outer'],locked:['labelA','labelB']});assert.equal(p.data.album,'New album');
});

test('resetting one side retains its cover paired with a locked other side and leaves untargeted surfaces intact',()=>{
 const p=project(),a=albumArtLayer(p,'labelA'),b=albumArtLayer(p,'labelB');b.locked=true;a.cropX=6;
 const before=clone(p),oldOther=p.surfaces.labelB;const discarded=makeLayer('image',{src:image,category:'decals',name:'Unlocked decal'});p.surfaces.labelA.push(discarded);
 importMusicData(p,album,'A');const result=applyAlbumArt(p,next,'A');
 assert.equal(albumArtLayer(p,'labelA'),a);assert.deepEqual(a,before.surfaces.labelA.find(layer=>layer.id===a.id));assert.equal(p.surfaces.labelB,oldOther);
 assert.deepEqual(p.surfaces.labelB,before.surfaces.labelB);assert.deepEqual(p.surfaces.outer,before.surfaces.outer);assert.deepEqual(p.surfaces.inner,before.surfaces.inner);assert.deepEqual(p.data.B,before.data.B);
 assert.equal(p.data.album,before.data.album);assert.equal(p.data.A[0].title,'First new song');assert.ok(!p.surfaces.labelA.includes(discarded));
 assert.deepEqual(result,{applied:[],locked:['labelA']});
});

test('resetting an independent side preserves its locks and replaces only its unlocked defaults',()=>{
 const p=project();p.layout.sync=false;const cover=albumArtLayer(p,'labelB'),artist=p.surfaces.labelB.find(layer=>layer.source==='artist');cover.locked=true;artist.locked=true;artist.size=8;
 const before=clone(p),oldA=p.surfaces.labelA;importMusicData(p,album,'B');applyAlbumArt(p,next,'B');
 assert.equal(p.surfaces.labelA,oldA);assert.deepEqual(p.surfaces.labelA,before.surfaces.labelA);assert.equal(albumArtLayer(p,'labelB'),cover);
 assert.deepEqual(cover,before.surfaces.labelB.find(layer=>layer.id===cover.id));assert.equal(p.surfaces.labelB.find(layer=>layer.source==='artist'),artist);
 assert.equal(p.surfaces.labelB.filter(layer=>layer.source==='artist').length,1);assert.equal(p.data.B[0].title,'First new song');
});

test('a locked combined heading and original flap tracks replace their equivalent stock bound blocks',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=4&ds=1');p.settings.lockDesign=false;
 const heading=makeLayer('text',{source:'referenceHeading',x:45,y:8,w:50,h:20}),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks');p.surfaces.outer.push(heading);assert.ok(flap);
 heading.locked=true;flap.locked=true;const before=[clone(heading),clone(flap)];importMusicData(p,album);
 assert.deepEqual([heading,flap],before);assert.ok(p.surfaces.outer.includes(heading));assert.ok(p.surfaces.outer.includes(flap));
 for(const source of ['artist','album','A','B'])assert.equal(p.surfaces.outer.filter(layer=>layer.source===source).length,0,source);
 assert.match(boundText(p,heading,'outer'),/New artist/);assert.match(boundText(p,flap,'outer'),/First new song/);
});

test('a locked original flow column retains the complete joined frame and replaces the same default inner panel',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&dc=1');p.settings.lockDesign=false;
 const pair=p.surfaces.inner.filter(layer=>layer.referenceFlow&&layer.referencePanelIndex===2);assert.equal(pair.length,2);
 Object.assign(pair[0],{locked:true,x:12,y:18,w:22,h:43,rotation:15});Object.assign(pair[1],{x:40,y:18,w:19,h:37,rotation:15});
 const before=pair.map(clone),frame=clone(frameFor(groupFor(p,pair[0],'inner')));importMusicData(p,album);
 pair.forEach((layer,index)=>{assert.ok(p.surfaces.inner.includes(layer));assert.deepEqual(layer,before[index])});
 assert.deepEqual(frameFor(groupFor(p,pair[0],'inner')),frame);assert.equal(p.surfaces.inner.filter(layer=>layer.source==='lyrics'&&layer.flowIndex===0).length,0);
 assert.ok(p.surfaces.inner.some(layer=>layer.source==='lyrics'&&layer.flowIndex===1));assert.match(flowText(p,pair[0],'inner').text,/New artist/);
 const svg=renderSvg(p,'inner',{editing:true}).svg;for(const layer of pair)assert.ok(svg.includes('data-layer="'+layer.id+'"'));
});

test('a locked outer flow block suppresses a stock production block in its panel',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1');p.settings.lockDesign=false;
 const layer=p.surfaces.outer.find(item=>item.referenceFlow&&item.referencePanelIndex===3);assert.ok(layer);layer.locked=true;
 const before=clone(layer);importMusicData(p,album);assert.deepEqual(layer,before);assert.ok(p.surfaces.outer.includes(layer));assert.equal(p.surfaces.outer.filter(item=>item.source==='production').length,0);
});

test('locked flow copies retain their original text dependencies without displaying the discarded old blocks',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&dc=1');p.settings.lockDesign=false;
 p.data.lyrics=Array.from({length:80},(_,index)=>'Лирика '+index+' остаётся связана с копией панели').join('\n');
 for(const layer of Object.values(p.surfaces).flat().filter(layer=>layer.referenceFlow)){layer.h=8;layer.size=2;layer.lineHeight=1.2}
 const original=p.surfaces.inner.find(layer=>layer.referenceFlow&&layer.referencePanelIndex===2),copies=copyGroup(groupFor(p,original,'inner'),{dx:8,dy:5});
 copies.forEach(layer=>{layer.locked=true;p.surfaces.inner.push(layer)});const before=copies.map(clone);
 const expected=clone(p);expected.settings.lockDesign=true;importMusicData(expected,album);
 const text=expected.surfaces.inner.filter(layer=>copies.some(copy=>copy.id===layer.id)).map(layer=>flowText(expected,layer,'inner').text);assert.ok(text.every(Boolean));
 importMusicData(p,album);
 copies.forEach((copy,index)=>{assert.ok(p.surfaces.inner.includes(copy));assert.deepEqual(copy,before[index]);assert.equal(flowText(p,copy,'inner').text,text[index])});
 const originals=Object.values(p.surfaces).flat().filter(layer=>layer.referenceFlow);assert.ok(originals.length);assert.ok(originals.every(layer=>!layer.visible));
 assert.ok(p.surfaces.inner.some(layer=>layer.source==='lyrics'&&layer.visible));
 const svg=renderSvg(p,'inner',{editing:true}).svg;for(const copy of copies)assert.ok(svg.includes('data-layer="'+copy.id+'"'));for(const layer of originals)assert.ok(!svg.includes('data-layer="'+layer.id+'"'));
});

test('track-only imports still preserve every layer even when the design reset option is enabled',()=>{
 const p=project();p.surfaces.labelA[0].locked=true;const before=clone(p.surfaces);
 importMusicData(p,album,'A',{tracksOnly:true});assert.deepEqual(p.surfaces,before);assert.equal(p.data.A[0].title,'First new song');
});
