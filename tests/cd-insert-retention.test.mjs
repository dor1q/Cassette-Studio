import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,clone,importReference,validateProject,makeLayer,boundText} from '../src/model.js';
import {resetCDSurfaces,updateCDLayout,cdInsertContentActive,cdInsertContentOrder} from '../src/cd-layout.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';
import {flowText,renderSvg} from '../src/render.js';
import {exportImagePages,prepareExport} from '../src/export.js';
import {duplicateSelection} from '../src/selection-edit.js';

const faces=['cdFront','cdInside'];
const content=layer=>layer.source==='cdContents'&&(layer.cdContentFlow||layer.referenceCDContent);
const layers=(p,surface)=>p.surfaces[surface].filter(content);
const slot=(p,surface,panel,column=0)=>layers(p,surface).find(layer=>layer.cdPanelIndex===panel&&(layer.cdColumnIndex||0)===column);
const active=(p,surface)=>layers(p,surface).filter(layer=>cdInsertContentActive(p,layer,surface));
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const appearance=layer=>Object.fromEntries(['id','name','font','fontWeight','fontStretch','size','color','italic','bold','opacity','align','lineHeight','spacing','visible','locked','trackOptions','hideArtist','hideAlbum','hideTracks','hideLyrics','hideA','hideB','showProduction'].filter(key=>Object.hasOwn(layer,key)).map(key=>[key,clone(layer[key])]));
function project(kind){
 const p=kind==='reference'?importReference(createProject(),'https://vhs.texs.org/en/cd-insert?mode=d3&dc=1&color=263238&musicArtist=ARTISTTOKEN&musicAlbum=ALBUMTOKEN'):createProject();
 p.editorMode='cd-insert';Object.assign(p.layout,{cdInsertPanels:3,cdInsertDouble:true,columns:2,columnHeight:100});
 Object.assign(p.data,{artist:'ARTISTTOKEN',album:'ALBUMTOKEN',A:Array.from({length:40},(_,index)=>({title:'TRACKTOKEN'+String(index+1).padStart(2,'0'),seconds:60})),B:[],lyrics:Array.from({length:12},(_,index)=>'LYRICTOKEN'+String(index+1).padStart(2,'0')).join('\n'),production:'PRODUCTION-END'});
 if(kind==='generic')resetCDSurfaces(p,'cd-insert');
 return p;
}
function change(p,patch){const previous=clone(p.layout);Object.assign(p.layout,patch);updateCDLayout(p,'cd-insert',previous);return p.referenceCDContentTemplate?rebuildReferenceCDContents(p):null}
function chunks(p){return faces.flatMap(surface=>active(p,surface).map(layer=>({surface,layer}))).sort((a,b)=>cdInsertContentOrder(p,a.layer,a.surface)-cdInsertContentOrder(p,b.layer,b.surface)).map(({surface,layer})=>flowText(p,layer,surface))}
function verifyDormant(p,surface,layer){
 assert.equal(cdInsertContentActive(p,layer,surface),false);assert.deepEqual(flowText(p,layer,surface),{text:'',overflow:false});
 const rendered=renderSvg(p,surface,{guides:false,editing:true,selected:layer.id});assert.equal(rendered.svg.includes('data-layer="'+layer.id+'"'),false);assert.equal(rendered.svg.includes('s'+surface+'-'+layer.id.replace(/[^a-z0-9]/gi,'')),false);
}

for(const kind of ['generic','reference']){
 test(kind+' insert retains styled second columns through collapse and expansion on both faces',()=>{
  const p=project(kind),targets=faces.map(surface=>({surface,layer:slot(p,surface,3,1)}));
  for(const {layer}of targets)Object.assign(layer,{font:'Georgia',fontWeight:500,fontStretch:90,size:2.4,color:'#fa0000',italic:true,opacity:.6,align:'right',lineHeight:1.8,spacing:.1,visible:false,trackOptions:{numbers:false,durations:false,hideAlbum:true,showProduction:false}});
  const saved=targets.map(({layer})=>clone(layer));change(p,{columns:1});
  for(const [index,{surface,layer}]of targets.entries()){assert.equal(p.surfaces[surface].find(item=>item.id===layer.id),layer);verifyDormant(p,surface,layer);assert.deepEqual(appearance(layer),appearance(saved[index]));}
  change(p,{columns:2});for(const [index,{surface,layer}]of targets.entries()){assert.equal(slot(p,surface,3,1),layer);assert.equal(cdInsertContentActive(p,layer,surface),true);assert.deepEqual(appearance(layer),appearance(saved[index]));assert.deepEqual(frame(layer),frame(saved[index]));}
 });

 test(kind+' insert retains an obsolete styled panel and restores its same slots after 3 to 2 to 3 panels',()=>{
  const p=project(kind),targets=faces.flatMap(surface=>[0,1].map(column=>({surface,layer:slot(p,surface,4,column)})));
  for(const [index,{layer}]of targets.entries())Object.assign(layer,{font:'Georgia',color:'#123456',size:2.1,visible:index%2===0,trackOptions:{hideArtist:true,hideLyrics:true,showProduction:false}});
  const saved=targets.map(({layer})=>clone(layer));change(p,{cdInsertPanels:2});
  for(const [index,{surface,layer}]of targets.entries()){verifyDormant(p,surface,layer);assert.deepEqual(appearance(layer),appearance(saved[index]));assert.equal(p.surfaces[surface].find(item=>item.id===layer.id),layer);}
  change(p,{cdInsertPanels:3});for(const [index,{surface,layer}]of targets.entries()){assert.equal(slot(p,surface,4,layer.cdColumnIndex),layer);assert.deepEqual(appearance(layer),appearance(saved[index]));assert.deepEqual(frame(layer),frame(saved[index]));}
 });

 test(kind+' insert never rewrites locked or manual obsolete content while columns, panels, height and duplex change',()=>{
  for(const state of ['locked','manual']){
   const p=project(kind),surface='cdInside',layer=slot(p,surface,4,1);if(state==='locked')layer.locked=true;else Object.assign(layer,{x:layer.x+3,y:layer.y+2,rotation:7});
   Object.assign(layer,{name:'Keep my exact layer',font:'Georgia',visible:false,trackOptions:{hideTracks:true,showProduction:true}});const saved=clone(layer);
   change(p,{columns:1,cdInsertPanels:2,cdInsertDouble:false});verifyDormant(p,surface,layer);assert.deepEqual(layer,saved);
   change(p,{cdInsertHeight:132,columnHeight:65});assert.deepEqual(layer,saved);
   change(p,{columns:2,cdInsertPanels:3,cdInsertDouble:true});assert.equal(slot(p,surface,4,1),layer);assert.deepEqual(layer,saved);
  }
 });

 test(kind+' insert saves dormant columns and panels and restores all typography using reopened identities',()=>{
  const p=project(kind),target=slot(p,'cdInside',4,1);Object.assign(target,{font:'Georgia',size:2.2,color:'#123456',visible:false,italic:true,trackOptions:{numbers:false,hideLyrics:true,showProduction:false}});
  const savedAppearance=appearance(target);delete savedAppearance.id;const savedFrame=frame(target);change(p,{columns:1,cdInsertPanels:2,cdInsertDouble:false});
  const reopened=validateProject(JSON.parse(JSON.stringify(p))),restored=slot(reopened,'cdInside',4,1),reopenedId=restored.id;assert.ok(restored);verifyDormant(reopened,'cdInside',restored);
  const actual=appearance(restored);delete actual.id;assert.deepEqual(actual,savedAppearance);assert.deepEqual(frame(restored),savedFrame);
  change(reopened,{columns:2,cdInsertPanels:3,cdInsertDouble:true});assert.equal(slot(reopened,'cdInside',4,1),restored);assert.equal(restored.id,reopenedId);const expanded=appearance(restored);delete expanded.id;assert.deepEqual(expanded,savedAppearance);assert.deepEqual(frame(restored),savedFrame);
 });

 test(kind+' insert flows only through current logical panels and columns, despite stale locked indexes and stored layer order',()=>{
  const p=project(kind);for(const surface of faces)for(const layer of layers(p,surface)){layer.size=2;layer.lineHeight=1.2;layer.h=18;layer.locked=true;layer.cdContentIndex=999-layer.cdPanelIndex*7-(layer.cdColumnIndex||0)}
  const original=chunks(p),joined=original.map(chunk=>chunk.text).join('\n');assert.equal(original.at(-1).overflow,false);
  for(const token of [...p.data.A.map(track=>track.title),...p.data.lyrics.split('\n'),'ARTISTTOKEN','ALBUMTOKEN','PRODUCTION-END'])assert.equal(joined.split(token).length-1,1,token);
  for(const surface of faces)p.surfaces[surface].reverse();assert.deepEqual(chunks(p),original);
  change(p,{columns:1,cdInsertPanels:2,cdInsertDouble:false});assert.equal(active(p,'cdFront').length,1);assert.equal(active(p,'cdInside').length,0);
  for(const surface of faces)for(const layer of layers(p,surface).filter(layer=>!cdInsertContentActive(p,layer,surface)))verifyDormant(p,surface,layer);
  const reduced=chunks(p);assert.equal(reduced.length,1);assert.equal(reduced[0].overflow,true);assert.match(renderSvg(p,'cdFront',{guides:false}).warnings.join('\n'),/Содержание CD не помещается/);
  assert.throws(()=>prepareExport(p,{guides:false}),/Содержание CD не помещается/);change(p,{columns:2,cdInsertPanels:3,cdInsertDouble:true});assert.deepEqual(chunks(p),original);
  const before=JSON.stringify(p),pages=exportImagePages(p,{guides:false});assert.equal(pages.length,2);for(const page of pages){assert.equal(page.warnings.length,0);assert.ok(new Resvg(page.svg,{fitTo:{mode:'width',value:600}}).render().asPng().length>1000)}assert.equal(JSON.stringify(p),before);
 });
}

test('new generic insert columns inherit hidden visibility, while independent manual copies and other formats remain intact',()=>{
 const p=project('generic');change(p,{columns:1});p.surfaces.cdFront=p.surfaces.cdFront.filter(layer=>!content(layer)||layer.cdColumnIndex===0);
 for(const surface of faces)for(const layer of layers(p,surface))layer.visible=false;
 const manual=makeLayer('text',{name:'Manual copy',text:'COPYTOKEN',x:8,y:8,w:40,h:10}),cassette=clone(p.surfaces.outer),disc=clone(p.surfaces.cdLabel);p.surfaces.cdFront.push(manual);const saved=clone(manual);
 change(p,{columns:2});assert.ok(layers(p,'cdFront').every(layer=>layer.visible===false));assert.ok(!renderSvg(p,'cdFront',{guides:false}).svg.includes('TRACKTOKEN'));assert.ok(renderSvg(p,'cdFront',{guides:false}).svg.includes('COPYTOKEN'));
 change(p,{columns:1,cdInsertPanels:1,cdInsertDouble:false});assert.deepEqual(manual,saved);assert.ok(renderSvg(p,'cdFront',{guides:false}).svg.includes('COPYTOKEN'));assert.deepEqual(p.surfaces.outer,cassette);assert.deepEqual(p.surfaces.cdLabel,disc);
});

test('legacy insert contents without logical panel metadata keep their established flow ordering',()=>{
 const p=createProject();p.layout.cdInsertDouble=true;p.data.A=[{title:'LEGACYTOKEN',seconds:60}];p.data.B=[];p.data.artist='';p.data.album='';p.data.lyrics='';p.data.production='PRODUCTION-END';
 const layer=index=>makeLayer('text',{source:'cdContents',referenceCDContent:true,cdContentIndex:index,x:4,y:4,w:110,h:index?100:5,size:3,autoFit:false});const first=layer(0),last=layer(1);p.surfaces.cdFront=[first];p.surfaces.cdInside=[last];
 assert.equal(cdInsertContentActive(p,first,'cdFront'),true);assert.equal(flowText(p,last,'cdInside').overflow,false);assert.equal((flowText(p,first,'cdFront').text+'\n'+flowText(p,last,'cdInside').text).split('LEGACYTOKEN').length-1,1);
 assert.equal(boundText(p,first,'cdFront').split('LEGACYTOKEN').length-1,1);
});

test('manual copies of generic and imported standard CD headings keep binding and styling but lose reset identity markers',()=>{
 for(const kind of ['generic','reference']){
  const p=kind==='reference'?importReference(createProject(),'https://vhs.texs.org/en/cd?musicArtist=ARTISTTOKEN&musicAlbum=ALBUMTOKEN'):createProject(),original=p.surfaces.cdLabel.find(layer=>layer.source==='artist');
  assert.equal(kind==='reference'?original.referenceCDStandard:original.cdTemplate,true);const saved=clone(original),[copy]=duplicateSelection(p,original,'cdLabel',{joined:false});
  assert.equal(copy.cdTemplate,undefined);assert.equal(copy.referenceCDStandard,undefined);assert.equal(copy.source,'artist');for(const key of ['font','size','color','opacity','visible','locked'])assert.deepEqual(copy[key],original[key]);assert.deepEqual(original,saved);
 }
});

test('new CD free-place content copies capture their visible segment and remain independent during all insert reflow',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/cd-insert?mode=s2&musicA=FREEPLACETOKEN+%281%3A00%29&bx=bdefault-tracklist*2_50_70_100_0_80_0_0');
 const original=layers(p,'cdFront')[0],copy=p.surfaces.cdFront.find(layer=>layer.referenceBlockCopy),expected=flowText(p,original,'cdFront').text,saved=clone(copy);
 assert.ok(expected.includes('FREEPLACETOKEN'));assert.equal(copy.source,undefined);assert.equal(copy.referenceCDContent,undefined);assert.equal(copy.referenceCDStandard,undefined);assert.equal(copy.text,expected);assert.equal(flowText(p,copy,'cdFront').text,expected);
 change(p,{columns:2,cdInsertPanels:3});change(p,{columns:1,cdInsertPanels:1,cdInsertDouble:false});assert.deepEqual(copy,saved);assert.equal(flowText(p,copy,'cdFront').text,expected);assert.ok(renderSvg(p,'cdFront',{guides:false}).svg.includes('FREEPLACETOKEN'));
});

test('legacy CD free-place copies never consume original insert flow or alter their geometry and styling',()=>{
 const p=project('reference'),original=slot(p,'cdFront',3,0),expected=flowText(p,original,'cdFront').text,copy={...clone(original),id:'legacy-copy',referenceBlockCopy:2,x:22,y:17,w:61,h:33,size:1.5,color:'#123456'};
 p.surfaces.cdFront.unshift(copy);const saved=clone(copy),initial=chunks(p);assert.equal(flowText(p,copy,'cdFront').text,expected);assert.equal(flowText(p,original,'cdFront').text,expected);
 assert.deepEqual(chunks(p),initial);change(p,{columns:1,cdInsertPanels:2});assert.deepEqual(copy,saved);assert.equal(cdInsertContentActive(p,copy,'cdFront'),true);
 change(p,{columns:2,cdInsertPanels:3});assert.deepEqual(copy,saved);assert.equal(flowText(p,original,'cdFront').text,expected);assert.equal(flowText(p,copy,'cdFront').text,expected);
 assert.equal(p.surfaces.cdFront.filter(layer=>layer.id==='legacy-copy').length,1);
});
