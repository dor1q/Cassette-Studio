import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,clone,makeLayer} from '../src/model.js';
import {importMusicData} from '../src/music-import.js';
import {applyAlbumColors} from '../src/album-colors.js';
import {setProjectTextColor} from '../src/text-color.js';
import {renderSvg} from '../src/render.js';

const album={artist:'New artist',album:'New album',tracks:[{title:'New song',seconds:180}]};
const palette={bg:'#eeeeee',fg:'#000000'};

test('album import and palette changes preserve locked text, album styles, image tint and codes during a design reset',()=>{
 const p=createProject();p.settings.lockDesign=false;
 const note=p.surfaces.outer.find(layer=>layer.source==='note'),spine=p.surfaces.outer.find(layer=>layer.source==='spine');
 Object.assign(note,{locked:true,visible:false,referenceHiddenByTextColor:true});
 Object.assign(spine,{locked:true,referenceSpine:true,albumStyle:{color:p.settings.fg,font:'Georgia',size:5},referenceAlbumOwnColor:false});
 const tint=makeLayer('image',{locked:true,category:'overlay',src:'data:image/png;base64,T0xE',tintMode:'solid',tintColor:p.settings.fg});
 const qr=makeLayer('qr',{locked:true,text:'https://example.com',color:p.settings.fg,referenceColorInherited:true});p.surfaces.outer.push(tint,qr);
 const preserved=[note,spine,tint,qr],before=preserved.map(clone);
 importMusicData(p,album);assert.equal(applyAlbumColors(p,palette),true);
 preserved.forEach((layer,index)=>{assert.ok(p.surfaces.outer.includes(layer));assert.deepEqual(layer,before[index])});
 assert.equal(p.data.album,'New album');assert.equal(p.settings.bg,palette.bg);assert.equal(p.settings.fg,palette.fg);
 assert.equal(p.surfaces.outer.find(layer=>layer.source==='artist').color,palette.fg);
});

test('changing the shared color leaves locked active, archived and template flow styling and visibility untouched',()=>{
 const p=createProject(),old=p.settings.fg;
 const locked=makeLayer('text',{source:'referenceContents',referenceFlow:true,referenceFlowSurface:'outer',referencePanelIndex:3,referenceColumn:0,locked:true,color:old,albumStyle:{color:old},visible:false,referenceHiddenByTextColor:true});
 const archive=makeLayer('text',{source:'referenceContents',referenceFlow:true,referenceFlowSurface:'inner',referencePanelIndex:2,referenceColumn:0,locked:true,color:old,visible:false,referenceHiddenByTextColor:true});
 const template=makeLayer('text',{source:'referenceContents',locked:true,color:old,albumStyle:{color:old}});
 const unlocked=makeLayer('text',{text:'Inherited',color:old,albumStyle:{color:old},visible:false,referenceHiddenByTextColor:true});
 p.surfaces.outer.push(locked,unlocked);p.referenceFlowArchive=[archive];p.referenceFlowTemplate=template;
 const before=[locked,archive,template].map(clone);setProjectTextColor(p,'#0000ff');
 [locked,archive,template].forEach((layer,index)=>assert.deepEqual(layer,before[index]));
 assert.equal(p.settings.fg,'#0000ff');assert.equal(unlocked.color,'#0000ff');assert.equal(unlocked.albumStyle.color,'#0000ff');assert.equal(unlocked.visible,true);assert.equal(unlocked.referenceHiddenByTextColor,undefined);
 applyAlbumColors(p,palette);[locked,archive,template].forEach((layer,index)=>assert.deepEqual(layer,before[index]));assert.equal(unlocked.color,palette.fg);
});

test('apply to all text preserves locked own-color flags and hidden state while updating unlocked overrides',()=>{
 const p=createProject(),props={color:'#ff8800',referenceOwnColor:true,albumStyle:{color:'#0088ff'},referenceAlbumOwnColor:true,visible:false,referenceHiddenByTextColor:true};
 const locked=makeLayer('text',{...clone(props),locked:true}),unlocked=makeLayer('text',clone(props));p.surfaces.outer.push(locked,unlocked);
 const before=clone(locked);setProjectTextColor(p,'#00ff00',{all:true});assert.deepEqual(locked,before);
 assert.equal(p.settings.fg,'#00ff00');assert.equal(unlocked.color,'#00ff00');assert.equal(unlocked.albumStyle.color,'#00ff00');assert.equal(unlocked.referenceOwnColor,false);assert.equal(unlocked.referenceAlbumOwnColor,false);assert.equal(unlocked.visible,true);assert.equal(unlocked.referenceHiddenByTextColor,undefined);
});

test('a locked automatic color keeps its marker and adapts naturally to changing backgrounds',()=>{
 const p=createProject(),layer=makeLayer('text',{text:'Locked automatic text',locked:true,color:'rainbow',x:5,y:8,w:90,h:20});p.surfaces.outer=[layer];p.settings.fg='rainbow';
 const before=clone(layer);applyAlbumColors(p,{bg:'#ffffff',fg:'#000000'});assert.deepEqual(layer,before);assert.equal(p.settings.fg,'rainbow');
 assert.match(renderSvg(p,'outer').svg,/<text[^>]*fill="#000000"/);
 setProjectTextColor(p,'#ff0000',{all:true});assert.deepEqual(layer,before);assert.equal(p.settings.fg,'#ff0000');
 p.settings.bg='#131139';assert.match(renderSvg(p,'outer').svg,/<text[^>]*fill="#ffffff"/);
});
