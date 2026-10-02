import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProject,makeLayer,importReference,migrate,clone} from '../src/model.js';
import {referenceFont} from '../src/reference-format.js';
import {flowText,renderSvg,shapePath} from '../src/render.js';
import {rebuildReferenceFlow,referenceFlowCopy,updateReferenceFrames} from '../src/reference-flow.js';
import {spineTextRuns} from '../src/spine-text.js';
import {importMusicData} from '../src/music-import.js';
import {printLayout} from '../src/print-layout.js';

test('missing and incomplete font bundles retain normal size, width and fallback family',()=>{
 for(const value of [null,undefined,'','1','~Kells+SD']){
  const font=referenceFont(value,3.5,1,{font:'Arial',weight:700});
  assert.equal(font.size,3.5);assert.equal(font.fontStretch,100);assert.equal(font.fontWeight,700);
 }
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?musicArtist=Artist&musicAlbum=Album');
 assert.ok(Math.abs(p.surfaces.labelA.find(l=>l.source==='artist').size-10*41.8/118.43)<1e-9);
});

test('a side B caption with a named font never appears on A unless sync is explicitly requested',()=>{
 const params=new URLSearchParams({sd:'AB',cxt:'Only B|50|20|0|40|~Kells+SD.8c.7.2s.0|140|ff0000|c|b'}),p=createProject();
 importReference(p,'https://vhs.texs.org/en/cassette?'+params);assert.equal(p.layout.sync,false);
 assert.equal(p.surfaces.labelA.some(l=>l.text==='Only B'),false);assert.equal(p.surfaces.labelB.filter(l=>l.text==='Only B').length,1);
 params.set('ss','1');importReference(p,'https://vhs.texs.org/en/cassette?'+params);assert.equal(p.surfaces.labelA.filter(l=>l.text==='Only B').length,1);
});

test('importing only A with an unlocked design preserves B and J-card surfaces exactly',()=>{
 const p=createProject();p.settings.lockDesign=false;
 for(const surface of Object.keys(p.surfaces))p.surfaces[surface].push(makeLayer('text',{text:'Custom '+surface}));
 const old=clone(p);importMusicData(p,{tracks:[{title:'New A',seconds:120}]},'A');
 assert.deepEqual(p.surfaces.labelB,old.surfaces.labelB);assert.deepEqual(p.surfaces.outer,old.surfaces.outer);assert.deepEqual(p.surfaces.inner,old.surfaces.inner);
 assert.deepEqual(p.data.B,old.data.B);assert.equal(p.surfaces.labelA.some(l=>l.text==='Custom labelA'),false);
});

test('long J-card text fills outside panels and continues from Line 091 on the reverse without repetition',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('./fixtures/reference-parity.json',import.meta.url),'utf8')),p=createProject();importReference(p,fixtures.jcardLong);
 const outside=p.surfaces.outer.filter(l=>l.referenceFlow),inside=p.surfaces.inner.filter(l=>l.referenceFlow);
 assert.equal(outside.length,3);assert.equal(inside.length,4);
 for(const layer of outside)assert.ok(flowText(p,layer,'outer').text.length>0);
 assert.match(flowText(p,inside[0],'inner').text,/^Line 091/);
 const combined=[...outside.map(l=>flowText(p,l,'outer').text),...inside.map(l=>flowText(p,l,'inner').text)].join('\n');
 for(let n=1;n<=120;n++)assert.equal(combined.split('Line '+String(n).padStart(3,'0')).length-1,1);
 assert.ok([...outside,...inside].every(l=>typeof l.id==='string'));
 assert.equal(renderSvg(p,'outer').warnings.length,0);assert.equal(renderSvg(p,'inner').warnings.length,0);
 p.layout.columns=2;p.layout.columnHeight=60;rebuildReferenceFlow(p);assert.equal(p.surfaces.outer.filter(l=>l.referenceFlow).length,6);
 assert.ok(p.surfaces.outer.find(l=>l.referenceFlow).h<60);
});

test('extended flap is upright and tapering leaves a rectangular print outline',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?eb=1');
 const flap=p.surfaces.outer.find(l=>l.source==='flapTracks');assert.equal(flap.rotation,0);assert.equal(flap.trackOptions.inlineTracks,false);
 importReference(p,'https://vhs.texs.org/en/jcard?tb=1');assert.match(shapePath(p,'outer'),/^M0,0H/);assert.doesNotMatch(shapePath(p,'outer'),/L0,/);
 assert.match(shapePath(p,'outer',2),/^M-2,-2H/);
});

test('small captions and line spacing survive a saved project roundtrip',()=>{
 const p=createProject();p.surfaces.outer.push(makeLayer('text',{size:.31339,lineHeight:4,text:'Small'}));
 const saved=migrate(JSON.parse(JSON.stringify(p))).surfaces.outer.at(-1);assert.equal(saved.size,.31339);assert.equal(saved.lineHeight,4);
 assert.equal(migrate(createProject()).layout.columnHeight,100);
});

test('section colors, album font, spine line-height, track alignment and column height are restored',()=>{
 const p=createProject(),params={fc:'112233.223344.334455.445566',f3:'2.2s.4.2s.4',slh:'2',dc:'1',ch:'60',ta:'r',musicArtist:'Artist',musicAlbum:'Album'};
 importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams(params));
 assert.equal(p.surfaces.outer.find(l=>l.source==='flapTracks').color,'#112233');
 const spine=p.surfaces.outer.find(l=>l.source==='spine');assert.equal(spine.color,'#223344');assert.equal(spine.albumStyle.font,'Times New Roman');assert.equal(spine.albumStyle.color,'#445566');assert.equal(spine.lineHeight,2);
 assert.equal(p.surfaces.outer.find(l=>l.referenceFlow).color,'#334455');assert.equal(p.layout.columnHeight,60);
 assert.match(renderSvg(p,'outer').svg,/<tspan font-family="Times New Roman"/);
 importReference(p,'https://vhs.texs.org/en/cassette?'+new URLSearchParams(params));assert.equal(p.surfaces.labelA.find(l=>l.source==='tracks').align,'right');assert.equal(p.surfaces.labelA.find(l=>l.source==='artist').color,'#112233');
});

test('Letter twelve-up uses original template centers for every slot, including bleed',()=>{
 for(const bleed of [0,2,5]){
  const items=[{w:88.6+2*bleed,h:41.8+2*bleed},{w:88.6+2*bleed,h:41.8+2*bleed}],plan=printLayout(items,{mode:'label',sheet:'12up',copies:6,bleed});
  for(const [index,pos]of plan.pages[0].entries()){
   assert.ok(Math.abs(pos.x+items[pos.item].w/2-[1352,3745][index%2]*25.4/600)<1e-9);
   assert.ok(Math.abs(pos.y+items[pos.item].h/2-[824,1816,2808,3800,4792,5783][Math.floor(index/2)]*25.4/600)<1e-9);
  }
 }
});

test('two-up duplex keeps page pairs and mirrors slot positions for short-edge flipping',()=>{
 const items=[{w:168,h:102},{w:168,h:102}],plan=printLayout(items,{sheet:'2up',copies:3,duplexFlip:'short'});
 assert.deepEqual(plan.pages.map(p=>p.length),[2,2,1,1]);
 assert.ok(Math.abs(plan.pages[0][0].y+plan.pages[1][0].y+102-plan.h)<1e-9);
 assert.equal(plan.pages[1][0].rotation,180);
 assert.equal(printLayout([{w:250,h:102}],{paper:'legal'}).w,355.6);
 assert.equal(printLayout([{w:250,h:102}],{paper:'tabloid'}).h,431.8);
});

test('album-specific typography is retained across wrapped lines and uppercase',()=>{
 const p=createProject();p.data.artist='Artist';p.data.album='A Very Long Album Name';
 const layer=makeLayer('text',{source:'spine',referenceSpine:true,uppercase:true,albumStyle:{font:'Times New Roman',color:'#123456',uppercase:true,size:2}});
 const lines=['ARTIST - A VERY','LONG ALBUM NAME'];
 assert.equal(spineTextRuns(lines[0],lines,0,layer,p).filter(r=>r.style).map(r=>r.text).join(''),'A VERY');
 assert.equal(spineTextRuns(lines[1],lines,1,layer,p).filter(r=>r.style).map(r=>r.text).join(''),'LONG ALBUM NAME');
});

test('a copied content block displays the same text without consuming the continuous flow',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('./fixtures/reference-parity.json',import.meta.url),'utf8')),p=createProject();importReference(p,fixtures.jcardLong);
 const first=p.surfaces.inner.find(l=>l.referenceFlow),before=p.surfaces.inner.filter(l=>l.referenceFlow).map(l=>flowText(p,l,'inner'));
 const copy=makeLayer('text',{...referenceFlowCopy(first),id:'content-copy'});p.surfaces.inner.push(copy);
 assert.equal(copy.referenceFlow,false);assert.equal(copy.flowIndex,undefined);
 assert.deepEqual(flowText(p,copy,'inner'),before[0]);
 assert.deepEqual(p.surfaces.inner.filter(l=>l.referenceFlow).map(l=>flowText(p,l,'inner')),before);
 const params=new URL(fixtures.jcardLong);params.searchParams.set('bx','bsideB-inside1*2_50_50_100_0_40');importReference(p,params.href);
 assert.equal(p.referenceFreePlace.applied,1);
 const placed=p.surfaces.inner.find(l=>l.referenceBlockCopy===2);assert.equal(placed.referenceFlow,false);
 assert.match(flowText(p,placed,'inner').text,/^Line 091/);
});

test('changing flap and spine dimensions updates the standard imported frames',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p6&ds=1');
 p.layout.flapShape='extended';p.layout.flap=65;p.layout.height=120;p.layout.spine=20;updateReferenceFrames(p);
 const flap=p.surfaces.outer.find(l=>l.source==='flapTracks'),spine=p.surfaces.outer.find(l=>l.referenceSpine);
 assert.equal(flap.rotation,0);assert.equal(flap.trackOptions.inlineTracks,false);assert.equal(spine.w,112);assert.equal(spine.x,83);
 flap.referenceBlock='default-flapTracks';const frame={x:flap.x,y:flap.y,w:flap.w,h:flap.h};p.layout.flap=30;updateReferenceFrames(p);
 assert.deepEqual({x:flap.x,y:flap.y,w:flap.w,h:flap.h},frame);
});

test('content reflow preserves hidden and freely positioned source blocks',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?face=p6&ds=1');
 const layer=p.surfaces.outer.find(l=>l.referenceFlow);Object.assign(layer,{visible:false,referenceBlock:'default-inside1',x:42,y:13,w:23,h:45,rotation:17});
 rebuildReferenceFlow(p);const next=p.surfaces.outer.find(l=>l.referenceFlow&&l.flowIndex===0);
 assert.equal(next.visible,false);for(const key of ['x','y','w','h','rotation'])assert.equal(next[key],layer[key]);
});
