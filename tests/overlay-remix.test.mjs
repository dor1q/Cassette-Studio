import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,migrate,panelRects} from '../src/model.js';
import {WILD_REMIX_KIT,REMIX_LEGACY_PART_IDS,remixPartSelection} from '../src/overlay-remix-kit.js';
import {remixGeometry,remixRectangle,planRemix,remixSeed,REMIX_MAX_SIDE,REMIX_MAX_PIXELS} from '../src/overlay-remix-plan.js';
import {normalizeRemixParts,prepareRemix,prepareRemixFromParts,renderRemixPlan,remixPixelsToAlpha} from '../src/overlay-remix.js';
import {parseReferenceOverlays,restoreReferenceExtras} from '../src/reference-extras.js';

const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=';
const parts=WILD_REMIX_KIT.parts.map(part=>({...part,src})),close=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);
function renderer(){
 const canvases=[],loaded=[];
 class Canvas{
  constructor(){this.calls=[];this.history=[];this.pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255,128,128,128,255,12,34,56,0]);this.state=[];this.context={globalAlpha:1,globalCompositeOperation:'source-over'};
   const record=call=>{this.calls.push(call);this.history.push(call)};
   const c=this.context;for(const method of ['scale','clip','fillRect','translate','rotate'])c[method]=(...args)=>record([method,...args]);
   c.save=()=>{this.state.push({globalAlpha:c.globalAlpha,globalCompositeOperation:c.globalCompositeOperation})};c.restore=()=>Object.assign(c,this.state.pop());
   c.createLinearGradient=(...args)=>{const stops=[];record(['gradient',args,stops]);return {addColorStop:(...stop)=>stops.push(stop)}};
   c.drawImage=(image,...args)=>{record(['draw',image.id||'feathered-part',c.globalAlpha,c.globalCompositeOperation,...args]);if(args.length===8){assert.ok(args[0]>=0&&args[1]>=0);assert.ok(args[0]+args[2]<=image.width+.001);assert.ok(args[1]+args[3]<=image.height+.001)}};
   c.getImageData=()=>({data:this.pixels});c.putImageData=image=>this.pixels=image.data;
  }
  set width(value){assert.ok(value>0&&value<=4096);this.w=value;this.calls=[]}
  get width(){return this.w}
  set height(value){assert.ok(value>0&&value<=4096);this.h=value;this.calls=[]}
  get height(){return this.h}
  getContext(){return this.context}
  toDataURL(){return 'data:image/png;base64,'+Buffer.from(JSON.stringify({w:this.w,h:this.h,calls:this.calls,pixels:[...this.pixels]})).toString('base64')}
 }
 return {canvases,loaded,options:{createCanvas:()=>{const c=new Canvas();canvases.push(c);return c},loadImage:async part=>{loaded.push(part.id);return {id:part.id,width:part.width,height:part.height}},path:outline=>outline}};
}
const requestParts=async url=>({parts:parts.filter(part=>new URL(url,'http://localhost').searchParams.get('parts').split(',').includes(part.id))});

test('full public Remix manifest includes crease, edge, scuff, scratch, branch and grain variants',()=>{
 assert.equal(parts.length,32);assert.equal(new Set(parts.map(p=>p.id)).size,32);
 assert.equal(parts.filter(p=>p.id.startsWith('branch-')).length,9);assert.equal(parts.filter(p=>p.id.startsWith('scuff-')).length,8);
 assert.deepEqual(remixPartSelection('crease-v-4,branch-9,grain'),['crease-v-4','branch-9','grain']);
 assert.throws(()=>remixPartSelection('../secret'));assert.throws(()=>remixPartSelection('unknown'));assert.equal(remixPartSelection().length,32);
});

test('actual custom panel folds replace the old fixed quarter and two-third crease positions',()=>{
 const p=createProject();Object.assign(p.layout,{panels:5,flap:17,spine:9,front:73,height:94});
 const geometry=remixGeometry(p,'outer'),plan=planRemix(geometry,23),folds=plan.ops.filter(op=>op.kind==='fold');
 assert.deepEqual(geometry.folds.map(f=>f[0]),panelRects(p).slice(1).map(r=>r.x));
 assert.equal(folds.length,4);folds.forEach((op,i)=>close(op.x,geometry.folds[i][0]*600/25.4));
 assert.ok(folds.some(op=>Math.abs(op.x/plan.logicalWidth-.25)>.1));
});

test('mirrored J-card reverse folds follow their physical counterpart for every panel count',()=>{
 for(let count=3;count<=8;count++){
  const p=createProject();importReference(p,`https://vhs.texs.org/en/jcard?face=p${count}&ds=1&eb=1`);
  const front=remixGeometry(p,'outer'),back=remixGeometry(p,'inner');
  const expected=front.folds.map(f=>front.width-f[0]).sort((a,b)=>a-b);
  back.folds.map(f=>f[0]).sort((a,b)=>a-b).forEach((x,i)=>close(x,expected[i]));
  assert.deepEqual(planRemix(back,9).ops.filter(op=>op.kind==='fold').map(op=>op.x),back.folds.map(f=>Math.round(f[0]*600/25.4*1e6)/1e6));
 }
});

test('plans are deterministic, switch real asset variants with the seed, and honor once-only scratches',()=>{
 const g=remixGeometry(createProject()),first=planRemix(g,7);
 assert.deepEqual(first,planRemix(g,7));assert.notDeepEqual(first.ops,planRemix(g,8).ops);
 const used=new Set();for(let seed=0;seed<30;seed++){
  const plan=planRemix({...g,folds:[...g.folds,[0,g.height/2,g.width,g.height/2]]},seed);assert.ok(plan.ops.filter(op=>op.id==='scratch-4').length<=1);
  for(const id of plan.usedParts)used.add(id);
  for(const op of plan.ops){assert.ok(Object.values(op).filter(x=>typeof x==='number').every(Number.isFinite));assert.ok(op.source.w>0&&op.source.h>0);assert.ok(op.alpha>=0&&op.alpha<=1)}
 }
 assert.equal(used.size,32,'the generator can select every published kit variant');
});

test('branches are attached to actual folds and scratch crops stay within their native assets',()=>{
 const plan=planRemix(remixGeometry(createProject()),18),branches=plan.ops.filter(op=>op.kind==='branch');assert.ok(branches.length>0);
 for(const op of branches){const rootX=op.x-Math.cos(op.rotation)*op.w/2,rootY=op.y-Math.sin(op.rotation)*op.w/2;close(rootX,op.fold[0]);assert.ok(rootY>=Math.min(op.fold[1],op.fold[3])&&rootY<=Math.max(op.fold[1],op.fold[3]));}
 for(const op of plan.ops){const part=parts.find(p=>p.id===op.id);assert.ok(op.source.x>=0&&op.source.y>=0);assert.ok(op.source.x+op.source.w<=part.width+.001);assert.ok(op.source.y+op.source.h<=part.height+.001)}
});

test('extreme valid layouts and requested resolution stay within bounded canvas dimensions',()=>{
 const p=createProject();Object.assign(p.layout,{panels:8,flap:70,spine:25.4,front:90,height:130});
 for(const g of [remixGeometry(p),remixRectangle(.05),remixRectangle(20)]){
  const plan=planRemix(g,1,{maxSide:90000});assert.ok(plan.width<=REMIX_MAX_SIDE&&plan.height<=REMIX_MAX_SIDE);assert.ok(plan.width*plan.height<=REMIX_MAX_PIXELS);assert.ok(plan.ops.length<=256);
 }
 assert.throws(()=>remixRectangle(NaN));assert.throws(()=>remixRectangle(0));assert.throws(()=>planRemix({width:0,height:1,outline:'',folds:[]}));
});

test('cassette Remix geometry retains cutout clipping and has no invented fold creases',()=>{
 const p=createProject(),a=remixGeometry(p,'labelA'),b=remixGeometry(p,'labelB');
 assert.equal(a.signature,b.signature);assert.deepEqual(a.folds,[]);assert.ok((a.outline.match(/M/g)||[]).length>=2);
 const plan=planRemix(a,5);assert.equal(plan.ops.filter(op=>op.kind==='fold').length,0);
 p.layout.hole=false;assert.notEqual(remixGeometry(p,'labelA').signature,a.signature);
});

test('raster assembler uses real used pieces, clipped screen composition and feathered stamps',async()=>{
 const plan=planRemix(remixGeometry(createProject()),14,{maxSide:1024}),r=renderer(),output=await renderRemixPlan(plan,normalizeRemixParts(parts),r.options);
 assert.ok(output.startsWith('data:image/png;base64,'));assert.deepEqual([...r.loaded].sort(),plan.usedParts);
 assert.ok(r.canvases[0].calls.some(call=>call[0]==='clip'&&call[2]==='evenodd'));
 assert.ok(r.canvases[0].calls.filter(call=>call[0]==='draw').every(call=>call[3]==='screen'));
 assert.ok(r.canvases[1].history.some(call=>call[0]==='gradient'));
 assert.deepEqual([...r.canvases[0].pixels],[255,255,255,0,255,255,255,255,255,255,255,128,12,34,56,0]);
 assert.equal(r.canvases[1].width,1);assert.equal(r.canvases[1].height,1);
});

test('brightness alpha represents screen and hard-light wear under normal blending',()=>{
 const screen=new Uint8ClampedArray([0,0,0,255,255,255,255,255,128,128,128,128]);
 remixPixelsToAlpha(screen);assert.deepEqual([...screen],[255,255,255,0,255,255,255,255,255,255,255,64]);
 const hard=new Uint8ClampedArray([0,0,0,255,255,255,255,255,128,128,128,255]);
 remixPixelsToAlpha(hard,'hard-light');assert.deepEqual([...hard],[0,0,0,255,255,255,255,255,255,255,255,1]);
});

test('saved used assets regenerate the identical seeded drawing offline after project reopening',async()=>{
 const p=createProject(),original=await prepareRemix(p,'outer',requestParts,41,{maxSide:1024,renderer:renderer().options});
 assert.deepEqual(original.kitMetadata.parts.map(part=>part.id),original.usedParts);
 assert.equal(original.blendMode,'normal');assert.ok(original.usedParts.length<parts.length);
 p.surfaces.outer.push(makeLayer('image',{src:original.src,referenceRemix:original.kitMetadata}));
 const reopened=migrate(JSON.parse(JSON.stringify(p))),saved=reopened.surfaces.outer.at(-1).referenceRemix;
 const restored=await prepareRemix(reopened,'outer',async()=>{throw Error('must not request the network')},41,{cachedParts:saved.parts,kitMetadata:saved,renderer:renderer().options});
 assert.equal(restored.signature,original.signature);assert.equal(restored.src,original.src);assert.deepEqual(restored.kitMetadata,original.kitMetadata);
});

test('offline shuffling uses saved genuine kit pieces and persists its reproducible availability',async()=>{
 const p=createProject(),original=await prepareRemix(p,'outer',requestParts,41,{maxSide:1024,renderer:renderer().options});let requests=0;
 const shuffled=await prepareRemix(p,'outer',async()=>{requests++;throw Error('offline')},94,{cachedParts:original.kitMetadata.parts,kitMetadata:original.kitMetadata,renderer:renderer().options});
 assert.notEqual(shuffled.signature,original.signature);assert.ok(shuffled.usedParts.every(id=>original.usedParts.includes(id)));assert.ok(requests<=1);
 const reopened=await prepareRemix(p,'outer',null,94,{cachedParts:shuffled.kitMetadata.parts,kitMetadata:shuffled.kitMetadata,renderer:renderer().options});
 assert.equal(reopened.src,shuffled.src);assert.equal(reopened.signature,shuffled.signature);
});

test('legacy six-part sources still return a seeded result with the compatible ratio API',async()=>{
 const image=await prepareRemixFromParts(REMIX_LEGACY_PART_IDS.map(()=>src),1.65,7,{renderer:renderer().options});
 assert.ok(image.usedParts.every(id=>REMIX_LEGACY_PART_IDS.includes(id)));assert.equal(image.seed,7);
 assert.ok(image.src.startsWith('data:image/png;base64,'));assert.equal(normalizeRemixParts([{id:'grain',src:'https://evil.test/image'}]).size,0);
});

test('zero seed survives reference parsing and remains distinct from seed one',()=>{
 assert.equal(remixSeed(0),0);assert.equal(parseReferenceOverlays('a1.1.70.0')[0].seed,0);
 assert.notEqual(planRemix(remixRectangle(),0).signature,planRemix(remixRectangle(),1).signature);
});

test('reference restoration prepares both actual surface geometries and reuses saved composites offline',async()=>{
 const p=createProject(),params=new URLSearchParams({ol:'a1.2.45.h',ds:'1',face:'p5'});importReference(p,'https://vhs.texs.org/en/jcard?'+params);
 const result=await restoreReferenceExtras(p,params,requestParts,'jcard',[],{renderer:renderer().options});assert.deepEqual(result,{restored:1,missing:0});
 const overlays=['outer','inner'].map(side=>p.surfaces[side].find(layer=>layer.referenceRemix));
 overlays.forEach((layer,i)=>{assert.equal(layer.referenceRemix.geometrySignature,remixGeometry(p,i?'inner':'outer').signature);assert.equal(layer.blendMode,'normal');assert.equal(layer.opacity,.45);assert.equal(layer.referenceRemix.sourceBlendMode,'hard-light')});
 assert.notEqual(overlays[0].referenceRemix.signature,overlays[1].referenceRemix.signature);
 const next=createProject();importReference(next,'https://vhs.texs.org/en/jcard?'+params);
 const cached=await restoreReferenceExtras(next,params,async()=>{throw Error('offline')},'jcard',overlays,{renderer:renderer().options});assert.deepEqual(cached,result);
 for(const [i,side]of ['outer','inner'].entries())assert.equal(next.surfaces[side].find(layer=>layer.referenceRemix).src,overlays[i].src);
});
