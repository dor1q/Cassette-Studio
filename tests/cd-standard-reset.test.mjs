import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/model.js';
import * as formats from '../src/media-formats.js';
import {resetCDStandardBlocks} from '../src/cd-standard-reset.js';
import {resetCDSurfaces,updateCDLayout} from '../src/cd-layout.js';
import {flowText} from '../src/render.js';
import {duplicateSelection} from '../src/selection-edit.js';
import {setCDContentOption} from '../src/cd-content-edit.js';
const imported=route=>model.importReference(model.createProject(),`https://vhs.texs.org/en/${route}?mode=d3&ds=1&dc=1&musicArtist=ARTISTTOKEN&musicAlbum=ALBUMTOKEN&musicA=TRACKTOKEN&musicProd=CREDITSTOKEN`);
test('repositioning standard CD blocks retains manual artwork, codes, copies and type styles',()=>{
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const p=model.createProject(),face=formats.modeDefaultSurface(mode),standard=p.surfaces[face].find(layer=>layer.cdTemplate),reference=model.clone(standard);p.editorMode=mode;
  const manual=[model.makeLayer('image',{name:'Cover',src:'data:image/png;base64,AA=='}),model.makeLayer('qr',{text:'https://example.com'}),model.makeLayer('text',{text:'CUSTOMTOKEN'}),...duplicateSelection(p,standard,face)];p.surfaces[face].push(...manual);
  standard.x+=12;standard.y+=3;Object.assign(standard,{font:'Georgia',color:'#ae0039',size:4,visible:true});const before=model.clone(manual),other=model.clone(p.surfaces.outer);
  const result=resetCDStandardBlocks(p,mode);assert.ok(result.updated);assert.equal(standard.x,reference.x);assert.equal(standard.y,reference.y);assert.equal(standard.id,reference.id);assert.equal(standard.font,'Georgia');assert.equal(standard.color,'#ae0039');assert.equal(standard.size,4);assert.equal(standard.visible,true);
  for(const layer of before)assert.deepEqual(p.surfaces[face].find(next=>next.id===layer.id),layer);assert.deepEqual(p.surfaces.outer,other);
 }
});
test('locked standard layers are retained exactly without duplicate replacements',()=>{
 const p=model.createProject(),layer=p.surfaces.cdLabel[0];layer.locked=true;layer.x+=11;const before=model.clone(layer),sameSource=p.surfaces.cdLabel.filter(next=>next.source===layer.source).length;
 const result=resetCDStandardBlocks(p,'cd-label');assert.ok(result.locked);assert.deepEqual(p.surfaces.cdLabel.find(next=>next.id===layer.id),before);assert.equal(p.surfaces.cdLabel.filter(next=>next.source===layer.source).length,sameSource);
});
test('imported contents reset to one standard flow with preserved style and manual layers',()=>{
 const p=imported('cd-insert'),old=p.surfaces.cdFront.find(layer=>layer.referenceCDContent),id=old.id;old.x+=9;old.font='Georgia';old.trackOptions.numbers=false;p.surfaces.cdFront.push(model.makeLayer('text',{text:'CUSTOMTOKEN'}));
 resetCDStandardBlocks(p,'cd-insert');const next=p.surfaces.cdFront.find(layer=>layer.id===id);assert.equal(next.font,'Georgia');assert.equal(next.trackOptions.numbers,false);assert.equal(next.cdContentFlow,true);assert.equal(next.referenceCDContent,undefined);assert.equal(p.referenceCDContentTemplate,undefined);
 const flow=['cdFront','cdInside'].flatMap(face=>p.surfaces[face].filter(layer=>layer.cdContentFlow).map(layer=>flowText(p,layer,face).text)).join('\n');assert.equal((flow.match(/TRACKTOKEN/g)||[]).length,1);assert.ok(p.surfaces.cdFront.some(layer=>layer.text==='CUSTOMTOKEN'));
});
test('one locked imported content column protects its whole linked family from replacement',()=>{
 const p=imported('cd-insert'),family=['cdFront','cdInside'].flatMap(face=>p.surfaces[face].filter(layer=>layer.referenceCDContent));family[0].locked=true;const before=model.clone(family),archive=model.clone(p.referenceCDContentTemplate);
 const result=resetCDStandardBlocks(p,'cd-insert');assert.equal(result.locked,1);assert.deepEqual(['cdFront','cdInside'].flatMap(face=>p.surfaces[face].filter(layer=>layer.referenceCDContent)),before);assert.deepEqual(p.referenceCDContentTemplate,archive);assert.equal(Object.values(p.surfaces).flat().filter(layer=>layer.cdContentFlow).length,0);
});
test('old bound manual blocks occupy their slots and an original inside keeps only its production block',()=>{
 const p=imported('cd'),before=model.clone(p.surfaces.cdLabel);for(const layer of p.surfaces.cdLabel){delete layer.referenceCDStandard;delete layer.cdTemplate}
 resetCDStandardBlocks(p,'cd-label');for(const layer of before)assert.ok(p.surfaces.cdLabel.some(next=>next.id===layer.id));for(const source of ['artist','album','production','cdTracks'])assert.equal(p.surfaces.cdLabel.filter(layer=>layer.source===source).length,1);
 const tray=imported('cd-tray'),inside=model.clone(tray.surfaces.cdTrayInside);resetCDStandardBlocks(tray,'cd-tray');assert.deepEqual(tray.surfaces.cdTrayInside,inside);
});
test('the actual CD reposition command uses one undo step and preserves unrelated reference archives',()=>{
 const p=model.createProject();p.editorMode='cd-insert';p.referenceFlowArchive={sentinel:'CASSETTE'};p.surfaces.cdFront.push(model.makeLayer('image',{src:'data:image/png;base64,AA=='}));const before=model.clone(p),history=[],saved=[],toasts=[];
 const context=vm.createContext({...model,...formats,resetCDSurfaces,resetCDStandardBlocks,p,mode:'cd-insert',surface:'cdFront',selected:'',layers:()=>p.surfaces.cdFront,checkpoint:()=>history.push(model.clone(p)),full(){},changed:()=>saved.push(model.clone(p)),toast:message=>toasts.push(message)});
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.runInContext(app.slice(app.indexOf('function cdAction('),app.indexOf('\nfunction uiAction(')),context);context.cdAction('cd-reset-blocks',{dataset:{}});
 assert.equal(history.length,1);assert.equal(saved.length,1);assert.deepEqual(history[0],before);assert.deepEqual(p.referenceFlowArchive,before.referenceFlowArchive);assert.match(toasts[0],/Свои картинки и текст сохранены/);assert.equal(p.surfaces.cdFront.at(-1).type,'image');
});
test('free-placement copies before originals keep their frame and do not block the original family',()=>{
 for(const route of ['cd-insert','cd-tray']){
  const p=imported(route),face=route==='cd-tray'?'cdTray':'cdFront',original=p.surfaces[face].find(layer=>layer.source==='cdContents'||layer.source==='cdTracks');
  const copy={...model.clone(original),id:'manual-freeplace-copy',referenceBlockCopy:true,x:83,y:17,w:39,rotation:12,locked:true};p.surfaces[face].unshift(copy);const before=model.clone(copy);
  resetCDStandardBlocks(p,p.editorMode);assert.deepEqual(p.surfaces[face].find(layer=>layer.id===copy.id),before);assert.equal(original.locked,false);
  if(route==='cd-insert'){assert.equal(original.cdContentFlow,true);assert.equal(original.referenceCDContent,undefined)}
 }
});
test('cover-only imports retain hidden content and typography when repositioning creates latent blocks',()=>{
 const p=model.importReference(model.createProject(),'https://vhs.texs.org/en/cd-insert?mode=s1&musicArtist=ARTISTTOKEN&musicAlbum=ALBUMTOKEN&musicA=TRACKTOKEN&jh=7'),template=model.clone(p.referenceCDContentTemplate);
 resetCDStandardBlocks(p,'cd-insert');const latent=p.surfaces.cdInside.find(layer=>layer.cdContentFlow);assert.equal(latent.font,template.font);assert.equal(latent.size,template.size);assert.equal(latent.hideArtist,true);assert.equal(latent.hideAlbum,true);assert.equal(latent.hideA,true);
 const previous=model.clone(p.layout);p.layout.cdInsertDouble=true;updateCDLayout(p,'cd-insert',previous);assert.doesNotMatch(p.surfaces.cdInside.filter(layer=>layer.cdContentFlow).map(layer=>flowText(p,layer,'cdInside').text).join('\n'),/ARTISTTOKEN|ALBUMTOKEN|TRACKTOKEN/);
});
test('free-placement copies have independent content controls and do not lock their source family',()=>{
 const p=imported('cd-insert'),original=p.surfaces.cdFront.find(layer=>layer.referenceCDContent),copy={...model.clone(original),id:'copy',referenceBlockCopy:true,locked:true};p.surfaces.cdFront.push(copy);const before=model.clone(copy);
 assert.equal(setCDContentOption(p,original,'cdFront','numbers',false),true);assert.deepEqual(copy,before);
 copy.locked=false;const archive=model.clone(p.referenceCDContentTemplate),source=model.clone(original);assert.equal(setCDContentOption(p,copy,'cdFront','hideArtist',true),true);assert.deepEqual(original,source);assert.deepEqual(p.referenceCDContentTemplate,archive);
});
