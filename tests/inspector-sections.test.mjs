import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectorSection,rememberInspectorSection,bindInspectorSections} from '../src/inspector-sections.js';

test('inspector preserves open sections after replacing the selected element controls',()=>{
 assert.doesNotMatch(inspectorSection('text','position','Положение','<input data-prop="x">'),/ open>/);
 rememberInspectorSection({tagName:'DETAILS',dataset:{inspectorSection:'text:position'},open:true});
 const rendered=inspectorSection('text','position','Положение','<input data-prop="x">');
 assert.match(rendered,/data-inspector-section="text:position" open>/);
 assert.match(rendered,/<input data-prop="x">/);
 assert.doesNotMatch(inspectorSection('image','position','Положение',''),/ open>/);
 rememberInspectorSection({tagName:'DETAILS',dataset:{inspectorSection:'text:position'},open:false});
 assert.doesNotMatch(inspectorSection('text','position','Положение','',{open:true}),/ open>/);
});

test('only inspector details affect section preferences and labels are escaped',()=>{
 assert.equal(rememberInspectorSection({tagName:'DIV',dataset:{inspectorSection:'text:effects'},open:true}),false);
 assert.equal(rememberInspectorSection({tagName:'DETAILS',dataset:{},open:true}),false);
 assert.doesNotMatch(inspectorSection('text','effects','<script>',''),/ open>/);
 assert.match(inspectorSection('text','effects','<script>',''),/<summary>&lt;script&gt;<\/summary>/);
});

test('one capturing toggle listener covers every inspector redraw',()=>{
 const calls=[];
 const inspector={addEventListener(...args){calls.push(args)}};
 bindInspectorSections(inspector);bindInspectorSections(inspector);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'toggle');assert.equal(calls[0][2],true);
 calls[0][1]({target:{tagName:'DETAILS',dataset:{inspectorSection:'barcode:effects'},open:true}});
 assert.match(inspectorSection('barcode','effects','Эффекты',''),/ open>/);
});
