import test from 'node:test';
import assert from 'node:assert/strict';
import {albumColorsFromPixels,applyAlbumColors,colorContrast} from '../src/album-colors.js';
import {prepareAlbumImport,importMusicData} from '../src/music-import.js';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {applyAlbumArt} from '../src/album-art.js';
import {renderSvg} from '../src/render.js';
const pixels=(...groups)=>Uint8ClampedArray.from(groups.flatMap(([color,count])=>Array.from({length:count},()=>color).flat()));
const image='data:image/png;base64,AA==',album={artist:'New artist',album:'New album',cover:'new-cover',tracks:[{title:'First',seconds:120}]};

test('cover colors follow its dominant tone while ignoring transparent borders and small highlights',()=>{
 const result=albumColorsFromPixels(pixels([[220,40,55,255],70],[[255,255,255,255],25],[[0,0,255,0],150]));
 assert.equal(result.bg,'#dc2837');assert.equal(result.fg,'#ffffff');assert.ok(colorContrast(result.bg,result.fg)>=4.5);
 const blue=albumColorsFromPixels(pixels([[34,75,176,255],100],[[255,230,70,255],5]));assert.equal(blue.bg,'#224bb0');assert.equal(blue.fg,'#ffffff');
});
test('nearby photographic shades are counted together rather than letting a small exact-color patch win',()=>{
 const groups=Array.from({length:12},(_,i)=>[[160+i,96+i,32+i,255],5]);groups.push([[40,80,200,255],20]);
 const palette=albumColorsFromPixels(pixels(...groups));assert.ok(/^#a[0-9a-f]6[0-9a-f]2[0-9a-f]$/.test(palette.bg));
});
test('monochrome covers still produce a real color and readable text',()=>{
 for(const [value,fg] of [[0,'#ffffff'],[255,'#000000'],[232,'#000000'],[18,'#ffffff']]){const p=albumColorsFromPixels(pixels([[value,value,value,255],100]));assert.equal(p.bg,'#'+value.toString(16).padStart(2,'0').repeat(3));assert.equal(p.fg,fg)}
 for(let value=0;value<=255;value++){const p=albumColorsFromPixels(pixels([[value,value,value,255],1]));assert.ok(colorContrast(p.bg,p.fg)>=4.5)}
 assert.throws(()=>albumColorsFromPixels(pixels([[200,100,0,0],5])),/прозрачная/);
});
test('new album import updates all backgrounds and readable text while preserving locked layout and fonts',async()=>{
 const p=createProject(),before=structuredClone(p.surfaces);p.settings.lockDesign=true;
 const result=await prepareAlbumImport(album,async()=>({src:image}),{colors:true,extractColors:async()=>({bg:'#eeeeee',fg:'#000000'})});
 importMusicData(p,album);applyAlbumArt(p,result.artwork);assert.equal(applyAlbumColors(p,result.palette),true);
 assert.equal(p.data.album,'New album');for(const key of ['bg','bgB','bgInside'])assert.equal(p.settings[key],'#eeeeee');
 for(const [surface,list]of Object.entries(before))for(const original of list){const actual=p.surfaces[surface].find(l=>l.id===original.id);for(const key of ['x','y','w','h','rotation','size','font','fontWeight','visible'])assert.equal(actual[key],original[key]);assert.equal(actual.color,'#000000')}
 for(const surface of Object.keys(p.surfaces))assert.match(renderSvg(p,surface).svg,/fill="#eeeeee"/);
 const saved=migrate(p);assert.equal(saved.settings.bgInside,'#eeeeee');assert.equal(saved.settings.autoAlbumColors,true);
});
test('changing from a light album to a dark album recalculates colors instead of retaining the first palette',async()=>{
 const p=createProject();for(const bg of ['#eee8dd','#101f38']){const prepared=await prepareAlbumImport(album,async()=>({src:image}),{colors:true,extractColors:async()=>albumColorsFromPixels(pixels([[...bg.slice(1).match(/../g).map(n=>parseInt(n,16)),255],1]))});
  importMusicData(p,album);applyAlbumColors(p,prepared.palette);
  assert.equal(p.settings.bg,bg);assert.equal(p.surfaces.outer.find(l=>l.source==='album').color,prepared.palette.fg);
 }
});
test('explicit caption and graphic colors survive automatic recoloring',()=>{
 const p=createProject(),own=makeLayer('text',{text:'Own',color:'#ff9900',referenceOwnColor:true}),custom=makeLayer('text',{text:'Other',color:'#bc2581'}),code=makeLayer('qr',{text:'https://example.com',color:p.settings.fg}),shape=makeLayer('shape',{color:'#ddbb55'});p.surfaces.outer.push(own,custom,code,shape);
 applyAlbumColors(p,{bg:'#eeeeee',fg:'#000000'});assert.equal(own.color,'#ff9900');assert.equal(custom.color,'#bc2581');assert.equal(shape.color,'#ddbb55');assert.equal(code.color,'#000000');
});
test('disabled automatic colors persist after reload and do not block a manual recolor',async()=>{
 const p=createProject();p.settings.autoAlbumColors=false;const before=structuredClone(p.settings);
 assert.equal(applyAlbumColors(p,{bg:'#aabbcc',fg:'#000000'}),false);assert.deepEqual(p.settings,before);assert.equal(migrate(p).settings.autoAlbumColors,false);
 let analyzed=0;await prepareAlbumImport(album,async()=>({src:image}),{colors:false,extractColors:async()=>{analyzed++;return {bg:'#aabbcc',fg:'#000000'}}});assert.equal(analyzed,0);
 assert.equal(applyAlbumColors(p,{bg:'#aabbcc',fg:'#000000'},{force:true}),true);assert.equal(p.settings.autoAlbumColors,false);
 const old=createProject();delete old.settings.autoAlbumColors;assert.equal(migrate(old).settings.autoAlbumColors,true);
});
test('a failed color analysis keeps artwork and tracks available and reports the retained palette',async()=>{
 const prepared=await prepareAlbumImport(album,async()=>({src:image}),{colors:true,extractColors:async()=>{throw Error('Decode failed')}});
 assert.equal(prepared.artwork,image);assert.equal(prepared.palette,null);assert.match(prepared.warnings[0],/Цвета макета сохранены/);
 const p=createProject(),bg=p.settings.bg;importMusicData(p,album);applyAlbumArt(p,prepared.artwork);applyAlbumColors(p,prepared.palette);assert.equal(p.settings.bg,bg);assert.equal(p.data.album,'New album');
});
test('failed covers never analyze old artwork or assign the preceding album palette',async()=>{
 let calls=0;const prepared=await prepareAlbumImport(album,async()=>{throw Error('Offline')},{colors:true,extractColors:async()=>{calls++;return {bg:'#ff0000',fg:'#ffffff'}}});
 assert.equal(calls,0);assert.equal(prepared.artwork,null);assert.equal(prepared.palette,null);
});
