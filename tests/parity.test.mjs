import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,boundText,parseTracks,serializeTracks,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';
test('flap and inside track blocks have independent content options',()=>{
 const p=createProject(),a=makeLayer('text',{source:'A',trackOptions:{numbers:false,durations:false,sideText:'Face',sideA:'I'}}),b=makeLayer('text',{source:'A'});
 assert.match(boundText(p,a,'outer'),/^Face I/);assert.doesNotMatch(boundText(p,a,'outer'),/1\. |\(3:07\)/);
 assert.match(boundText(p,b,'inner'),/1\. Kill Everything \(3:07\)/);
 p.data.production='Credits';a.trackOptions={hideTracks:true,showProduction:true};assert.equal(boundText(p,a,'outer'),'Credits');
});
test('panel masking and font weight persist through project import',()=>{
 const p=createProject();p.surfaces.outer=[makeLayer('shape',{panelTargets:[0,2],w:170,h:102}),makeLayer('text',{text:'Weight',fontWeight:500})];
 const copy=migrate(p),svg=renderSvg(copy,'outer').svg;
 assert.deepEqual(copy.surfaces.outer[0].panelTargets,[0,2]);assert.match(svg,/-panels/);assert.match(svg,/font-weight="500"/);
});
test('text track editing preserves artist and duration',()=>{
 const tracks=[{title:'Song',artist:'Artist',seconds:137}];const parsed=parseTracks(serializeTracks(tracks));
 assert.equal(parsed[0].artist,'Artist');assert.equal(parsed[0].title,'Song');assert.equal(parsed[0].seconds,137);
});
test('texture blend and opacity survive save and enter the exported SVG',()=>{
 const p=createProject();p.surfaces.outer.push(makeLayer('image',{name:'Texture',src:'data:image/png;base64,iVBORw0KGgo=',blendMode:'hard-light',opacity:.7}));
 const copy=migrate(p),layer=copy.surfaces.outer.at(-1),svg=renderSvg(copy,'outer').svg;
 assert.equal(layer.blendMode,'hard-light');assert.equal(layer.opacity,.7);
 assert.match(svg,/mix-blend-mode:hard-light/);assert.match(svg,/opacity="0\.7"/);
});
