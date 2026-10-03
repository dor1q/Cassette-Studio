import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer} from '../src/model.js';
import {preferredArtwork,imageSelectionOptions} from '../src/image-selection.js';
import {renderSvg} from '../src/render.js';

test('artwork can be selected while foreground text is selected, without raising its stacking order',()=>{
 const project=createProject(),cover=makeLayer('image',{category:'albumCover',src:'data:image/png;base64,AA=='}),caption=makeLayer('text',{text:'Caption'});
 project.surfaces.labelA=[cover,caption];
 assert.equal(preferredArtwork(project,'labelA'),cover);
 assert.deepEqual(imageSelectionOptions(project,'labelA',caption.id),{images:[cover],selected:''});
 assert.deepEqual(project.surfaces.labelA,[cover,caption]);
});

test('image chooser uses visible artwork on the current side and still exposes locked artwork',()=>{
 const project=createProject(),hidden=makeLayer('image',{category:'albumCover',visible:false}),background=makeLayer('image',{category:'background',locked:true});
 project.surfaces.labelA=[background,hidden];project.surfaces.labelB=[];
 assert.equal(preferredArtwork(project,'labelA'),background);
 assert.equal(preferredArtwork(project,'labelB'),undefined);
 assert.deepEqual(imageSelectionOptions(project,'labelA',background.id),{images:[background],selected:background.id});
});

test('image editing leaves artwork below text and prevents foreground blocks from intercepting its drag',()=>{
 const project=createProject(),cover=makeLayer('image',{src:'data:image/png;base64,AA=='}),caption=makeLayer('text',{text:'Caption'});
 project.surfaces.labelA=[cover,caption];
 const svg=renderSvg(project,'labelA',{editing:true,selected:cover.id,imageEditing:true}).svg;
 assert.match(svg,new RegExp(`data-layer="${caption.id}"[^>]*pointer-events="none"`));
 assert.doesNotMatch(svg,new RegExp(`data-layer="${cover.id}"[^>]*pointer-events="none"`));
 assert.ok(svg.indexOf(`data-layer="${cover.id}"`)<svg.indexOf(`data-layer="${caption.id}"`));
 const printed=renderSvg(project,'labelA').svg;
 assert.doesNotMatch(printed,/data-layer|data-handle|pointer-events/);
});

test('empty text frame does not capture a click on artwork in ordinary editing',()=>{
 const project=createProject();project.surfaces.outer=[makeLayer('text',{text:'Caption',w:80,h:60})];
 assert.match(renderSvg(project,'outer',{editing:true}).svg,/<rect[^>]*fill="transparent"[^>]*pointer-events="none"/);
});
