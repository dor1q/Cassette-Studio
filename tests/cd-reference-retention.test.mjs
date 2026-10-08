import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,clone,makeLayer,panelRects,dimensions,validateProject} from '../src/model.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';

const unit=25.4/600;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≠ ${expected}`);
const contents=(project,surface)=>project.surfaces[surface].filter(layer=>layer.referenceCDContent);
const imported=mode=>{const project=createProject();importReference(project,'https://vhs.texs.org/en/cd-insert?'+new URLSearchParams({mode,musicArtist:'Artist',musicAlbum:'Album',musicA:'One (1:00)',musicB:'Two (2:00)'}));return project};
const change=(project,layout)=>{const previous={...project.layout};Object.assign(project.layout,layout);updateCDLayout(project,'cd-insert',previous);return rebuildReferenceCDContents(project)};
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));
const style=layer=>Object.fromEntries(['font','fontWeight','size','color','italic','lineHeight','visible','locked','hideAlbum','trackOptions'].map(key=>[key,clone(layer[key])]));

test('reference duplex toggle retains every inside content identity, style and manual or locked frame',()=>{
 const project=imported('d2');change(project,{columns:2});const inside=contents(project,'cdInside');
 inside[0].font='Georgia';inside[0].color='#123456';inside[0].visible=false;inside[0].locked=true;
 inside[1].x+=3;inside[1].rotation=7;inside[1].italic=true;inside[1].trackOptions={...inside[1].trackOptions,durations:false};
 inside[2].font='Arial';inside[2].fontWeight=500;inside[2].color='#654321';inside[2].hideAlbum=true;
 const before=inside.map(layer=>({id:layer.id,frame:frame(layer),style:style(layer)}));
 const off=change(project,{cdInsertDouble:false});
 assert.equal(off.created,0);assert.equal(off.removed,0);
 assert.deepEqual(contents(project,'cdInside').map(layer=>({id:layer.id,frame:frame(layer),style:style(layer)})),before);
 const on=change(project,{cdInsertDouble:true});
 assert.equal(on.created,0);assert.equal(on.removed,0);
 assert.deepEqual(contents(project,'cdInside').map(layer=>({id:layer.id,frame:frame(layer),style:style(layer)})),before);
 for(const layer of inside)assert.equal(project.surfaces.cdInside.find(candidate=>candidate.id===layer.id),layer);
});

test('latent inside frames follow panel, column and height changes while edited and locked geometry stays intact',()=>{
 const project=imported('d2'),inside=contents(project,'cdInside');
 const locked=inside.find(layer=>layer.cdPanelIndex===2),manual=inside.find(layer=>layer.cdPanelIndex===3);
 locked.locked=true;locked.font='Times New Roman';manual.x+=2;manual.color='#654321';
 const kept=inside.map(layer=>({id:layer.id,frame:frame(layer),style:style(layer)}));
 change(project,{cdInsertDouble:false});
 const result=change(project,{cdInsertPanels:3,columns:2,columnHeight:55});
 assert.equal(contents(project,'cdInside').length,6);assert.equal(result.removed,0);assert.ok(result.preserved>=2);
 for(const old of kept){const layer=project.surfaces.cdInside.find(candidate=>candidate.id===old.id);assert.deepEqual(frame(layer),old.frame);assert.deepEqual(style(layer),old.style)}
 for(const layer of contents(project,'cdInside').filter(layer=>!kept.some(old=>old.id===layer.id))){
  const panel=panelRects(project,'cdInside').find(panel=>panel.index===layer.cdPanelIndex),width=(panel.w-2*96*unit-48*unit)/2;
  near(layer.x,panel.x+96*unit+layer.cdColumnIndex*(width+48*unit));near(layer.y,96*unit);near(layer.w,width);near(layer.h,(dimensions(project,'cdInside').h-2*96*unit)*.55);
 }
 const ids=contents(project,'cdInside').map(layer=>layer.id);
 change(project,{cdInsertDouble:true});assert.deepEqual(contents(project,'cdInside').map(layer=>layer.id),ids);
});

test('standard latent inside frames reflow after structural changes without losing their custom typography',()=>{
 const project=imported('d2'),inside=contents(project,'cdInside');
 inside[0].font='Georgia';inside[0].color='#334455';inside[0].lineHeight=1.8;inside[0].visible=false;inside[1].italic=true;
 const before=inside.map(layer=>({id:layer.id,style:style(layer)}));
 change(project,{cdInsertDouble:false});change(project,{cdInsertPanels:3,columns:2,columnHeight:50});
 for(const old of before){
  const layer=project.surfaces.cdInside.find(candidate=>candidate.id===old.id),panel=panelRects(project,'cdInside').find(panel=>panel.index===layer.cdPanelIndex),width=(panel.w-2*96*unit-48*unit)/2;
  assert.deepEqual(style(layer),old.style);near(layer.x,panel.x+96*unit);near(layer.w,width);near(layer.h,(dimensions(project,'cdInside').h-2*96*unit)*.5);
  assert.deepEqual(frame(layer),frame(layer.referenceCDContentFrame));
 }
});

test('single-sided imports do not invent latent content, and enabling the back preserves unrelated custom layers',()=>{
 for(const mode of ['s1','s2','s3']){
  const project=imported(mode),caption=makeLayer('text',{name:'Manual inside caption',text:'Keep me',x:9,y:8,w:30,h:10,locked:true});
  project.surfaces.cdInside.push(caption);const before=clone(caption);
  const result=rebuildReferenceCDContents(project);assert.equal(result.created,0);assert.deepEqual(contents(project,'cdInside'),[]);assert.deepEqual(caption,before);
  change(project,{cdInsertDouble:true});assert.equal(contents(project,'cdInside').length,Number(mode.slice(1)));assert.deepEqual(caption,before);assert.equal(project.surfaces.cdInside.find(layer=>layer.id===caption.id),caption);
 }
});

test('cover-only reference keeps its template for later inside content and a second duplex toggle reuses it',()=>{
 const project=imported('s1');assert.deepEqual(contents(project,'cdFront'),[]);assert.deepEqual(contents(project,'cdInside'),[]);
 project.referenceCDContentTemplate.font='Georgia';project.referenceCDContentTemplate.hideAlbum=true;project.referenceCDContentTemplate.color='#112233';
 const template=clone(project.referenceCDContentTemplate);
 const created=change(project,{cdInsertDouble:true});assert.equal(created.created,1);
 const inside=contents(project,'cdInside')[0],id=inside.id;assert.equal(inside.font,'Georgia');assert.equal(inside.hideAlbum,true);assert.equal(inside.color,'#112233');
 change(project,{cdInsertDouble:false});assert.equal(contents(project,'cdInside')[0].id,id);
 change(project,{cdInsertDouble:true});assert.equal(contents(project,'cdInside')[0].id,id);assert.deepEqual(project.referenceCDContentTemplate,template);
});

test('saving and reopening a reference with disabled duplex keeps the latent inside styles and reuses reopened identities',()=>{
 const project=imported('d2'),inside=contents(project,'cdInside');inside[0].font='Georgia';inside[0].color='#445566';inside[1].italic=true;
 const before=inside.map(layer=>({id:layer.id,frame:frame(layer),style:style(layer)}));
 change(project,{cdInsertDouble:false});const reopened=validateProject(JSON.parse(JSON.stringify(project)));
 assert.equal(reopened.layout.cdInsertDouble,false);assert.deepEqual(contents(reopened,'cdInside').map(layer=>({frame:frame(layer),style:style(layer)})),before.map(({frame,style})=>({frame,style})));
 const reopenedIds=contents(reopened,'cdInside').map(layer=>layer.id);
 const result=change(reopened,{cdInsertDouble:true});assert.equal(result.created,0);assert.equal(result.removed,0);
 assert.deepEqual(contents(reopened,'cdInside').map(layer=>layer.id),reopenedIds);assert.deepEqual(contents(reopened,'cdInside').map(layer=>({frame:frame(layer),style:style(layer)})),before.map(({frame,style})=>({frame,style})));
});

test('structural collapse of the latent back retains obsolete standard, edited and locked frames for expansion',()=>{
 for(const state of ['untouched','manual','locked']){
  const project=imported('d3'),obsolete=contents(project,'cdInside').find(layer=>layer.cdPanelIndex===4);
  if(state==='manual')obsolete.x+=4;if(state==='locked')obsolete.locked=true;
  const before=clone(obsolete);change(project,{cdInsertDouble:false});change(project,{cdInsertPanels:2});
  const retained=project.surfaces.cdInside.find(layer=>layer.id===obsolete.id);assert.deepEqual(frame(retained),frame(before));assert.deepEqual(style(retained),style(before));assert.equal(retained,obsolete);
  assert.equal(contents(project,'cdInside').filter(layer=>layer.cdPanelIndex!==4).length,2);
 }
});
