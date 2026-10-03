import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate} from '../src/model.js';
import {rebuildReferenceFlow,referenceFlowCopy} from '../src/reference-flow.js';
import {flowText} from '../src/render.js';
import {groupFor,frameFor,captureGroup,applyFrame,patchGroup,copyGroup} from '../src/flow-editing.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const project=()=>importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&dc=1');
function panel(p,surface='inner',index=2){return p.surfaces[surface].filter(l=>l.referenceFlow&&l.referencePanelIndex===index)}
const geometry=layer=>Object.fromEntries(['x','y','w','h','rotation','size','spacing','outline','shadow'].map(key=>[key,layer[key]]));

test('one panel group contains both columns including hidden peers and excludes other panels and faces',()=>{
 const p=project(),pair=panel(p);assert.equal(pair.length,2);
 pair[0].visible=false;
 for(const selected of pair){const group=groupFor(p,selected,'inner');assert.deepEqual(group.layers,pair);assert.equal(group.leader,selected);assert.equal(group.surface,'inner');assert.equal(group.panel,2);assert.equal(frameFor(group).visible,true)}
 pair[1].visible=false;assert.equal(frameFor(groupFor(p,pair[0],'inner')).visible,false);
 assert.equal(groupFor(p,pair[0],'outer'),null);assert.equal(groupFor(p,p.surfaces.outer[0],'outer'),null);
 p.layout.columns=1;rebuildReferenceFlow(p);assert.equal(groupFor(p,panel(p)[0],'inner'),null);
});

test('joint move, rotation and uniform scaling preserve each column manual shape, style ratio and flow identity',()=>{
 const p=project(),pair=panel(p),data=structuredClone(p.data);
 Object.assign(pair[0],{x:10,y:20,w:12,h:30,rotation:0,size:2,spacing:.2,outline:.1,shadow:.3,color:'#ff6600',font:'Georgia',referenceManualGeometry:true});
 Object.assign(pair[1],{x:30,y:20,w:16,h:25,rotation:0,size:3,spacing:.4,outline:.2,shadow:.6,color:'#0055aa',font:'Arial',referenceManualGeometry:true});
 const ids=pair.map(l=>[l.id,l.source,l.flowIndex,l.referencePanelIndex,l.referenceColumn]),group=groupFor(p,pair[0],'inner'),snapshot=captureGroup(group);
 assert.deepEqual(Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,snapshot.frame[key]])),{x:10,y:20,w:36,h:30,rotation:0});
 assert.equal(applyFrame(snapshot,{x:100,y:200,w:72,rotation:90}),true);
 assert.deepEqual(pair.map(geometry),[
  {x:100,y:200,w:24,h:60,rotation:90,size:4,spacing:.4,outline:.2,shadow:.6},
  {x:100,y:240,w:32,h:50,rotation:90,size:6,spacing:.8,outline:.4,shadow:1.2}
 ]);
 assert.deepEqual(pair.map(l=>[l.font,l.color]),[['Georgia','#ff6600'],['Arial','#0055aa']]);
 assert.deepEqual(pair.map(l=>[l.id,l.source,l.flowIndex,l.referencePanelIndex,l.referenceColumn]),ids);assert.deepEqual(p.data,data);
 assert.equal(applyFrame(snapshot,{w:108}),true);near(pair[0].w,36);near(pair[1].w,48);near(pair[1].x,70);near(pair[1].size,9);
});

test('rotated group bounds enclose both columns and changing one frame coordinate translates both equally',()=>{
 const p=project(),pair=panel(p);
 Object.assign(pair[0],{x:10,y:20,w:12,h:30,rotation:90});Object.assign(pair[1],{x:10,y:40,w:16,h:25,rotation:90});
 const snapshot=captureGroup(groupFor(p,pair[1],'inner'));
 near(snapshot.frame.x,10);near(snapshot.frame.y,20);near(snapshot.frame.w,36);near(snapshot.frame.h,30);assert.equal(snapshot.frame.rotation,90);
 assert.equal(applyFrame(snapshot,{x:25}),true);near(pair[0].x,25);near(pair[1].x,25);near(pair[0].y,20);near(pair[1].y,40);
 const original=structuredClone(pair);assert.equal(applyFrame(captureGroup(groupFor(p,pair[0],'inner')),{w:72,h:30}),false);assert.deepEqual(pair,original,'Skewed transform must not partially apply');
 for(const bad of [{x:Infinity},{rotation:NaN},{w:-1},{h:0}])assert.equal(applyFrame(snapshot,bad),false);
 assert.deepEqual(pair,original);
});

test('grouped style and content flags reach both columns without overwriting unrelated per-column overrides',()=>{
 const p=project(),pair=panel(p),group=groupFor(p,pair[0],'inner');
 pair[0].trackOptions={numbers:false};pair[1].trackOptions={durations:false};
 const before=pair.map(geometry);
 assert.equal(patchGroup(group,{font:'Georgia',color:'#ff6600',hideA:true,trackOptions:{showProduction:false}}),true);
 for(const l of pair){assert.equal(l.font,'Georgia');assert.equal(l.color,'#ff6600');assert.equal(l.referenceOwnColor,true);assert.equal(l.hideA,true);assert.equal(l.trackOptions.showProduction,false)}
 assert.equal(pair[0].trackOptions.numbers,false);assert.equal(pair[1].trackOptions.durations,false);assert.notEqual(pair[0].trackOptions,pair[1].trackOptions);assert.deepEqual(pair.map(geometry),before);
 assert.equal(patchGroup(group,{trackOptions:undefined,visible:false}),true);assert.ok(pair.every(l=>!Object.hasOwn(l,'trackOptions')&&!l.visible));
 for(const patch of [{source:'own'},{id:'change'},{trackOptions:{__illegal:true}}])assert.equal(patchGroup(group,patch),false);
 assert.equal(pair[0].source,'referenceContents');
});

test('one locked column blocks joint modifications atomically while unlock and duplication remain available',()=>{
 const p=project(),pair=panel(p),group=groupFor(p,pair[0],'inner');pair[1].locked=true;
 const before=structuredClone(pair);assert.equal(frameFor(group).locked,true);
 assert.equal(applyFrame(captureGroup(group),{x:20}),false);assert.equal(patchGroup(group,{font:'Georgia'}),false);assert.equal(patchGroup(group,{locked:false,visible:false}),false);assert.deepEqual(pair,before);
 assert.equal(copyGroup(group).length,2);assert.deepEqual(pair,before);
 assert.equal(patchGroup(group,{locked:false}),true);assert.ok(pair.every(l=>!l.locked));assert.equal(patchGroup(group,{visible:false}),true);
});

test('duplicating a whole panel creates a separate linked pair with the original flow text',()=>{
 const p=project(),pair=panel(p),group=groupFor(p,pair[0],'inner'),original=structuredClone(pair),copies=copyGroup(group,{dx:7,dy:-2});
 assert.equal(copies.length,2);assert.equal(copies[0].referenceFlowEditGroup,copies[1].referenceFlowEditGroup);assert.notEqual(copies[0].id,copies[1].id);
 p.surfaces.inner.push(...copies);
 for(let i=0;i<2;i++){
  near(copies[i].x,pair[i].x+7);near(copies[i].y,pair[i].y-2);assert.equal(copies[i].referenceFlow,false);
  assert.deepEqual(copies[i].referenceFlowCopySource,{surface:'inner',panel:2,column:i});assert.deepEqual(flowText(p,copies[i],'inner'),flowText(p,pair[i],'inner'));
 }
 const copy=groupFor(p,copies[1],'inner');assert.deepEqual(copy.layers,copies);assert.equal(copy.kind,'copy');
 assert.equal(patchGroup(copy,{color:'#ff0000'}),true);assert.deepEqual(pair,original);
 const next=copyGroup(copy);p.surfaces.inner.push(...next);assert.notEqual(next[0].referenceFlowEditGroup,copies[0].referenceFlowEditGroup);assert.deepEqual(groupFor(p,next[0],'inner').layers,next);
 const individual=pair.map(l=>({...referenceFlowCopy(l,'inner'),id:crypto.randomUUID()}));p.surfaces.inner.push(...individual);
 assert.equal(groupFor(p,individual[0],'inner'),null,'Unrelated single-column duplicates must stay independent');
});

test('original free-place insideN copies group independently by copy number',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/jcard?p=5&ds=1&dc=1&bx='+encodeURIComponent('bsideB-inside1*2_20_50_100_20_20_0|bsideB-inside1*3_70_50_100_-20_20_1'));
 const copy2=p.surfaces.inner.filter(l=>l.referenceBlockCopy===2),copy3=p.surfaces.inner.filter(l=>l.referenceBlockCopy===3);
 assert.equal(copy2.length,2);assert.equal(copy3.length,2);
 assert.deepEqual(groupFor(p,copy2[0],'inner').layers,copy2);assert.deepEqual(groupFor(p,copy3[1],'inner').layers,copy3);
 assert.equal(frameFor(groupFor(p,copy3[1],'inner')).visible,false);
});

test('manual geometry, hidden columns and grouped copies survive layout reflow and JSON reopening',()=>{
 const p=project(),pair=panel(p),group=groupFor(p,pair[0],'inner');
 applyFrame(captureGroup(group),{x:8,y:9,rotation:37});patchGroup(group,{visible:false,font:'Georgia',color:'#cc6600'});
 const before=pair.map(geometry),copies=copyGroup(group);p.surfaces.inner.push(...copies);
 p.layout.columns=1;rebuildReferenceFlow(p);p.layout.double=false;rebuildReferenceFlow(p);
 const saved=migrate(JSON.parse(JSON.stringify(p)));saved.layout.double=true;saved.layout.columns=2;rebuildReferenceFlow(saved);
 const restored=panel(saved);assert.equal(restored.length,2);for(let i=0;i<2;i++){for(const [key,value]of Object.entries(before[i]))near(restored[i][key],value);assert.equal(restored[i].visible,false);assert.equal(restored[i].font,'Georgia');assert.equal(restored[i].color,'#cc6600')}
 const restoredCopies=saved.surfaces.inner.filter(l=>l.referenceFlowEditGroup===copies[0].referenceFlowEditGroup);assert.equal(restoredCopies.length,2);assert.deepEqual(groupFor(saved,restoredCopies[1],'inner').layers,restoredCopies);
 assert.deepEqual(groupFor(saved,restored[0],'inner').layers,restored);
});

test('legacy flow slots can be joined but malformed copy-group tokens and ambiguous columns are ignored',()=>{
 const p=project(),pair=panel(p);
 for(const layer of pair){delete layer.referencePanelIndex;delete layer.referenceColumn}
 assert.deepEqual(groupFor(p,pair[0],'inner').layers,pair);
 const copies=copyGroup(groupFor(p,pair[0],'inner'));for(const layer of copies)layer.referenceFlowEditGroup='unsafe/'+'x'.repeat(110);p.surfaces.inner.push(...copies);
 assert.equal(groupFor(p,copies[0],'inner'),null);
 const duplicate={...pair[1],id:crypto.randomUUID()};p.surfaces.inner.push(duplicate);assert.equal(groupFor(p,pair[0],'inner'),null,'A duplicated flow slot must not transform twice');
});
