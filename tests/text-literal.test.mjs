import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,clone} from '../src/model.js';
import {textLayout,flowText,renderSvg} from '../src/render.js';

test('literal glyph layout preserves heading and emphasis characters in measurement and wrapping',()=>{
 const face=makeLayer('text',{literalText:true,size:1,w:100,h:30,lineHeight:1.2}),value='# **Raw** *Name* <&> 👩‍🎤',calls=[];
 const layout=textLayout(value,face,{measureText:(text,style)=>{calls.push({text,style});return Array.from(text).length}});
 assert.deepEqual(layout.lines,[value]);assert.equal(layout.lineRuns[0].map(run=>run.text).join(''),value);
 assert.ok(layout.lineRuns.flat().every(run=>!run.bold&&!run.italic&&!run.heading));assert.ok(calls.some(call=>call.text.includes('**Raw**')));
 const wrapped=textLayout('**RAW**', {...face,w:3},{measureText:text=>text.length});assert.equal(wrapped.lineRuns.flat().map(run=>run.text).join(''),'**RAW**');assert.ok(wrapped.lines.length>1);
 const markdown=textLayout('# **Raw** *Name*',{...face,literalText:false},{measureText:text=>text.length});assert.ok(markdown.lineRuns.flat().some(run=>run.heading&&run.bold));assert.ok(markdown.lineRuns.flat().some(run=>run.italic));
 const prepared=textLayout('#Hashtag **Bold**',{...face,literalText:false,markdownHeadings:false},{measureText:text=>text.length});assert.equal(prepared.lineRuns.flat().map(run=>run.text).join(''),'#Hashtag Bold');assert.ok(prepared.lineRuns.flat().some(run=>run.bold));assert.ok(prepared.lineRuns.flat().every(run=>!run.heading));
});

test('imported Tray titles, spines and reverse print literally while front production still renders Markdown',()=>{
 const p=importReference(createProject(),'https://vhs.texs.org/en/cd-tray?'+new URLSearchParams({ds:'1',musicArtist:'*ARTIST*',musicAlbum:'# **ALBUM**',musicA:'# **Raw** - *Artist* (03:07)',musicProd:'**CREDITSTOKEN**',bg:'ffffff',color:'000000'}));
 const layer=p.surfaces.cdTray.find(layer=>layer.source==='cdTracks'),before=clone(p),flow=flowText(p,layer,'cdTray');
 const track=flow.sections.find(section=>section.kind==='track');assert.equal(track.layer.literalText,true);assert.equal(track.layout.lineRuns.flat().map(run=>run.text).join(''),'# **Raw** - *Artist* (03:07)');assert.ok(track.layout.lineRuns.flat().every(run=>!run.bold&&!run.italic&&!run.heading));
 const credits=flow.sections.find(section=>section.kind==='credits');assert.ok(credits.layout.lineRuns.flat().some(run=>run.bold));
 const svg=renderSvg(p,'cdTray',{guides:false}).svg;assert.ok(svg.includes('# **Raw** - *Artist* (03:07)'));assert.ok(svg.includes('CREDITSTOKEN'));assert.deepEqual(p,before);
 const spines=p.surfaces.cdTray.filter(layer=>layer.source==='cdSpine');assert.ok(spines.every(layer=>layer.literalText));assert.ok(svg.includes('*ARTIST*'));assert.ok(svg.includes('# **ALBUM**'));
 const inside=renderSvg(p,'cdTrayInside',{guides:false}).svg;assert.ok(inside.includes('**CREDITSTOKEN**'));assert.ok(p.surfaces.cdTrayInside.find(layer=>layer.source==='production').literalText);assert.deepEqual(p,before);
});

test('literal rendering escapes markup and retains explicit face styles without source mutation',()=>{
 const p=createProject(),layer=makeLayer('text',{literalText:true,text:'# <script>**raw**</script> & *name*',size:2,w:130,h:30,font:'Arial',fontWeight:600,italic:true,uppercase:true});p.surfaces.outer=[layer];const before=clone(p);
 const result=renderSvg(p,'outer',{guides:false}).svg;assert.ok(result.includes('# &lt;SCRIPT&gt;**RAW**&lt;/SCRIPT&gt; &amp; *NAME*'));assert.equal(result.includes('<script>'),false);assert.match(result,/font-style="italic"/);assert.match(result,/font-weight="600"/);assert.deepEqual(p,before);
});
