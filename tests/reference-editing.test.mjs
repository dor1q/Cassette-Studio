import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,migrate,boundText} from '../src/model.js';
import {rebuildReferenceFlow,referenceFlowCopy,findReferenceFlowCopySource,markReferenceGeometry,updateReferenceFrames,referenceFlowLayers,sanitizeReferenceFlowArchive} from '../src/reference-flow.js';
import {restoreReferenceFonts} from '../src/reference-assets.js';
import {flowText,renderSvg} from '../src/render.js';

const project=()=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p4&ds=1');return p};
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));

test('manual and locked reference content frames survive layout changes',()=>{
 const p=project(),outer=p.surfaces.outer.find(layer=>layer.referenceFlow),inner=p.surfaces.inner.find(layer=>layer.referenceFlow);
 Object.assign(outer,{x:42,y:13,w:23,h:45,rotation:17});markReferenceGeometry(outer);
 Object.assign(inner,{x:18,y:5,w:31,h:29,rotation:-12,locked:true});
 const outerFrame=frame(outer),innerFrame=frame(inner);p.layout.columns=2;p.layout.height=120;rebuildReferenceFlow(p);
 assert.deepEqual(frame(p.surfaces.outer.find(layer=>layer.id===outer.id)),outerFrame);
 assert.deepEqual(frame(p.surfaces.inner.find(layer=>layer.id===inner.id)),innerFrame);
 assert.equal(p.surfaces.inner.find(layer=>layer.id===inner.id).locked,true);
 const saved=migrate(p);assert.equal(saved.surfaces.outer.find(layer=>layer.referencePanelIndex===outer.referencePanelIndex&&layer.referenceColumn===0).referenceManualGeometry,true);
});

test('new automatic columns do not inherit a free or locked template frame',()=>{
 const p=project(),layer=p.surfaces.outer.find(layer=>layer.referenceFlow);
 Object.assign(layer,{x:42,y:13,w:23,h:45,rotation:17,locked:true,referenceBlock:'default-inside1',visible:false});markReferenceGeometry(layer);
 p.layout.columns=2;rebuildReferenceFlow(p);
 const original=p.surfaces.outer.find(next=>next.referenceColumn===0),added=p.surfaces.outer.find(next=>next.referenceColumn===1);
 assert.deepEqual(frame(original),frame(layer));assert.equal(original.visible,false);
 assert.equal(added.locked,false);assert.equal(added.referenceBlock,undefined);assert.equal(added.referenceManualGeometry,undefined);assert.equal(added.visible,true);assert.equal(added.rotation,0);assert.notEqual(added.x,layer.x);
});

test('manually positioned flap and spine frames survive changes to the template',()=>{
 const p=project(),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),spine=p.surfaces.outer.find(layer=>layer.referenceSpine);
 for(const layer of [flap,spine]){Object.assign(layer,{x:4,y:9,w:27,h:34,rotation:13});markReferenceGeometry(layer)}
 const before=[frame(flap),frame(spine)];p.layout.flapShape='extended';p.layout.flap=65;p.layout.height=120;updateReferenceFrames(p);
 assert.deepEqual([frame(flap),frame(spine)],before);
 const independent=makeLayer('text');markReferenceGeometry(independent);assert.equal(independent.referenceManualGeometry,undefined);
});

test('flow copies keep their surface panel and column when global indices change',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow),copy=makeLayer('text',referenceFlowCopy(source));p.surfaces.outer.push(copy);
 assert.deepEqual(copy.referenceFlowCopySource,{surface:'inner',panel:source.referencePanelIndex,column:source.referenceColumn});
 p.layout.panels=5;p.layout.columns=2;rebuildReferenceFlow(p);
 const found=findReferenceFlowCopySource(p,copy);assert.equal(found.surface,'inner');assert.equal(found.layer.referencePanelIndex,source.referencePanelIndex);assert.equal(found.layer.referenceColumn,source.referenceColumn);assert.notEqual(found.layer.flowIndex,copy.referenceFlowCopyIndex);
 const saved=migrate(p),savedCopy=saved.surfaces.outer.find(layer=>layer.referenceFlowCopySource);assert.deepEqual(savedCopy.referenceFlowCopySource,copy.referenceFlowCopySource);assert.equal(findReferenceFlowCopySource(saved,savedCopy).surface,'inner');
});

test('legacy flow copies gain a stable source before reflow renumbers their origin',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow),copy=makeLayer('text',{...referenceFlowCopy(source),referenceFlowCopySource:undefined});p.surfaces.inner.push(copy);
 assert.equal(findReferenceFlowCopySource(p,copy).layer.id,source.id);p.layout.panels=5;rebuildReferenceFlow(p);
 assert.deepEqual(copy.referenceFlowCopySource,{surface:'inner',panel:source.referencePanelIndex,column:source.referenceColumn});assert.equal(findReferenceFlowCopySource(p,copy).layer.referencePanelIndex,source.referencePanelIndex);
});

test('a missing stable copy source never resolves to an unrelated legacy index',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow),copy=referenceFlowCopy(source);
 p.layout.double=false;rebuildReferenceFlow(p);assert.equal(findReferenceFlowCopySource(p,copy),null);
});

test('rendered copies continue to match their original viewport after panel changes',()=>{
 const p=project();p.data.lyrics=Array.from({length:500},(_,index)=>'Line '+String(index).padStart(3,'0')).join('\n');
 const source=p.surfaces.inner.find(layer=>layer.referenceFlow),copy=makeLayer('text',{...referenceFlowCopy(source),name:'Viewport copy'});p.surfaces.outer.push(copy);
 const before=flowText(p,copy,'outer');assert.deepEqual(before,flowText(p,source,'inner'));
 p.layout.panels=5;rebuildReferenceFlow(p);const next=findReferenceFlowCopySource(p,copy);
 const expected=flowText(p,next.layer,next.surface),actual=flowText(p,copy,'outer');assert.deepEqual(actual,expected);assert.notEqual(actual.text,before.text);
 const firstLine=actual.text.split('\n')[0];assert.ok(renderSvg(p,'outer').svg.includes('>'+firstLine+'<'));
});

test('hidden original viewports reserve their text and visible copies display it',()=>{
 const p=project();p.layout.panels=5;rebuildReferenceFlow(p);p.data.lyrics=Array.from({length:500},(_,index)=>'Line '+String(index).padStart(3,'0')).join('\n');
 const viewports=Object.entries(p.surfaces).flatMap(([surface,layers])=>layers.filter(layer=>layer.referenceFlow).map(layer=>({surface,layer}))),source=viewports[0],before=viewports.map(({surface,layer})=>flowText(p,layer,surface));
 source.layer.visible=false;const copy=makeLayer('text',{...referenceFlowCopy(source.layer),name:'Visible copy of hidden original',visible:true});p.surfaces.inner.push(copy);
 assert.deepEqual(flowText(p,copy,'inner'),before[0]);
 assert.deepEqual(viewports.map(({surface,layer})=>flowText(p,layer,surface)),before);
 const firstLine=before[0].text.split('\n').find(line=>line.startsWith('Line '));assert.ok(firstLine);assert.ok(renderSvg(p,'inner').svg.includes('>'+firstLine+'<'));assert.ok(!renderSvg(p,'outer').svg.includes('>'+firstLine+'<'));
});

test('duplex off and on restores manual geometry style lock and stable identity after saving',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow);Object.assign(source,{x:19,y:11,w:25,h:20,rotation:7,locked:true,font:'Times New Roman',size:4,color:'#cc2200',referenceOwnColor:true,visible:false});markReferenceGeometry(source);
 const before=frame(source);p.layout.double=false;rebuildReferenceFlow(p);assert.equal(p.surfaces.inner.some(layer=>layer.referenceFlow),false);assert.ok(p.referenceFlowArchive.some(layer=>layer.id===source.id));
 const saved=migrate(JSON.parse(JSON.stringify(p)));saved.layout.double=true;rebuildReferenceFlow(saved);const restored=saved.surfaces.inner.find(layer=>layer.id===source.id);
 assert.ok(restored);assert.deepEqual(frame(restored),before);assert.equal(restored.locked,true);assert.equal(restored.visible,false);assert.equal(restored.font,'Times New Roman');assert.equal(restored.size,4);assert.equal(restored.color,'#cc2200');assert.equal(restored.referenceOwnColor,true);assert.equal(saved.referenceFlowArchive.some(layer=>layer.id===source.id),false);
});

test('temporarily removed panels and columns restore their styles and remain outside rendering while inactive',()=>{
 const p=project();p.layout.panels=8;p.layout.columns=2;rebuildReferenceFlow(p);p.data.lyrics='UNIQUE ARCHIVED CONTENT';
 const source=p.surfaces.outer.find(layer=>layer.referencePanelIndex===7&&layer.referenceColumn===1);Object.assign(source,{x:28,y:18,w:17,h:28,rotation:5,bold:true,fontWeight:900});markReferenceGeometry(source);
 p.layout.panels=3;p.layout.columns=1;p.layout.double=false;rebuildReferenceFlow(p);
 assert.equal(Object.values(p.surfaces).flat().filter(layer=>layer.referenceFlow).length,0);assert.ok(p.referenceFlowArchive.length<=32);assert.ok(p.referenceFlowArchive.every(layer=>layer.type==='text'));assert.ok(!renderSvg(p,'outer').svg.includes('UNIQUE ARCHIVED CONTENT'));
 p.layout.panels=8;p.layout.columns=2;p.layout.double=true;rebuildReferenceFlow(p);const restored=p.surfaces.outer.find(layer=>layer.id===source.id);
 assert.ok(restored);assert.deepEqual(frame(restored),frame(source));assert.equal(restored.fontWeight,900);assert.equal(restored.bold,true);assert.equal(p.referenceFlowArchive.length,0);
});

test('an initially blank three-panel template can create its first inside viewport later',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p3&fi=2.2s.4.2s.0');assert.equal(Object.values(p.surfaces).flat().some(layer=>layer.referenceFlow),false);
 assert.equal(p.referenceFlowTemplate.font,'Times New Roman');p.layout.double=true;rebuildReferenceFlow(p);assert.equal(p.surfaces.inner.filter(layer=>layer.referenceFlow).length,1);assert.equal(p.surfaces.inner.find(layer=>layer.referenceFlow).font,'Times New Roman');
});

test('shared flow changes reach archived slots and the saved template before restoration',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow);p.layout.double=false;rebuildReferenceFlow(p);
 const all=referenceFlowLayers(p);assert.ok(all.includes(p.referenceFlowTemplate));assert.ok(all.some(layer=>layer.id===source.id));
 for(const layer of all){layer.hideA=true;layer.trackOptions={...layer.trackOptions,showProduction:false};if(!layer.referenceOwnColor)layer.color='#112233'}
 p.layout.double=true;rebuildReferenceFlow(p);const restored=p.surfaces.inner.find(layer=>layer.id===source.id);assert.equal(restored.hideA,true);assert.equal(restored.trackOptions.showProduction,false);assert.equal(restored.color,'#112233');
});

test('a new imported template discards archived styles from the previous design',()=>{
 const p=project(),source=p.surfaces.inner.find(layer=>layer.referenceFlow);Object.assign(source,{x:19,y:11,locked:true,font:'Old Font'});markReferenceGeometry(source);p.layout.double=false;rebuildReferenceFlow(p);assert.ok(p.referenceFlowArchive.length);
 importReference(p,'https://vhs.texs.org/en/jcard?face=p4&ds=1&fi=2.2s.4.2s.0');assert.equal(p.referenceFlowArchive.length,0);assert.equal(p.referenceFlowTemplate.font,'Times New Roman');assert.ok(p.surfaces.inner.every(layer=>layer.id!==source.id&&layer.font!=='Old Font'&&!layer.referenceManualGeometry&&!layer.locked));
});

test('archive sanitizer accepts only bounded text slots and safe rendering properties',()=>{
 const p=project(),base=p.surfaces.inner.find(layer=>layer.referenceFlow),bad={...base,id:'archive-valid',x:Infinity,y:-99999,w:99999,h:-1,size:999,fontStretch:999,opacity:999,lineHeight:999,spacing:999,outline:999,shadow:999,color:'url(unsafe)',outlineColor:'url(unsafe)',shadowColor:'bad',font:'F'.repeat(300),text:'T'.repeat(100001),src:'data:image/png;base64,AAAA',unknown:'unsafe',trackOptions:{showProduction:'true',hideTracks:true,sideA:'S'.repeat(300),unknown:'unsafe'}};
 p.referenceFlowArchive=[bad,{...bad,id:'duplicate-slot'},{...bad,type:'image'},{...bad,referencePanelIndex:9}];p.referenceFlowTemplate={...bad,referenceFlow:false};sanitizeReferenceFlowArchive(p);
 assert.equal(p.referenceFlowArchive.length,1);const clean=p.referenceFlowArchive[0];assert.equal(clean.id,'archive-valid');assert.equal(clean.x,2000);assert.equal(clean.y,-2000);assert.equal(clean.w,1500);assert.equal(clean.h,.1);assert.equal(clean.size,100);assert.equal(clean.fontStretch,200);assert.equal(clean.opacity,1);assert.equal(clean.lineHeight,4);assert.equal(clean.spacing,10);assert.equal(clean.outline,2);assert.equal(clean.shadow,5);assert.equal(clean.color,'#000000');assert.equal(clean.outlineColor,'#000000');assert.equal(clean.shadowColor,'#000000');assert.equal(clean.font.length,200);assert.equal(clean.text.length,100000);assert.equal(clean.src,undefined);assert.equal(clean.unknown,undefined);assert.equal(clean.trackOptions.showProduction,undefined);assert.equal(clean.trackOptions.hideTracks,true);assert.equal(clean.trackOptions.sideA.length,200);assert.equal(clean.trackOptions.unknown,undefined);assert.equal(p.referenceFlowTemplate.src,undefined);
});

test('independent spine album fonts are downloaded with their own variant',async()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?f2=1.2s.4.2s.0&f3=~Roboto+Flex.2s.7.2s.4&fb=1.2s.4.2s.0&fi=1.2s.4.2s.0');const calls=[];
 const result=await restoreReferenceFonts(p,async path=>{calls.push(path);if(path==='/api/fonts')return [{name:'Roboto Flex',variants:['700','700i']}];return {name:'Roboto Flex',weight:700,style:'italic',data:'data:font/woff2;base64,AAAA'}});
 assert.deepEqual(result,{restored:1,missing:[]});assert.deepEqual(calls,['/api/fonts','/api/font?name=Roboto+Flex&variant=700i']);assert.equal(p.fonts[0].style,'italic');
 const again=await restoreReferenceFonts(p,async()=>{throw Error('An embedded variant must not download again')});assert.deepEqual(again,{restored:0,missing:[]});
});

test('unavailable independent album fonts appear in the missing-font report',async()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?f2=1.2s.4.2s.0&f3=~Album+Font.2s.7.2s.0&fb=1.2s.4.2s.0&fi=1.2s.4.2s.0');
 assert.deepEqual(await restoreReferenceFonts(p,async()=>[]),{restored:0,missing:['Album Font']});
});

test('continuous content shows production once and respects its explicit visibility option',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?ds=1&musicA=SongA&musicB=SongB&musicProd=Credits&musicLyrics=Lyrics');const layer=p.surfaces.outer.find(layer=>layer.referenceFlow);
 const count=()=>boundText(p,layer,'outer').split('Credits').length-1;
 assert.equal(count(),1);layer.trackOptions.showProduction=false;assert.equal(count(),0);assert.match(boundText(p,layer,'outer'),/SongA.*SongB.*Lyrics/s);
 layer.trackOptions.showProduction=true;assert.equal(count(),1);layer.trackOptions.hideTracks=true;assert.equal(count(),1);assert.doesNotMatch(boundText(p,layer,'outer'),/SongA|SongB/);
});
