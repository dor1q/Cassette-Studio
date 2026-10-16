import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate} from '../src/model.js';
import {rebuildReferenceFlow,markReferenceGeometry} from '../src/reference-flow.js';
import {REFERENCE_PANEL_PIXELS,REFERENCE_UNIT as U} from '../src/reference-format.js';

const flow=(project,surface)=>project.surfaces[surface].filter(layer=>layer.referenceFlow);
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} instead of ${expected}`);
function project(panels=4,columns=1){
 return importReference(createProject(),`https://vhs.texs.org/en/jcard?face=p${panels}&ds=1&dc=${columns===2?1:0}`);
}

// Independent acceptance geometry from the original 600 dpi J-card layout:
// 42 px left / 100 px right, 72 px top / bottom, 100 px inter-column gap.
function expectedFrames(widths,{surface,columns,height=101.6,columnHeight=100}){
 const indices=surface==='outer'?widths.map((_,index)=>index).slice(3):widths.map((_,index)=>index).slice(2).reverse();
 if(!indices.length)return [];
 const minWidth=Math.min(...indices.map(index=>widths[index]));
 const width=(minWidth-142*U-(columns-1)*100*U)/columns,total=widths.reduce((sum,w)=>sum+w,0);
 return indices.flatMap(index=>{
  const left=widths.slice(0,index).reduce((sum,w)=>sum+w,0),panelX=surface==='inner'?total-left-widths[index]:left;
  return Array.from({length:columns},(_,column)=>({
   panel:index,column,x:panelX+(widths[index]-minWidth)/2+42*U+column*(width+100*U),y:72*U,w:width,
   h:(height-144*U)*(columns===2?Math.max(20,Math.min(100,columnHeight))/100:1),rotation:0
  }));
 });
}

for(let panels=3;panels<=8;panels++)for(const columns of [1,2])test(`J-card ${panels} panels / ${columns} columns matches original front and mirrored-back text frames`,()=>{
 const p=project(panels,columns),widths=REFERENCE_PANEL_PIXELS.slice(0,panels).map(width=>width*U);
 let globalIndex=0;
 for(const surface of ['outer','inner']){
  const expected=expectedFrames(widths,{surface,columns}),actual=flow(p,surface);
  assert.equal(actual.length,expected.length,`${surface} viewport count`);
  actual.forEach((layer,index)=>{
   const target=expected[index];assert.equal(layer.referencePanelIndex,target.panel);assert.equal(layer.referenceColumn,target.column);
   assert.equal(layer.referenceFlowSurface,surface);assert.equal(layer.flowIndex,globalIndex++);assert.equal(layer.autoFit,false);
   if(surface==='inner')assert.equal(layer.insideIndex,index);
   for(const key of ['x','y','w','h','rotation'])near(layer[key],target[key],`${surface} panel ${target.panel} col ${target.column} ${key}`);
  });
 }
});

test('minimum text width is computed separately for front and reverse content panels',()=>{
 const p=project(5,2);
 // The cover is the narrowest reverse text panel, but does not carry front contents.
 p.layout.panelWidths=[27,13,50,62,58,57,56,55];p.layout.flap=27;p.layout.spine=13;p.layout.front=50;
 rebuildReferenceFlow(p);
 const widths=p.layout.panelWidths.slice(0,5);
 for(const surface of ['outer','inner']){
  const expected=expectedFrames(widths,{surface,columns:2}),actual=flow(p,surface);
  actual.forEach((layer,index)=>{for(const key of ['x','y','w','h'])near(layer[key],expected[index][key],`${surface} ${index} ${key}`)});
 }
 assert.ok(flow(p,'outer')[0].w>flow(p,'inner')[0].w);
 // Center only the panel's spare width; preserve the asymmetric source padding.
 const last=flow(p,'outer').filter(layer=>layer.referencePanelIndex===4),first=flow(p,'outer').filter(layer=>layer.referencePanelIndex===3);
 near(first[0].x-(27+13+50),42*U+2,'wide front panel left inset');
 near(widths[3]-(first[1].x-(27+13+50)+first[1].w),100*U+2,'wide front panel right inset');
 near(last[1].x-last[0].x-last[0].w,100*U,'two-column gap');
});

test('column height changes both sides only in double-column mode and stays within the public 20–100 percent range',()=>{
 for(const columns of [1,2])for(const requested of [10,20,53,100,130]){
  const p=project(6,columns);p.layout.columnHeight=requested;p.layout.height=118;rebuildReferenceFlow(p);
  const expected=(118-144*U)*(columns===2?Math.max(20,Math.min(100,requested))/100:1);
  for(const surface of ['outer','inner'])for(const layer of flow(p,surface)){near(layer.h,expected,`${columns} cols ${requested}% ${surface}`);near(layer.y,72*U,'top inset')}
 }
});

test('automatic reflow preserves manual locked and free-placement frames while recalculating neighboring columns',()=>{
 const p=project(5,2),manual=flow(p,'outer')[0],locked=flow(p,'inner')[0],free=flow(p,'inner')[2];
 Object.assign(manual,{x:12,y:7,w:31,h:28,rotation:17});markReferenceGeometry(manual);
 Object.assign(locked,{x:23,y:11,w:27,h:42,rotation:-9,locked:true});
 Object.assign(free,{x:35,y:5,w:21,h:37,rotation:24,referenceBlock:'reverse-inside2'});
 const saved=[manual,locked,free].map(layer=>({id:layer.id,frame:frame(layer)}));
 p.layout.panels=8;p.layout.height=110;p.layout.columnHeight=40;rebuildReferenceFlow(p);
 for(const before of saved){const layer=[...flow(p,'outer'),...flow(p,'inner')].find(next=>next.id===before.id);assert.ok(layer);assert.deepEqual(frame(layer),before.frame)}
 const auto=flow(p,'outer').find(layer=>layer.referencePanelIndex===7&&layer.referenceColumn===1);
 const target=expectedFrames(p.layout.panelWidths,{surface:'outer',columns:2,height:110,columnHeight:40}).find(next=>next.panel===7&&next.column===1);
 for(const key of ['x','y','w','h','rotation'])near(auto[key],target[key],`new automatic frame ${key}`);
 assert.equal(auto.referenceManualGeometry,undefined);assert.equal(auto.referenceBlock,undefined);assert.equal(auto.locked,false);
});

test('hidden columns restore their own styling and automatic geometry after saving a smaller layout',()=>{
 const p=project(8,2),source=flow(p,'outer').find(layer=>layer.referencePanelIndex===7&&layer.referenceColumn===1);
 Object.assign(source,{font:'Times New Roman',fontWeight:600,color:'#aabbcc',referenceOwnColor:true,visible:false});
 p.layout.panels=3;p.layout.columns=1;p.layout.double=false;rebuildReferenceFlow(p);
 assert.equal(flow(p,'outer').length,0);assert.equal(flow(p,'inner').length,0);
 assert.ok(p.referenceFlowArchive.some(layer=>layer.referencePanelIndex===7&&layer.referenceColumn===1));
 const reopened=migrate(JSON.parse(JSON.stringify(p)));reopened.layout.panels=8;reopened.layout.columns=2;reopened.layout.double=true;reopened.layout.columnHeight=65;reopened.layout.height=120;
 rebuildReferenceFlow(reopened);
 const restored=flow(reopened,'outer').find(layer=>layer.referencePanelIndex===7&&layer.referenceColumn===1);
 assert.equal(restored.font,'Times New Roman');assert.equal(restored.fontWeight,600);assert.equal(restored.color,'#aabbcc');assert.equal(restored.visible,false);assert.equal(restored.referenceOwnColor,true);
 const target=expectedFrames(reopened.layout.panelWidths,{surface:'outer',columns:2,height:120,columnHeight:65}).find(next=>next.panel===7&&next.column===1);
 for(const key of ['x','y','w','h'])near(restored[key],target[key],`restored automatic frame ${key}`);
 assert.equal(reopened.referenceFlowArchive.length,0);
});

test('archived reverse manual columns retain their geometry when duplex is restored',()=>{
 const p=project(6,2),source=flow(p,'inner').find(layer=>layer.referencePanelIndex===5&&layer.referenceColumn===1);
 Object.assign(source,{x:17,y:19,w:24,h:32,rotation:-13,locked:true});markReferenceGeometry(source);const before=frame(source);
 p.layout.double=false;rebuildReferenceFlow(p);
 const reopened=migrate(JSON.parse(JSON.stringify(p)));reopened.layout.double=true;reopened.layout.columnHeight=25;rebuildReferenceFlow(reopened);
 const restored=flow(reopened,'inner').find(layer=>layer.referencePanelIndex===5&&layer.referenceColumn===1);
 assert.deepEqual(frame(restored),before);assert.equal(restored.locked,true);assert.equal(restored.referenceManualGeometry,true);
});
