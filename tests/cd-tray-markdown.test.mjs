import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,importReference,clone,validateProject} from '../src/model.js';
import {renderSvg,flowText} from '../src/render.js';

const UNIT=25.4/600,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const imported=(production,extra={})=>importReference(createProject(),'https://vhs.texs.org/en/cd-tray?'+new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',musicA:'Track (1:00)',musicProd:production,bg:'ffffff',color:'000000',ta:'l',...extra}));
const track=p=>p.surfaces.cdTray.find(layer=>layer.source==='cdTracks'&&!layer.referenceBlockCopy);
const parts=(p,options={})=>flowText(p,track(p),'cdTray',options).sections.filter(section=>section.kind==='credits');
const visible=section=>section.layout.lineRuns.map(runs=>runs.map(run=>run.text).join(''));
const png=p=>new Resvg(renderSvg(p,'cdTray',{guides:false}).svg,{fitTo:{mode:'width',value:1000}}).render().asPng();

test('imported ordered credits use sequential inside markers and wrap continuations to the full body width',()=>{
 const p=imported('7. **Producer** with a long production credit\n19. Mastering', {cdh:'4'}),layer=track(p);
 Object.assign(layer,{size:2,w:25,h:70,locked:true});const before=clone(p),sections=parts(p,{measureText:text=>Array.from(text).length*.8}),[first,second]=sections;
 assert.equal(sections.length,2);assert.equal(first.marker,'1.');assert.equal(second.marker,'2.');
 assert.ok(visible(first)[0].startsWith('1. Producer'));assert.ok(first.layout.lines.length>1);assert.equal(visible(first).slice(1).some(line=>/^\d+[.)]/.test(line)),false);
 for(const section of sections){near(section.x,0);near(section.layer.w,layer.w*.6);assert.equal(section.layer.align,'left');near(section.opacity,.8);assert.equal(section.layer.literalText,false);assert.equal(section.layer.markdownHeadings,false)}
 near(second.y-first.y-first.layout.height,8*UNIT);assert.ok(first.layout.lineRuns.flat().some(run=>run.bold&&run.text.includes('Producer')));assert.deepEqual(p,before);
 const ordinary=imported('Producer with a long production credit',{cdh:'4'});Object.assign(track(ordinary),{size:2,w:25,h:70});
 assert.ok(first.layout.lines.length>=parts(ordinary,{measureText:text=>Array.from(text).length*.8})[0].layout.lines.length);
});

test('unmarked and nested lists retain original zero indentation and collapse adjacent item margins',()=>{
 const p=imported('7. OUTER\n   1. INNER\n   9. NEXTINNER\n8. NEXT\n- UNMARKED\n  + NESTEDUNMARKED',{cdh:'4'}),sections=parts(p);
 assert.deepEqual(sections.map(visible),[['1. OUTER'],['1. INNER'],['2. NEXTINNER'],['2. NEXT'],['UNMARKED'],['NESTEDUNMARKED']]);
 assert.deepEqual(sections.map(section=>section.listDepth),[1,2,2,1,1,2]);
 for(let index=0;index<sections.length;index++){near(sections[index].x,0);if(index)near(sections[index].y-sections[index-1].y-sections[index-1].layout.height,([1,5].includes(index)?0:8)*UNIT)}
 assert.equal(sections.slice(4).some(section=>section.marker),false);
});

test('physical blank and continuation lines remain inside tight items and preserve emphasis across wrapping',()=>{
 const p=imported('1. **Producer with a long credit**\n\n   *Continuation credit*\n2. NEXT',{cdh:'4'}),layer=track(p);Object.assign(layer,{w:30,size:2,h:70});
 const [first,second]=parts(p,{measureText:text=>Array.from(text).length*.7});
 assert.equal(first.creditsBlock,'list-item');assert.ok(first.layout.lineRuns.some(runs=>runs.length===0));assert.ok(first.layout.lineRuns.flat().filter(run=>run.bold).length>1);assert.ok(first.layout.lineRuns.flat().some(run=>run.italic));
 assert.equal(visible(second).join(''),'2. NEXT');near(second.y-first.y-first.layout.height,8*UNIT);
 const svg=renderSvg(p,'cdTray',{guides:false}).svg;assert.match(svg,/font-weight="bold"/);assert.match(svg,/font-style="italic"/);
});

test('heading and paragraph margins follow source block collapse while small headings inherit the credit face',()=>{
 const p=imported('PREFACE\n## SUBHEADING\n# HEADING\n## NEXTHEADING\n### SMALL\n#Hashtag **BOLD**',{cdh:'4'}),sections=parts(p),layer=track(p);
 assert.equal(sections.length,6);near(sections[1].y-sections[0].y-sections[0].layout.height,24*UNIT);near(sections[2].y-sections[1].y-sections[1].layout.height,16*UNIT);near(sections[3].y-sections[2].y-sections[2].layout.height,24*UNIT);
 near(sections[1].layer.size,101*UNIT);near(sections[2].layer.size,101*UNIT*1.2);near(sections[4].layer.size,61*UNIT);assert.equal(sections[4].layer.fontWeight,layer.fontWeight);assert.equal(sections[4].layer.bold,layer.bold);
 assert.equal(visible(sections[4]).join(''),'SMALL');assert.equal(visible(sections[5]).join(''),'#Hashtag BOLD');assert.ok(sections[5].layout.lineRuns.flat().some(run=>run.bold));
 const noSpace=imported('1. CONTACT\n7. literal line',{cdh:'4'});assert.deepEqual(parts(noSpace).map(visible),[['1. CONTACT'],['2. literal line']]);
 const paragraph=imported('PREFACE\n7. literal line',{cdh:'4'});assert.deepEqual(visible(parts(paragraph)[0]),['PREFACE','7. literal line']);
});

test('an initial subheading merges its margin with existing track spacing on either column layout',()=>{
 for(const [extra,gap]of [[{},40],[{dc:'1'},24],[{cdh:'4'},24]]){
  const p=imported('## SUBHEADING',extra),layer=track(p),flow=flowText(p,layer,'cdTray'),[section]=parts(p);
  const base=extra.cdh?0:extra.dc?layer.h:flow.trackHeight;near(section.y-base,gap*UNIT);
 }
});

test('empty headings and unmarked empty items contribute margins without inventing a line of text',()=>{
 const p=imported('##\n## HEADING',{cdh:'4'}),[section]=parts(p);assert.equal(parts(p).length,1);assert.equal(visible(section).join(''),'HEADING');near(section.y,24*UNIT);
 assert.deepEqual(png(p),png(imported('## HEADING',{cdh:'4'})));
 const empty=imported('-\n- CREDIT',{cdh:'4'}),items=parts(empty);assert.equal(items.length,1);assert.equal(visible(items[0]).join(''),'CREDIT');near(items[0].y,8*UNIT);
});

test('native SVG output confirms restored ordered markers and invisible unordered syntax without mutating saved projects',()=>{
 const numbered=imported('7. **Production credit**',{cdh:'4'}),one=imported('1. **Production credit**',{cdh:'4'}),unordered=imported('- **Production credit**',{cdh:'4'}),plain=imported('**Production credit**',{cdh:'4'});
 // Layer IDs affect SVG IDs, but the native pixels must match the source's
 // rendered numbering reset and the unmarked UL declaration.
 assert.deepEqual(png(numbered),png(one));assert.deepEqual(png(unordered),png(plain));assert.notDeepEqual(png(numbered),png(unordered));
 const p=imported('1. CREDIT\n   1. NESTED\n## END',{dc:'1',ch:'50'}),layer=track(p);Object.assign(layer,{x:18,y:12,w:40,h:55,size:2,font:'Georgia',rotation:5,locked:true});const before=clone(p),saved=validateProject(JSON.parse(JSON.stringify(p)));
 const raster=png(p);assert.ok(raster.length>1000);assert.deepEqual(p,before);for(const key of ['x','y','w','h','size','font','rotation','locked'])assert.equal(track(saved)[key],layer[key]);assert.ok(renderSvg(saved,'cdTray',{guides:false}).svg.includes('NESTED'));
});
