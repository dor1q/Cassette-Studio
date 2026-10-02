import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate,dimensions,panelRects,makeLayer} from '../src/model.js';
import {decodeReferenceBackground,decodeBackgroundPanelMask,referenceBackgroundGeometry,restoreReferenceBackgrounds,REFERENCE_BACKGROUND_PATTERNS} from '../src/reference-background.js';
const image='data:image/png;base64,iVBORw0KGgo=',size=async()=>[800,400],offline=async()=>{throw Error('offline')};
const project=(params,path='jcard')=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/'+path+'?'+params);return p};
const entry=more=>({panels:null,fit:null,scale:100,offset:{x:50,y:50},tile:false,...more});

test('an album-backed background uses the newly imported cover and never revives the previous album',async()=>{
 const oldCover=makeLayer('image',{category:'albumCover',src:image}),newImage='data:image/png;base64,AgIC',params=new URLSearchParams({bg:'ffffff.t0.100.0'});
 for(const hasNewCover of [true,false]){
  const p=project(params);
  if(hasNewCover)p.surfaces.outer.unshift(makeLayer('image',{category:'albumCover',src:newImage}));
  const result=await restoreReferenceBackgrounds(p,params,offline,'jcard',[oldCover],size);
  const bg=p.surfaces.outer.find(l=>l.referenceBackground);
  assert.equal(bg.src,hasNewCover?newImage:'');
  assert.equal(result.missing,hasNewCover?0:1);
 }
});
test('composite bg restores pattern opacity, tile flag and separate zoom',()=>{
 const q=new URLSearchParams({bg:'f30342.0.58.0.668.814.153.3',bf:'f',bm:'screen',bb:'12',bgr:'270'}),v=decodeReferenceBackground(q).main;
 assert.deepEqual(v.source,{type:'pattern',index:0});assert.equal(v.color,'#f30342');assert.equal(v.opacity,58);assert.equal(v.scale,153);assert.equal(v.tile,false);assert.deepEqual(v.offset,{x:66.8,y:81.4});assert.equal(v.fit,'meet');assert.equal(v.blendMode,'screen');assert.equal(v.blur,12);assert.equal(v.rotation,-90);
 const tiled=decodeReferenceBackground(new URLSearchParams({bg:'f30342.1.46.92.10.310..3'})).main;
 assert.equal(tiled.tile,true);assert.equal(tiled.scale,92);assert.deepEqual(tiled.offset,{x:1,y:31});
 const defaultTile=decodeReferenceBackground(new URLSearchParams({bg:'ffffff.0.100'})).main;assert.equal(defaultTile.tile,true);assert.equal(defaultTile.scale,100);
});
test('v2 direct percentages and legacy CSS positions convert independently',()=>{
 assert.deepEqual(decodeReferenceBackground(new URLSearchParams({bg:'000000.0.100.0.150.-20.200.2'})).main.offset,{x:150,y:-20});
 assert.deepEqual(decodeReferenceBackground(new URLSearchParams({bg:'000000.0.100.0.150.-20.200'})).main.offset,{x:-50,y:120});
 assert.deepEqual(decodeReferenceBackground(new URLSearchParams({bg:'000000.0.100.0.65.75.150'})).main.offset,{x:65,y:75});
});
test('standalone colors and old background fields are accepted without inventing a gradient',()=>{
 const v=decodeReferenceBackground(new URLSearchParams({bg:'f80',bgpattern:'2',bgtile:'false',bgzoom:'135',bgopacity:'44'}));assert.equal(v.main.color,'#ff8800');assert.equal(v.main.tile,false);assert.equal(v.main.scale,135);assert.equal(v.main.opacity,44);assert.deepEqual(v.main.source,{type:'pattern',index:2});
 assert.equal(decodeReferenceBackground(new URLSearchParams({bg:'clear'})).main.color,'transparent');
 assert.equal(decodeReferenceBackground(new URLSearchParams({bg:'rainbow'})).main.source,null);
});
test('invalid values remain finite and dangerous styles cannot reach the renderer',()=>{
 const v=decodeReferenceBackground(new URLSearchParams({bg:'ffffff.0.NaN.0.Infinity.-Infinity.99999.3',bf:'url(evil)',bm:'url(evil)',bb:'Infinity',bgr:'NaN',bgl:'_p0_s_Infinity_Infinity_NaN_-100_url(evil)_9999_1_Infinity'}));
 assert.deepEqual(v.main.offset,{x:5,y:5});assert.equal(v.main.scale,400);assert.equal(v.main.opacity,100);assert.equal(v.main.blendMode,'normal');assert.equal(v.main.blur,0);assert.equal(v.main.rotation,0);
 assert.equal(v.extras[0].blendMode,'normal');assert.equal(v.extras[0].blur,200);assert.equal(v.extras[0].opacity,0);assert.ok(Object.values(v.extras[0].offset).every(Number.isFinite));
 assert.equal(decodeReferenceBackground(new URLSearchParams({bf:'constructor'})).main.fit,null);assert.equal(decodeReferenceBackground(new URLSearchParams({bgl:'_p0_toString'})).extras[0].fit,null);
});
test('panel masks support all, none and a partial selection in base36',()=>{
 assert.equal(decodeBackgroundPanelMask('',8),null);assert.deepEqual(decodeBackgroundPanelMask('0',8),[]);assert.equal(decodeBackgroundPanelMask((255).toString(36),8),null);assert.deepEqual(decodeBackgroundPanelMask((5).toString(36),8),[0,2]);assert.equal(decodeBackgroundPanelMask('-1',8),null);
});
test('bgl sources, fit, decimal offsets and upload list have independent defaults',()=>{
 const q=new URLSearchParams({bgl:'5_p3_f_125_632_475_60_multiply_12_1_-90|_c1_s|_tg_cover',cbl:'https://example.com/a.png|storage:owner/private.png'}),v=decodeReferenceBackground(q,8);
 assert.deepEqual(v.extras[0],{source:{type:'pattern',index:3},panels:[0,2],fit:'meet',scale:125,offset:{x:63.2,y:47.5},opacity:60,blendMode:'multiply',blur:12,tile:true,rotation:-90});assert.deepEqual(v.extras[1].source,{type:'upload',index:1});assert.equal(v.extras[1].fit,'stretch');assert.deepEqual(v.extras[1].offset,{x:50,y:50});assert.equal(v.extras[2].source.token,'g');assert.equal(v.uploads[1],'storage:owner/private.png');
});
test('non-tile background uses a center coordinate rather than CSS background-position',()=>{
 const r={x:10,y:5,w:100,h:80},i={w:800,h:400};
 assert.deepEqual(referenceBackgroundGeometry(r,i,entry({offset:{x:75,y:25}})),{x:35,y:0,w:100,h:50,imageTile:false,tileWidth:0,tileHeight:0,fit:'stretch'});
 const fill=referenceBackgroundGeometry(r,i,entry(),'label');assert.equal(fill.w,160);assert.equal(fill.h,80);assert.equal(fill.x,-20);
 const stretch=referenceBackgroundGeometry(r,i,entry({fit:'stretch',scale:150}));assert.equal(stretch.w,150);assert.equal(stretch.h,120);
});
test('cassette tile uses label width while J-card tile uses 40 percent of height',()=>{
 const r={x:5,y:0,w:100,h:80},i={w:800,h:400};
 const label=referenceBackgroundGeometry(r,i,entry({tile:true,scale:50,offset:{x:99,y:99}}),'label');assert.equal(label.tileWidth,50);assert.equal(label.tileHeight,25);assert.equal(label.x,5);assert.equal(label.w,100);
 const card=referenceBackgroundGeometry(r,i,entry({tile:true,scale:50}));assert.equal(card.tileHeight,16);assert.equal(card.tileWidth,32);assert.equal(card.h,80);
});
test('pattern bytes are embedded on both surfaces below all covers and decals',async()=>{
 const q=new URLSearchParams({bg:'f30342.0.100.0'}),p=project(q),calls=[];p.surfaces.outer.unshift(makeLayer('image',{category:'albumCover',src:image}));
 const result=await restoreReferenceBackgrounds(p,q,async url=>{calls.push(url);return {src:image}},'jcard',[],size);assert.deepEqual(result,{restored:1,missing:0});assert.equal(calls.length,1);assert.ok(decodeURIComponent(calls[0]).endsWith('/_patterns/00-brick.jpg'));
 for(const s of ['outer','inner']){const l=p.surfaces[s][0];assert.equal(l.referenceBackground,true);assert.equal(l.src,image);assert.equal(l.category,'background');assert.equal(l.fit,'stretch')}
 const next=project(q),cache=Object.values(migrate(p).surfaces).flat();assert.equal((await restoreReferenceBackgrounds(next,q,offline,'jcard',cache,size)).restored,1);assert.equal(next.surfaces.outer[0].src,image);
});
test('AVIF pattern is converted to an accepted embedded format with injected normalizer',async()=>{
 const q=new URLSearchParams({bg:'ffffff.2.100.0'}),p=project(q),raw='data:image/avif;base64,AAAA',calls=[];
 const result=await restoreReferenceBackgrounds(p,q,async()=>({src:raw}),'jcard',[],size,async data=>{calls.push(data);return image});assert.deepEqual(calls,[raw]);assert.equal(result.restored,1);assert.equal(p.surfaces.outer[0].src,image);assert.equal(REFERENCE_BACKGROUND_PATTERNS[2],'02-marbe-bg-2.avif');
 const bad=project(q);assert.equal((await restoreReferenceBackgrounds(bad,q,async()=>({src:'data:image/svg+xml;base64,AAAA'}),'jcard',[],size,async()=>image)).missing,1);
});
test('private and unavailable backgrounds leave replaceable placeholders without credentials',async()=>{
 const q=new URLSearchParams({bg:'131139.c.75.0',cb:'storage:owner/background.png'}),p=project(q);let calls=0;
 const result=await restoreReferenceBackgrounds(p,q,async()=>{calls++},'jcard',[],size);assert.equal(result.missing,1);assert.equal(calls,0);assert.equal(p.surfaces.outer[0].missingReference,true);assert.equal(p.surfaces.outer[0].src,'');assert.equal(p.surfaces.outer[0].opacity,.75);
 const unknown=new URLSearchParams({bg:'ffffff.999.100.0'}),u=project(unknown);assert.equal((await restoreReferenceBackgrounds(u,unknown,offline,'jcard',[],size)).missing,1);
});
test('panel mask selects the mirrored physical panel and clips nonadjacent panels',async()=>{
 const count=4,reversePanel2Bit=count+(count-1-2),q=new URLSearchParams({bg:'ffffff.0.100.0',bgp:(1<<reversePanel2Bit).toString(36)}),p=project(q);
 await restoreReferenceBackgrounds(p,q,async()=>({src:image}),'jcard',[],size);
 assert.equal(p.surfaces.outer[0].visible,false);const l=p.surfaces.inner[0],rects=panelRects(p,'inner'),at=rects.findIndex(r=>r.index===2),width=Math.max(rects[at].w,p.layout.height*2);assert.equal(l.visible,true);assert.deepEqual(l.panelTargets,[at]);assert.equal(l.w,width);assert.ok(Math.abs(l.x-(rects[at].x+rects[at].w/2-width/2))<1e-8);
 const multi=new URLSearchParams({bg:'ffffff.0.100.0',bgp:'5'}),m=project(multi);await restoreReferenceBackgrounds(m,multi,async()=>({src:image}),'jcard',[],size);assert.deepEqual(m.surfaces.outer[0].panelTargets,[0,2]);
});
test('hidden background performs no fetch and cassette side masks are respected',async()=>{
 const q=new URLSearchParams({bg:'ffffff.0.100.0',bgp:'0'}),p=project(q);let calls=0;assert.deepEqual(await restoreReferenceBackgrounds(p,q,async()=>{calls++},'jcard',[],size),{restored:0,missing:0});assert.equal(calls,0);assert.equal(p.surfaces.outer[0].visible,false);
 const side=new URLSearchParams({bg:'ffffff.0.100.0',bgp:'2'}),s=project(side,'cassette');await restoreReferenceBackgrounds(s,side,async()=>({src:image}),'label',[],size);assert.equal(s.surfaces.labelA[0].visible,false);assert.equal(s.surfaces.labelB[0].visible,true);
});
test('rotated frame retains the original center and consecutive imports do not duplicate backgrounds',async()=>{
 const q=new URLSearchParams({bg:'ffffff.0.100.0.630.470..3',bgr:'90',bb:'10'}),p=project(q,'cassette');await restoreReferenceBackgrounds(p,q,async()=>({src:image}),'label',[],size);const l=p.surfaces.labelA[0],d=dimensions(p,'labelA'),a=l.rotation*Math.PI/180;
 assert.ok(Math.abs(l.x+(l.w*Math.cos(a)-l.h*Math.sin(a))/2-d.w*.63)<1e-8);assert.ok(Math.abs(l.y+(l.w*Math.sin(a)+l.h*Math.cos(a))/2-d.h*.47)<1e-8);assert.ok(Math.abs(l.blur-10*d.w/251.16)<1e-12);
 await restoreReferenceBackgrounds(p,q,async()=>({src:image}),'label',[],size);assert.equal(p.surfaces.labelA.filter(l=>l.referenceBackground).length,1);
});
test('large blur and extreme image proportions keep identical background geometry after JSON reopen',async()=>{
 const geometry=l=>Object.fromEntries(['x','y','w','h','rotation','blur','imageTile','tileWidth','tileHeight','fit','opacity','src','panelTargets'].map(k=>[k,l[k]]));
 for(const [path,mode,bg,natural]of [
  ['cassette','label','ffffff.0.100.0',[800,400]],
  ['cassette','label','ffffff.0.100.0.90000.-90000.400.3',[1000000,1]],
  ['cassette','label','ffffff.0.100.50',[1,1000000]],
  ['jcard','jcard','ffffff.0.100.50',[1000000,1]],
 ]){
  const q=new URLSearchParams({bg,bb:'200',bgr:'90'}),p=project(q,path);await restoreReferenceBackgrounds(p,q,async()=>({src:image}),mode,[],async()=>natural);
  const saved=migrate(JSON.parse(JSON.stringify(p))),surfaces=mode==='label'?['labelA','labelB']:['outer','inner'];
  for(const surface of surfaces){
   const before=p.surfaces[surface][0],after=saved.surfaces[surface][0];assert.deepEqual(geometry(after),geometry(before));
   assert.ok(before.blur<=20);for(const k of ['w','h','tileWidth','tileHeight'])assert.ok(Number.isFinite(before[k])&&before[k]>=.1&&before[k]<=1500);
   for(const k of ['x','y','rotation'])assert.ok(Number.isFinite(before[k])&&before[k]>=-2000&&before[k]<=2000);
  }
  if(path==='cassette')assert.equal(p.surfaces.labelA[0].blur,20);
 }
});
