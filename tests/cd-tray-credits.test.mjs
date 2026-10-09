import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,importReference,clone,validateProject,makeLayer} from '../src/model.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {renderSvg,flowText,textLayout} from '../src/render.js';
import {duplicateSelection} from '../src/selection-edit.js';
import {setCDContentOption} from '../src/cd-content-edit.js';

const UNIT=25.4/600,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const imported=extra=>importReference(createProject(),'https://vhs.texs.org/en/cd-tray?'+new URLSearchParams({musicArtist:'ARTISTTOKEN',musicAlbum:'ALBUMTOKEN',musicA:'TRACKTOKEN (1:00)',musicProd:'CREDITSTOKEN',bg:'ffffff',color:'000000',...extra}));
const tracks=p=>p.surfaces.cdTray.filter(l=>l.source==='cdTracks'&&!l.referenceBlockCopy);
const credits=flow=>flow.sections.filter(section=>section.kind==='credits');
const change=(p,patch)=>{const old=clone(p.layout);Object.assign(p.layout,patch);updateCDLayout(p,'cd-tray',old)};

test('single-column imported Tray renders smaller centered translucent credits after the actual track list',()=>{
 const p=imported({musicProd:'CREDITSTOKEN '+Array(18).fill('DESIGN').join(' ')}),layer=tracks(p)[0];layer.opacity=.4;
 const before=clone(p),flow=flowText(p,layer,'cdTray'),section=credits(flow)[0];
 assert.equal(credits(flow).length,1);near(section.layer.size,61*UNIT);near(section.layer.w,layer.w*.6);near(section.layer.lineHeight,1.4);assert.equal(section.layer.align,'center');near(section.opacity,.8);
 near(section.y,flow.trackHeight+40*UNIT);assert.ok(section.layout.lines.length>1);
 const rendered=renderSvg(p,'cdTray',{guides:false});assert.match(rendered.svg,/data-cd-tray-section="credits"[^>]+opacity="0.8"/);assert.ok(rendered.svg.includes('font-size="'+61*UNIT+'"'));assert.ok(rendered.svg.includes('opacity="0.4"'));
 const bytes=new Resvg(rendered.svg,{fitTo:{mode:'width',value:800}}).render().asPng();assert.ok(bytes.length>1000);assert.deepEqual(p,before);
 p.data.production='';assert.notDeepEqual(new Resvg(renderSvg(p,'cdTray',{guides:false}).svg,{fitTo:{mode:'width',value:800}}).render().asPng(),bytes);
});

test('two-column credits remain below both full columns when the useful column height changes',()=>{
 for(const height of [100,50,20]){
  const p=imported({dc:'1',ch:String(height),musicA:Array.from({length:36},(_,i)=>`TRACK${String(i+1).padStart(2,'0')} (1:00)`).join('|')}),layers=tracks(p),flows=layers.map(l=>flowText(p,l,'cdTray')),sections=flows.flatMap(credits);
  assert.equal(sections.length,1);assert.equal(flows[1].text.includes('CREDITSTOKEN'),false);
  near(sections[0].y,layers[0].h/(height/100)+20*UNIT);near(sections[0].layer.w,layers[0].w*1.2);
  near(layers[0].y+sections[0].y,(2787-40-279+20)*UNIT);
 }
});

test('whole track items continue to the next column without separating a wrapped title or its number',()=>{
 const p=imported({dc:'1',musicA:'FIRSTTOKEN (1:00)|WRAPPEDTOKEN with a long title here (2:00)|LASTTOKEN (3:00)',musicProd:''}),layers=tracks(p);
 for(const layer of layers){layer.size=1;layer.lineHeight=1.5;layer.w=13;layer.h=6}
 const flows=layers.map(l=>flowText(p,l,'cdTray',{measureText:text=>text.length*.5}));
 assert.ok(flows[0].text.includes('FIRSTTOKEN'));assert.equal(flows[0].text.includes('WRAPPEDTOKEN'),false);assert.ok(flows[1].text.includes('WRAPPEDTOKEN'));assert.ok(flows[1].sections.some(s=>s.kind==='number'&&s.text==='2.'));
 assert.equal(flows.flatMap(f=>f.sections).filter(s=>s.kind==='track'&&s.text.includes('WRAPPEDTOKEN')).length,1);
 assert.equal(flows[1].overflow,true);
});

test('number and bullet indents participate in wrapping; two-column unnumbered tracks have no artificial bullet',()=>{
 const p=imported({musicProd:''}),layer=tracks(p)[0],numbered=flowText(p,layer,'cdTray');
 const item=numbered.sections.find(s=>s.kind==='track');near(item.x,layer.size*2.5);near(item.layer.w,layer.w-item.x);assert.equal(numbered.sections.find(s=>s.kind==='number').text,'1.');
 setCDContentOption(p,layer,'cdTray','numbers',false);const bullet=flowText(p,layer,'cdTray');assert.equal(bullet.sections.find(s=>s.kind==='number').text,'-');near(bullet.sections.find(s=>s.kind==='track').x,layer.size*5/6);
 change(p,{columns:2});const two=flowText(p,layer,'cdTray');assert.equal(two.sections.some(s=>s.kind==='number'),false);near(two.sections.find(s=>s.kind==='track').x,0);
});

test('an explicit inline-track control continues text between columns while keeping credits separate',()=>{
 const p=imported({dc:'1',musicA:Array.from({length:12},(_,i)=>`INLINETOKEN${i+1} (1:00)`).join('|')}),layers=tracks(p);
 setCDContentOption(p,layers[0],'cdTray','inlineTracks',true);for(const layer of layers){layer.w=45;layer.h=22;layer.size=2}
 const flows=layers.map(layer=>flowText(p,layer,'cdTray')),text=flows.map(flow=>flow.text).join('\n');assert.ok(text.includes(' · '));assert.ok(flows[1].sections.some(section=>section.kind==='track'));assert.equal(flows.flatMap(credits).length,1);assert.equal(text.split('CREDITSTOKEN').length-1,1);
 assert.equal(flows.flatMap(flow=>flow.sections).some(section=>section.kind==='number'),false);
});

test('hidden tracks retain credits while an explicit production switch removes only credits',()=>{
 const p=imported({cdh:'4'}),layer=tracks(p)[0];assert.equal(layer.visible,true);
 let flow=flowText(p,layer,'cdTray');assert.equal(flow.sections.some(s=>s.kind==='track'),false);assert.equal(credits(flow).length,1);near(credits(flow)[0].y,0);
 assert.ok(renderSvg(p,'cdTray',{guides:false}).svg.includes('CREDITSTOKEN'));assert.equal(renderSvg(p,'cdTray',{guides:false}).svg.includes('TRACKTOKEN'),false);
 setCDContentOption(p,layer,'cdTray','showProduction',false);flow=flowText(p,layer,'cdTray');assert.equal(flow.text,'');assert.equal(flow.sections.length,0);
 const b=imported({musicB:'BTOKEN (2:00)',cdh:'8'});assert.ok(tracks(b).map(l=>flowText(b,l,'cdTray').text).join('\n').includes('BTOKEN'));
});

test('credits preserve explicit alignment, physical blank lines, heading sizes and inline Markdown styles',()=>{
 for(const [ta,align]of [['l','left'],['r','right'],['','center']]){
  const p=imported({ta,musicProd:'# CREDITHEADING\n**BOLDTOKEN**\n\n*ITALICTOKEN*\n## SUBHEADING\nFINALPRODTOKEN'}),layer=tracks(p)[0],flow=flowText(p,layer,'cdTray'),parts=credits(flow);
  assert.equal(parts[0].layer.align,align);near(parts[0].layer.size,101*UNIT*1.2);near(parts[2].layer.size,101*UNIT);assert.equal(parts[2].layer.fontWeight,600);
  assert.ok(parts[1].layout.lineRuns.some(runs=>runs.length===0));assert.ok(parts[1].layout.lineRuns.flat().some(run=>run.bold));assert.ok(parts[1].layout.lineRuns.flat().some(run=>run.italic));
  const svg=renderSvg(p,'cdTray',{guides:false}).svg;assert.ok(svg.includes('BOLDTOKEN'));assert.ok(svg.includes('ITALICTOKEN'));assert.match(svg,/font-weight="bold"/);assert.match(svg,/font-style="italic"/);
 }
});

test('copied and legacy Tray blocks stay independent and render from stable IDs during rebuild and reopening',()=>{
 const p=imported({bx:'bdefault-tracklist*2_50_70_100_0_80_0_0'}),layer=tracks(p)[0],copy=p.surfaces.cdTray.find(l=>l.referenceBlockCopy);
 assert.ok(copy.text.includes('CREDITSTOKEN'));const saved=clone(copy);change(p,{columns:2});change(p,{columns:1});assert.deepEqual(copy,saved);
 const [manual]=duplicateSelection(p,layer,'cdTray',{joined:false});p.surfaces.cdTray.push(manual);p.data.production='NEWPRODUCTIONTOKEN';p.data.A=[];
 assert.ok(manual.text.includes('CREDITSTOKEN'));assert.equal(manual.text.includes('NEWPRODUCTIONTOKEN'),false);assert.equal(flowText(p,manual,'cdTray').sections,undefined);
 const reopened=validateProject(JSON.parse(JSON.stringify(p)));assert.ok(reopened.surfaces.cdTray.find(l=>l.id!==layer.id&&l.text===manual.text));assert.ok(renderSvg(reopened,'cdTray',{guides:false}).svg.includes('NEWPRODUCTIONTOKEN'));
});

test('credits and item layout leave stored manual and locked frames unchanged and never affect other CD formats',()=>{
 const p=imported({dc:'1'}),layers=tracks(p);Object.assign(layers[0],{x:21,y:14,w:48,h:62,rotation:12,locked:true,font:'Georgia',color:'#aa3344'});layers[1].visible=false;
 const before=clone(p);const rendered=renderSvg(p,'cdTray',{guides:false});assert.ok(rendered.svg.includes('CREDITSTOKEN'));assert.deepEqual(p,before);
 const generic=createProject();generic.editorMode='cd-tray';generic.data.production='GENERICPRODUCTION';generic.data.A=[];generic.data.B=[];const line=tracks(generic)[0];line.trackOptions={showProduction:true};const flow=flowText(generic,line,'cdTray');assert.equal(flow.sections,undefined);assert.ok(flow.text.includes('GENERICPRODUCTION'));
 const inside=makeLayer('text',{source:'production',cdTrayInsideProduction:true,size:3,opacity:.5,w:50,h:50});p.surfaces.cdTrayInside=[inside];const inner=renderSvg(p,'cdTrayInside',{guides:false}).svg;assert.equal(inner.includes('data-cd-tray-section'),false);
 assert.equal(renderSvg(p,'cdFront',{guides:false}).svg.includes('data-cd-tray-section'),false);assert.equal(renderSvg(p,'cdLabel',{guides:false}).svg.includes('data-cd-tray-section'),false);
});
