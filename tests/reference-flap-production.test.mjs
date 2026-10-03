import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,migrate,boundText} from '../src/model.js';
import {REFERENCE_UNIT} from '../src/reference-format.js';
import {updateReferenceFlapProduction,referenceFlapProductionFrame,updateReferenceFrames,markReferenceGeometry,referenceFlowCopy,rebuildReferenceFlow,sanitizeReferenceFlowArchive} from '../src/reference-flow.js';
import {applyReferenceBlocks} from '../src/reference-freeplace.js';
import {setProjectTextColor} from '../src/text-color.js';
import {applyAlbumColors} from '../src/album-colors.js';

const project=(extra={})=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({sb:'1',jh:'w',musicA:'First',musicB:'Second',musicProd:'Credits',...extra}));updateReferenceFlapProduction(p);return p};
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));

test('short-flap production is an independent horizontal block with its own font size',()=>{
 const p=project({fb:'2.2s.4.2s.4',fc:'223344'}),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);
 assert.equal(production.source,'flapProduction');assert.equal(production.rotation,0);assert.equal(production.align,'center');assert.equal(production.autoFit,false);
 assert.equal(production.size,flap.size*.85);assert.equal(production.font,'Times New Roman');assert.equal(production.italic,true);assert.equal(production.color,'#223344');assert.equal(production.referenceOwnColor,true);
 assert.equal(flap.referenceFlapProductionSeparate,true);assert.equal(production.visible,true);
 assert.equal(boundText(p,production,'outer'),'Credits');assert.doesNotMatch(boundText(p,flap,'outer'),/Credits/);assert.match(boundText(p,flap,'outer'),/First.*Second/s);
 assert.equal(updateReferenceFlapProduction(p),production);assert.equal(p.surfaces.outer.filter(layer=>layer.referenceFlapProduction).length,1);
});

test('short-flap production reserves the public barcode area without rotating its text',()=>{
 const p=project(),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction),withoutCode=referenceFlapProductionFrame(p,production);
 p.surfaces.outer.push(makeLayer('barcode',{visible:true}));const withCode=referenceFlapProductionFrame(p,production);
 assert.ok(Math.abs(withoutCode.y-withCode.y-750*REFERENCE_UNIT)<1e-9);assert.equal(withCode.rotation,0);
 assert.ok(Math.abs(withCode.x-14*REFERENCE_UNIT)<1e-9);assert.ok(Math.abs(withCode.w-(p.layout.flap-28*REFERENCE_UNIT))<1e-9);
 p.surfaces.outer.at(-1).visible=false;assert.deepEqual(referenceFlapProductionFrame(p,production),withoutCode);
});

test('ordinary and extended flaps keep production inside their track block',()=>{
 for(const options of [{sb:'0'},{sb:'0',eb:'1'},{sb:'0',tb:'1'}]){const p=project(options),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks');assert.equal(updateReferenceFlapProduction(p),null);assert.equal(flap.referenceFlapProductionSeparate,false);assert.ok(boundText(p,flap,'outer').includes('Credits'))}
});

test('flap shape changes preserve production edits and restore its prior visibility',()=>{
 const p=project(),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);Object.assign(production,{x:42,y:11,w:18,h:9,rotation:23,font:'Georgia',size:4,color:'#ff3300',locked:true});markReferenceGeometry(production);const before=frame(production);
 p.layout.flapShape='extended';updateReferenceFrames(p);assert.equal(production.visible,false);assert.equal(production.referenceFlapProductionHidden,true);assert.deepEqual(frame(production),before);
 const saved=migrate(JSON.parse(JSON.stringify(p)));saved.layout.flapShape='short';updateReferenceFrames(saved);const restored=saved.surfaces.outer.find(layer=>layer.referenceFlapProduction);
 assert.deepEqual(frame(restored),before);assert.equal(restored.visible,true);assert.equal(restored.font,'Georgia');assert.equal(restored.color,'#ff3300');assert.equal(restored.size,4);assert.equal(restored.locked,true);
 restored.visible=false;saved.layout.flapShape='standard';updateReferenceFrames(saved);saved.layout.flapShape='short';updateReferenceFrames(saved);assert.equal(restored.visible,false);
});

test('production display follows the flap option and returns after empty album credits change',()=>{
 const p=project({jh:'0'}),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);
 assert.equal(production.visible,false);flap.trackOptions.showProduction=true;updateReferenceFlapProduction(p);assert.equal(production.visible,true);
 p.data.production='';updateReferenceFlapProduction(p);assert.equal(production.visible,false);p.data.production='New credits';updateReferenceFlapProduction(p);assert.equal(production.visible,true);
 flap.trackOptions.showProduction=false;updateReferenceFlapProduction(p);assert.equal(production.visible,false);
});

test('activating credits preserves transparent text and later restores the shared color',()=>{
 const p=project({jh:'0',color:'clear'}),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);
 assert.equal(production.visible,false);assert.equal(production.referenceHiddenByTextColor,false);flap.trackOptions.showProduction=true;updateReferenceFlapProduction(p);
 assert.equal(production.visible,false);assert.equal(production.referenceHiddenByTextColor,true);assert.equal(production.referenceFlapProductionHidden,undefined);
 setProjectTextColor(p,'#334455');updateReferenceFlapProduction(p);assert.equal(production.visible,true);assert.equal(production.color,'#334455');assert.equal(production.referenceHiddenByTextColor,undefined);
 setProjectTextColor(p,'transparent');updateReferenceFlapProduction(p);assert.equal(production.visible,false);setProjectTextColor(p,'#445566');updateReferenceFlapProduction(p);assert.equal(production.visible,true);
});

test('independent production color survives clear foreground and a new album palette',()=>{
 const p=project({color:'clear',fc:'ee5500'}),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);assert.equal(production.visible,true);assert.equal(production.color,'#ee5500');
 setProjectTextColor(p,'#112233');applyAlbumColors(p,{bg:'#ffffff',fg:'#000000'});updateReferenceFlapProduction(p);assert.equal(production.color,'#ee5500');assert.equal(production.visible,true);
 const saved=migrate(JSON.parse(JSON.stringify(p)));saved.layout.double=!saved.layout.double;rebuildReferenceFlow(saved);updateReferenceFrames(saved);const restored=saved.surfaces.outer.find(layer=>layer.referenceFlapProduction);assert.equal(restored.color,'#ee5500');assert.equal(restored.visible,true);
});

test('manual hidden credits do not become visible after a clear-color cycle',()=>{
 const p=project(),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);production.visible=false;setProjectTextColor(p,'transparent');updateReferenceFlapProduction(p);
 assert.equal(production.referenceHiddenByTextColor,undefined);setProjectTextColor(p,'#112233');updateReferenceFlapProduction(p);assert.equal(production.visible,false);
});

test('copies of short-flap credits stay independent when the source template changes',()=>{
 const p=project(),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction),copy=makeLayer('text',{...referenceFlowCopy(production),x:32,y:21,rotation:37,locked:false});p.surfaces.outer.push(copy);const before=frame(copy);
 assert.equal(copy.referenceFlapProduction,undefined);p.layout.flapShape='extended';updateReferenceFrames(p);assert.deepEqual(frame(copy),before);assert.equal(copy.visible,true);assert.equal(production.visible,false);
 p.layout.flapShape='short';updateReferenceFrames(p);assert.deepEqual(frame(copy),before);assert.equal(copy.source,'flapProduction');
});

test('removing the independent production block does not silently recreate it',()=>{
 const p=project(),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);p.surfaces.outer=p.surfaces.outer.filter(layer=>layer.id!==production.id);
 assert.equal(updateReferenceFlapProduction(p),null);p.layout.flapShape='extended';updateReferenceFrames(p);p.layout.flapShape='short';updateReferenceFrames(p);assert.equal(p.surfaces.outer.some(layer=>layer.referenceFlapProduction),false);
});

test('flapProd transforms only the separate credit block and its copy',()=>{
 const p=project(),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),before=frame(flap),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction);
 p.surfaces.outer.push(makeLayer('text',{source:'production',text:'Unrelated production',x:20,y:30}));
 const params=new URLSearchParams({bx:'bdefault-flapProd_30_40_125_18_10_0_1__~Georgia.4.2s.0.0.150.ee2200|bdefault-flapProd*2_40_50_100_-12_10_0_0'});
 const result=applyReferenceBlocks(p,params);assert.equal(result.applied,2);assert.deepEqual(result.unsupported,[]);assert.deepEqual(frame(flap),before);
 assert.equal(production.referenceBlock,'default-flapProd');assert.equal(production.font,'Georgia');assert.equal(production.color,'#ee2200');assert.equal(production.locked,true);
 const copy=p.surfaces.outer.find(layer=>layer.referenceBlockCopy===2);assert.equal(copy.source,'flapProduction');assert.equal(copy.referenceFlapProduction,undefined);
 const productionFrame=frame(production),copyFrame=frame(copy);updateReferenceFrames(p);assert.deepEqual(frame(production),productionFrame);assert.deepEqual(frame(copy),copyFrame);assert.equal(p.surfaces.outer.find(layer=>layer.source==='production').x,20);
});

test('a complete short-flap URL restores credits and copies before normal editing',()=>{
 const p=project({bx:'bdefault-flapProd_30_40_125_18_10_0_1__~Georgia.4.2s.0.0.150.ee2200|bdefault-flapProd*2_40_50_100_-12_10_0_0'}),production=p.surfaces.outer.find(layer=>layer.referenceFlapProduction),copy=p.surfaces.outer.find(layer=>layer.referenceBlockCopy===2);
 assert.equal(p.referenceFreePlace.applied,2);assert.deepEqual(p.referenceFreePlace.unsupported,[]);assert.equal(production.font,'Georgia');assert.equal(production.color,'#ee2200');assert.equal(production.locked,true);assert.equal(copy.source,'flapProduction');
 assert.equal(boundText(p,production,'outer'),'Credits');assert.equal(boundText(p,copy,'outer'),'Credits');const saved=migrate(JSON.parse(JSON.stringify(p)));updateReferenceFrames(saved);assert.equal(saved.surfaces.outer.filter(layer=>layer.referenceBlock==='default-flapProd').length,2);
});

test('suspended flow identities survive archive restoration without leaking onto a new column',()=>{
 const p=project({ds:'1'}),source=p.surfaces.inner.find(layer=>layer.referenceFlow);source.referenceSuspendedBlock='sideB-inside1';source.referenceFreePlaceToken='session-token';
 p.layout.double=false;rebuildReferenceFlow(p);const archived=p.referenceFlowArchive.find(layer=>layer.id===source.id);assert.equal(archived.referenceSuspendedBlock,'sideB-inside1');assert.equal(archived.referenceFreePlaceToken,'session-token');
 p.layout.columns=2;p.layout.double=true;rebuildReferenceFlow(p);const restored=p.surfaces.inner.find(layer=>layer.id===source.id),newColumn=p.surfaces.inner.find(layer=>layer.referencePanelIndex===source.referencePanelIndex&&layer.referenceColumn===1);
 assert.equal(restored.referenceSuspendedBlock,'sideB-inside1');assert.equal(restored.referenceFreePlaceToken,'session-token');assert.equal(newColumn.referenceSuspendedBlock,undefined);assert.equal(newColumn.referenceFreePlaceToken,undefined);
 p.referenceFlowArchive=[{...restored,referenceSuspendedBlock:'bad_ref',referenceFreePlaceToken:'not a token'}];sanitizeReferenceFlowArchive(p);assert.equal(p.referenceFlowArchive[0].referenceSuspendedBlock,undefined);assert.equal(p.referenceFlowArchive[0].referenceFreePlaceToken,undefined);
});
