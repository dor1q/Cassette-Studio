import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate,dimensions} from '../src/model.js';
import {restoreReferenceCover,restoreReferenceLogo} from '../src/reference-images.js';
import {loadReferenceImage,referenceImageSource} from '../src/reference-image-source.js';
import {restoreReferenceDecals,parseReferenceCustomDecals} from '../src/reference-assets.js';
import {applyReferenceBlocks} from '../src/reference-freeplace.js';
import {referenceCenterX} from '../src/reference-format.js';
import {renderSvg} from '../src/render.js';
const image='data:image/png;base64,iVBORw0KGgo=',offline=async()=>{throw Error('offline')},size=async()=>[800,400];
const project=(q,path='jcard')=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/'+path+'?'+q);return p};

test('custom cover replaces album artwork, preserves URL cropping, and survives offline reload',async()=>{
 const q=new URLSearchParams({cp:'https://vhs.texs.org/_patterns/00-brick.jpg',id:'sa.5SknXhmjHijD0uU1Pm2HBr',mp:'1.1.20.10.-20.90',pf:'f',opacity:'.6'}),p=project(q),calls=[];
 const result=await restoreReferenceCover(p,q,async path=>{calls.push(path);return {src:image}},'jcard',[],size);
 assert.equal(result.handled,true);assert.equal(result.restored,1);assert.equal(calls.length,1);assert.ok(calls[0].startsWith('/api/image?'));
 const cover=p.surfaces.outer.find(l=>l.category==='albumCover');assert.equal(cover.src,image);assert.equal(cover.fit,'meet');assert.equal(cover.cropZoom,1.2);assert.equal(cover.cropRotation,90);assert.equal(cover.opacity,.6);
 const saved=migrate(p),next=project(q);const cached=[...Object.values(saved.surfaces).flat(),...saved.uploads];
 assert.equal((await restoreReferenceCover(next,q,offline,'jcard',cached,size)).restored,1);
 assert.equal(next.surfaces.outer.find(l=>l.category==='albumCover').src,image);
 const changed=project(new URLSearchParams({cp:'https://vhs.texs.org/different.png'}));
 assert.equal((await restoreReferenceCover(changed,new URLSearchParams({cp:'https://vhs.texs.org/different.png'}),offline,'jcard',cached,size)).missing,1);
});
test('hidden artwork never fetches a custom cover and legacy cp bundles are left for metadata loading',async()=>{
 for(const q of [new URLSearchParams({cp:'https://vhs.texs.org/image.png',mp:'_'}),new URLSearchParams({cp:'0.1.10.0.0.0'})]){
  const p=project(q);let calls=0;const result=await restoreReferenceCover(p,q,async()=>{calls++;throw Error('must not fetch')});assert.equal(result.handled,false);assert.equal(calls,0);
 }
});
test('inline cover works on both cassette labels without a network request',async()=>{
 const q=new URLSearchParams({cp:image,pf:'f'}),p=project(q,'cassette');
 const result=await restoreReferenceCover(p,q,offline,'label',[],size);assert.equal(result.restored,1);
 for(const s of ['labelA','labelB'])assert.equal(p.surfaces[s][0].src,image);
});
test('private storage cover leaves a replaceable layer without requesting original credentials',async()=>{
 const q=new URLSearchParams({cp:'storage:owner/library/cover.png'}),p=project(q);let calls=0;
 const result=await restoreReferenceCover(p,q,async()=>{calls++});assert.equal(result.missing,1);assert.equal(calls,0);
 const layer=migrate(p).surfaces.outer.find(l=>l.category==='albumCover');assert.equal(layer.missingReference,true);assert.equal(layer.src,'');assert.match(renderSvg(p,'outer',{editing:true}).svg,/Загрузите изображение/);assert.doesNotMatch(renderSvg(p,'outer',{editing:false}).svg,/Загрузите изображение/);
});
test('logo placement is applied after image loading without moving text twice',async()=>{
 const q=new URLSearchParams({cl:'/_music-company-logos/warner.png',bx:'bdefault-spineText_20_45_150_30_5_0|bdefault-spineLogo_33_22_120_-35_4_0_1|bdefault-spineLogo*2_40_70_80_15_7_1'}),p=project(q);
 const spine=structuredClone(p.surfaces.outer.find(l=>l.source==='spine'));
 const logo=await restoreReferenceLogo(p,q,async()=>({src:image}),'jcard',[],size);assert.equal(logo.restored,1);
 applyReferenceBlocks(p,q,'jcard',{pending:true});assert.deepEqual(p.surfaces.outer.find(l=>l.source==='spine'),spine);
 const l=p.surfaces.outer.find(l=>l.source==='referenceSpineLogo'),a=l.rotation*Math.PI/180;
 assert.ok(Math.abs(l.x+(l.w*Math.cos(a)-l.h*Math.sin(a))/2-referenceCenterX(p,33))<1e-8);
 assert.ok(Math.abs(l.y+(l.w*Math.sin(a)+l.h*Math.cos(a))/2-dimensions(p,'outer').h*.22)<1e-8);
 assert.equal(l.locked,true);assert.equal(l.cropRotation,90);assert.equal(p.referenceFreePlace.applied,3);assert.deepEqual(p.referenceFreePlace.unsupported,[]);
 const before=structuredClone(p.surfaces);applyReferenceBlocks(p,q,'jcard',{pending:true});assert.deepEqual(p.surfaces,before);
 assert.equal(migrate(p).surfaces.outer.find(l=>l.referenceBlockCopy===2).visible,false);
});
test('hidden logo never fetches and an unavailable explicit logo becomes a placeholder',async()=>{
 const q=new URLSearchParams({cl:'hidden'}),p=project(q);assert.deepEqual(await restoreReferenceLogo(p,q,offline),{restored:0,missing:0});assert.equal(p.surfaces.outer.some(l=>l.source==='referenceSpineLogo'),false);
 const bad=new URLSearchParams({cl:'storage:owner/logo.png'}),b=project(bad);assert.equal((await restoreReferenceLogo(b,bad,offline)).missing,1);assert.equal(b.surfaces.outer.at(-1).missingReference,true);
});
test('custom decal bytes are combined with d geometry, side, stretch and tint',async()=>{
 const q=new URLSearchParams({ds:'1',cd:JSON.stringify([{id:'custom-under-123',src:image,label:'Uploaded',x:1,y:2,side:'front'}]),d:'custom-under-123_30_50_-90_125_u_b_c_xaabbcc_r90'}),p=project(q);
 const result=await restoreReferenceDecals(p,q,offline,size);assert.deepEqual(result,{restored:1,missing:0,placeholders:0});
 assert.equal(p.surfaces.outer.some(l=>l.referenceId),false);const l=p.surfaces.inner.find(l=>l.referenceId==='custom-under-123');assert.equal(l.src,image);assert.equal(l.rotation,-90);assert.equal(l.tintMode,'tint');assert.equal(l.tintColor,'#aabbcc');assert.equal(l.fit,'stretch');assert.equal(l.referenceDecalLayer,'under');
 const saved=migrate(p),next=project(q);assert.equal((await restoreReferenceDecals(next,q,offline,size,'outer',Object.values(saved.surfaces).flat())).restored,1);
});
test('cd can contain a decal without d, and back-side uploads disable cassette synchronization',async()=>{
 const q=new URLSearchParams({cd:JSON.stringify([{id:'custom-123',src:image,layer:'background',side:'back',x:70,y:20,scale:50,rotation:20,colorizeMode:'solid',colorOverride:'#ff9900'}])}),p=project(q,'cassette');
 assert.equal(p.layout.sync,false);assert.equal((await restoreReferenceDecals(p,q,offline,size,'labelA')).restored,1);
 assert.equal(p.surfaces.labelA.some(l=>l.referenceId==='custom-123'),false);assert.equal(p.surfaces.labelB[0].referenceId,'custom-123');assert.equal(p.surfaces.labelB[0].tintColor,'#ff9900');
 const forced=new URLSearchParams(q);forced.set('ss','1');const sync=project(forced,'cassette');await restoreReferenceDecals(sync,forced,offline,size,'labelA');assert.equal(sync.surfaces.labelA[0].src,image);assert.equal(sync.surfaces.labelB[0].src,image);
});
test('invalid cd entries and unsafe image schemes cannot become remote renderer sources',async()=>{
 assert.deepEqual(parseReferenceCustomDecals('{invalid'),[]);
 assert.equal(parseReferenceCustomDecals(JSON.stringify([{id:'not-custom',src:image},{id:'custom-a',src:image},{id:'custom-a',src:image}])).length,1);
 for(const value of ['javascript:alert(1)','file:///C:/private.png','https://user:password@example.com/image.png','data:image/svg+xml;base64,AAAA','blob:fake'])assert.equal(referenceImageSource(value),null);
 assert.equal(referenceImageSource('/_music-company-logos/warner.png'),'https://vhs.texs.org/_music-company-logos/warner.png');
 await assert.rejects(loadReferenceImage('https://vhs.texs.org/image.png',async()=>({src:'https://other.com/image.png'}),size));
 await assert.rejects(loadReferenceImage(image,offline,async()=>[Infinity,0]));
});
test('multiple text copies use the original geometry independently of a moved base',()=>{
 const q=new URLSearchParams({bx:'bA-artist_20_15_200_30_40_0|bA-artist*2_50_50_100_0_20_0|bA-artist*3_70_70_100_0_20_0'}),p=project(q,'cassette');
 const list=p.surfaces.labelA.filter(l=>l.source==='artist');assert.equal(list.length,3);assert.equal(list[1].w,list[2].w);assert.equal(list[1].h,list[2].h);assert.equal(list[1].size,list[2].size);assert.equal(list[1].rotation,0);assert.equal(list[2].rotation,0);
});
