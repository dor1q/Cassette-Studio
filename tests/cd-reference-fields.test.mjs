import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,validateProject,clone,makeLayer,panelRects,dimensions,boundText} from '../src/model.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {renderSvg} from '../src/render.js';

const unit=25.4/600;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≠ ${expected}`);
const imported=(route,params={})=>{const project=createProject();importReference(project,'https://vhs.texs.org/en/'+route+'?'+new URLSearchParams({musicArtist:'ARTISTTOKEN',musicAlbum:'ALBUMTOKEN',musicA:'TRACKTOKEN (1:00)',...params}));return project};
const expand=project=>{const previous={...project.layout};Object.assign(project.layout,{cdInsertPanels:3,columns:2,cdInsertDouble:true});updateCDLayout(project,'cd-insert',previous);return rebuildReferenceCDContents(project)};

test('cover-only stored CD template is sanitized before it can produce future content layers',()=>{
 const project=imported('cd-insert',{mode:'s1'});
 Object.assign(project.referenceCDContentTemplate,{size:1000,fontWeight:9999,fontStretch:900,lineHeight:99,x:99999,y:-99999,w:90000,h:90000,opacity:99,spacing:999,outline:80,shadow:100,color:'url(https://example.com/paint.svg)',outlineColor:'red',shadowColor:'var(--bad)',align:'bad',src:'https://example.com/unsafe.png',referenceFlow:true,referenceCDContentFrame:{x:100000},unknown:{data:'do not copy'},trackOptions:{numbers:false,hideLyrics:true,inlineTracks:false,src:'https://example.com',showProduction:'false',unknown:{value:1}}});
 const saved=validateProject(project),template=saved.referenceCDContentTemplate;
 assert.equal(template.size,100);assert.equal(template.fontWeight,900);assert.equal(template.color,'#000000');assert.equal(template.align,'left');assert.deepEqual(template.trackOptions,{numbers:false,inlineTracks:false,hideLyrics:true});
 for(const key of ['src','referenceFlow','referenceCDContentFrame','unknown'])assert.equal(Object.hasOwn(template,key),false);
 expand(saved);
 for(const layer of [...saved.surfaces.cdFront,...saved.surfaces.cdInside].filter(layer=>layer.referenceCDContent)){
  assert.equal(layer.size,100);assert.ok(layer.w<130&&layer.h<130);assert.equal(layer.color,'#000000');assert.equal(layer.trackOptions.hideLyrics,true);assert.equal(Object.hasOwn(layer,'src'),false);assert.equal(Object.hasOwn(layer,'unknown'),false);
 }
 assert.doesNotMatch(renderSvg(saved,'cdFront',{guides:false}).svg,/https:\/\/example\.com/);
});

test('valid retained CD fonts and section visibility survive reopening and subsequent expansion',()=>{
 const project=imported('cd-insert',{mode:'s1',fi:'~Nunito+Sans.2s.6.2s.4'}),template=project.referenceCDContentTemplate;
 Object.assign(template,{color:'rainbow',font:'Nunito Sans',size:2.6,italic:true,referenceOwnColor:true,hideArtist:true,hideAlbum:false,hideA:false,hideB:true,hideLyrics:true});
 template.trackOptions={...template.trackOptions,hideTracks:false,hideLyrics:true,showProduction:false,artists:true};
 const saved=validateProject(JSON.parse(JSON.stringify(project)));expand(saved);
 const layers=[...saved.surfaces.cdFront,...saved.surfaces.cdInside].filter(layer=>layer.referenceCDContent);assert.equal(layers.length,10);
 for(const layer of layers){
  assert.equal(layer.font,'Nunito Sans');near(layer.size,2.6);assert.equal(layer.italic,true);assert.equal(layer.color,'rainbow');assert.equal(layer.referenceOwnColor,true);assert.equal(layer.hideArtist,true);assert.equal(layer.hideAlbum,false);assert.equal(layer.hideB,true);assert.equal(layer.trackOptions.hideLyrics,true);assert.equal(layer.trackOptions.showProduction,false);
  assert.doesNotMatch(boundText(saved,layer,'cdFront'),/ARTISTTOKEN/);assert.match(boundText(saved,layer,'cdFront'),/ALBUMTOKEN/);
 }
});

test('malformed retained CD templates are discarded and nonfinite styles use finite text defaults',()=>{
 for(const template of [null,[],42,'invalid',{type:'image',source:'cdContents',src:'https://example.com'},{type:'text',source:'lyrics'}]){
  const project=imported('cd-insert',{mode:'s1'});project.referenceCDContentTemplate=template;
  const saved=validateProject(project);assert.equal(Object.hasOwn(saved,'referenceCDContentTemplate'),false);assert.doesNotThrow(()=>expand(saved));
 }
 const project=imported('cd-insert',{mode:'s1'});Object.assign(project.referenceCDContentTemplate,{size:Infinity,lineHeight:NaN,font:{bad:true},fontWeight:Infinity});project.referenceCDContentTemplate.trackOptions=['hideTracks'];
 const saved=validateProject(project);assert.equal(saved.referenceCDContentTemplate.font,'Arial');assert.equal(saved.referenceCDContentTemplate.size,3);assert.equal(saved.referenceCDContentTemplate.lineHeight,1.4);assert.equal(Object.hasOwn(saved.referenceCDContentTemplate,'trackOptions'),false);expand(saved);
 assert.ok(saved.surfaces.cdInside.every(layer=>Number.isFinite(layer.size)&&Number.isFinite(layer.lineHeight)));
});

test('double-sided original CD Tray imports an independent centered production block on the inside',()=>{
 for(const key of ['musicProd','musicPL']){
  const project=imported('cd-tray',{ds:'1',[key]:'PRODUCTIONTOKEN\nSecond line'}),layers=project.surfaces.cdTrayInside;
  assert.equal(layers.length,1);const production=layers[0],panel=panelRects(project,'cdTrayInside').find(panel=>panel.index===2),pad=120*unit;
  assert.equal(production.source,'production');assert.equal(production.cdTrayInsideProduction,true);assert.equal(production.align,'center');assert.equal(production.opacity,.5);near(production.size,60*unit);near(production.x,panel.x+pad);near(production.y,pad);near(production.w,panel.w-2*pad);near(production.h,dimensions(project,'cdTrayInside').h-2*pad);
  assert.equal(boundText(project,production,'cdTrayInside'),'PRODUCTIONTOKEN\nSecond line');project.data.production='CHANGEDCREDIT';assert.equal(boundText(project,production,'cdTrayInside'),'CHANGEDCREDIT');
  const rendered=renderSvg(project,'cdTrayInside',{guides:false});assert.match(rendered.svg,/CHANGEDCREDIT/);assert.doesNotMatch(rendered.svg,/ARTISTTOKEN|ALBUMTOKEN|TRACKTOKEN/);
  assert.ok(project.surfaces.cdTray.some(layer=>layer.source==='cdTracks'));
 }
});

test('disabling original CD Tray inside printing retains its production and custom layers for reenabling',()=>{
 const project=imported('cd-tray',{ds:'1',musicProd:'CREDIT'}),production=project.surfaces.cdTrayInside[0],manual=makeLayer('text',{text:'Manual text',locked:true,x:8,y:9,w:20,h:10});
 production.font='Georgia';production.x+=2;project.surfaces.cdTrayInside.push(manual);const original=clone(project.surfaces.cdTrayInside);
 let previous={...project.layout};project.layout.cdTrayDouble=false;updateCDLayout(project,'cd-tray',previous);rebuildReferenceCDContents(project);assert.deepEqual(project.surfaces.cdTrayInside,original);
 previous={...project.layout};project.layout.cdTrayDouble=true;updateCDLayout(project,'cd-tray',previous);rebuildReferenceCDContents(project);assert.deepEqual(project.surfaces.cdTrayInside,original);
 const single=imported('cd-tray',{ds:'0',musicProd:'CREDIT'});assert.deepEqual(single.surfaces.cdTrayInside,[]);
});
