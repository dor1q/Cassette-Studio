import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference} from '../src/model.js';
import {groupFor} from '../src/flow-editing.js';
import {selectionFrame,captureSelection,applySelectionFrame,setSelectionProperty,duplicateSelection} from '../src/selection-edit.js';
import {renderSvg,flowText} from '../src/render.js';

const project=()=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p5&ds=1&dc=1&musicLyrics='+encodeURIComponent('Content '.repeat(2000)));return p};
const pair=p=>p.surfaces.outer.filter(layer=>layer.referenceFlow&&layer.referencePanelIndex===3);

test('the selection adapter moves and styles both columns while individual mode stays independent',()=>{
 const p=project(),[a,b]=pair(p),offset=b.x-a.x,before=b.y;
 assert.equal(setSelectionProperty(p,a,'outer','x',37),true);assert.ok(Math.abs(b.x-a.x-offset)<1e-8);
 assert.equal(setSelectionProperty(p,a,'outer','color','#dd3300'),true);assert.equal(a.color,b.color);assert.equal(b.referenceOwnColor,true);
 setSelectionProperty(p,a,'outer','y',18,false);assert.equal(a.y,18);assert.equal(b.y,before);
 const snapshot=captureSelection(p,a,'outer');applySelectionFrame(snapshot,{x:50,y:12});applySelectionFrame(snapshot,{x:60,y:14});assert.equal(selectionFrame(p,a,'outer').x,60);assert.equal(selectionFrame(p,a,'outer').y,14);
});
test('separate duplication of a grouped copy cannot break or enlarge the original linked pair',()=>{
 const p=project(),[a]=pair(p),copies=duplicateSelection(p,a,'outer');p.surfaces.outer.push(...copies);
 const isolated=duplicateSelection(p,copies[0],'outer',{joined:false})[0];p.surfaces.outer.push(isolated);
 assert.equal(groupFor(p,copies[0],'outer').layers.length,2);assert.equal(groupFor(p,isolated,'outer'),null);assert.equal(isolated.referenceFlowEditGroup,undefined);
 assert.deepEqual(flowText(p,isolated,'outer'),flowText(p,a,'outer'));
});
test('a locked peer blocks property and geometry edits and all columns can be unlocked together',()=>{
 const p=project(),[a,b]=pair(p);b.locked=true;const before=structuredClone(pair(p));
 assert.equal(setSelectionProperty(p,a,'outer','font','Georgia'),false);assert.equal(setSelectionProperty(p,a,'outer','x',40),false);assert.deepEqual(pair(p),before);
 assert.equal(setSelectionProperty(p,a,'outer','locked',false),true);assert.equal(b.locked,false);assert.equal(setSelectionProperty(p,a,'outer','bold',true),true);assert.equal(a.fontWeight,700);assert.equal(b.fontWeight,700);
});
test('a group selection draws one frame around both columns without affecting exported artwork',()=>{
 const p=project(),[a]=pair(p),frame=selectionFrame(p,a,'outer'),plain=renderSvg(p,'outer').svg;
 const preview=renderSvg(p,'outer',{selected:a.id,editing:true,selectionFrame:frame}).svg;
 assert.equal((preview.match(/class="selection"/g)||[]).length,1);assert.ok(preview.includes(`width="${frame.w}" height="${frame.h}" fill="none"`));
 assert.equal(renderSvg(p,'outer',{selected:a.id,selectionFrame:frame}).svg,plain);
});
