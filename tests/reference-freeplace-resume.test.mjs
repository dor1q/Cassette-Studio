import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,migrate,dimensions} from '../src/model.js';
import {applyReferenceBlocks,hasSuspendedReferenceBlocks,parseReferenceBlocks,resumeReferenceFreePlace,sanitizeReferenceFreePlace} from '../src/reference-freeplace.js';
import {referenceCenterX} from '../src/reference-format.js';
import {rebuildReferenceFlow} from '../src/reference-flow.js';
const center=layer=>{const angle=layer.rotation*Math.PI/180;return [layer.x+(layer.w*Math.cos(angle)-layer.h*Math.sin(angle))/2,layer.y+(layer.w*Math.sin(angle)+layer.h*Math.cos(angle))/2]};
const importBundle=(raw,mode='jcard',extra={})=>{const p=createProject(),q=new URLSearchParams({musicArtist:'Original artist',musicAlbum:'Original album',cl:'hidden',bx:raw,...extra});importReference(p,'https://vhs.texs.org/en/'+(mode==='label'?'cassette':'jcard')+'?'+q);return {p,q}};

test('suspended blocks retain stored values while ordinary parsing and rendering use the original layout',()=>{
 const raw='~|bdefault-spineText_12_26_150_30_5_0_1__~Arial.5.2s.4.10.140.ff6600.r|bdefault-spineText*2_64_71_80_-20_4_1';
 assert.deepEqual(parseReferenceBlocks(raw),[]);
 const stored=parseReferenceBlocks(raw,{includeSuspended:true});assert.equal(stored.length,2);assert.equal(stored[0].locked,true);assert.equal(stored[1].copy,2);
 const {p}=importBundle(raw),baseline=importBundle('').p.surfaces.outer.find(l=>l.source==='spine'),layer=p.surfaces.outer.find(l=>l.source==='spine');
 for(const key of ['x','y','w','h','rotation','size','color','fontWeight','italic','align','locked'])assert.equal(layer[key],baseline[key],key);
 assert.equal(p.surfaces.outer.filter(l=>l.source==='spine').length,1);assert.equal(p.referenceFreePlace.raw,raw);assert.equal(p.referenceFreePlace.applied,0);assert.equal(hasSuspendedReferenceBlocks(p),true);
});

test('resuming applies retained geometry, independent style and hidden copies exactly once',()=>{
 const raw='~|bdefault-spineText_12_26_150_30_5_0_1__~Arial.5.2s.4.10.140.ff6600.r|bdefault-spineText*2_64_71_80_-20_4_1',active=raw.slice(2);
 const {p}=importBundle(raw),expected=importBundle(active).p;
 assert.deepEqual(resumeReferenceFreePlace(p),{applied:2,unsupported:[],resumed:true});
 const actual=p.surfaces.outer.filter(l=>l.source==='spine'),target=expected.surfaces.outer.filter(l=>l.source==='spine');assert.equal(actual.length,2);
 for(let i=0;i<actual.length;i++)for(const key of ['x','y','w','h','rotation','size','color','fontWeight','italic','align','locked','visible'])assert.equal(actual[i][key],target[i][key],key);
 assert.equal(actual[0].referenceOwnColor,true);assert.equal(actual[1].visible,false);assert.equal(hasSuspendedReferenceBlocks(p),false);assert.equal(p.referenceFreePlace.raw,active);
 const snapshot=structuredClone(p.surfaces);assert.equal(resumeReferenceFreePlace(p).resumed,false);assert.deepEqual(p.surfaces,snapshot);
 for(const layer of actual){assert.equal(Object.hasOwn(layer,'referenceSuspendedBlock'),false);assert.equal(Object.hasOwn(layer,'referenceFreePlaceToken'),false)}
});

test('suspended cassette labels resume on their stored mode and preserve side isolation through JSON reload',()=>{
 const {p}=importBundle('~|bB-album_24_81_125_15_47_0','label',{ss:'0'}),beforeA=structuredClone(p.surfaces.labelA),originalId=p.surfaces.labelB.find(l=>l.source==='album').id;
 const reopened=migrate(JSON.parse(JSON.stringify(p)));assert.notEqual(reopened.surfaces.labelB.find(l=>l.source==='album').id,originalId);
 const a=reopened.surfaces.labelA.map(({id,...layer})=>layer);for(let i=0;i<a.length;i++)for(const key of ['x','y','w','h','rotation','size','color','visible','locked'])assert.equal(a[i][key],beforeA[i][key],key);
 assert.equal(reopened.referenceFreePlace.mode,'label');assert.equal(resumeReferenceFreePlace(reopened).applied,1);
 const layer=reopened.surfaces.labelB.find(l=>l.source==='album'),[x,y]=center(layer),d=dimensions(reopened,'labelB');assert.ok(Math.abs(x-d.w*.24)<1e-9);assert.ok(Math.abs(y-d.h*.81)<1e-9);
 assert.deepEqual(reopened.surfaces.labelA.map(({id,...item})=>item),a);assert.equal(reopened.surfaces.outer.some(l=>l.referenceBlock),false);
});

test('the image restoration pass marks eligible logos without changing them before resume',()=>{
 const {p,q}=importBundle('~|bdefault-spineText_20_45_150_30_5_0|bdefault-spineLogo_33_22_120_-35_4_0_1|bdefault-spineLogo*2_40_70_80_15_7_1');
 const logo=makeLayer('image',{source:'referenceSpineLogo',src:'data:image/png;base64,aW1hZ2U=',x:26,y:3,w:8,h:8,cropRotation:90});p.surfaces.outer.push(logo);const baseline=structuredClone(logo);
 const token=p.referenceFreePlace.token;applyReferenceBlocks(p,q,'jcard',{pending:true});assert.equal(p.referenceFreePlace.token,token);assert.equal(logo.referenceFreePlaceToken,token);
 for(const key of ['x','y','w','h','rotation','cropRotation','visible','locked'])assert.equal(logo[key],baseline[key]);
 const reopened=migrate(p);assert.deepEqual(resumeReferenceFreePlace(reopened),{applied:3,unsupported:[],resumed:true});
 const image=reopened.surfaces.outer.find(l=>l.source==='referenceSpineLogo'),[x,y]=center(image);assert.ok(Math.abs(x-referenceCenterX(reopened,33))<1e-9);assert.ok(Math.abs(y-dimensions(reopened,'outer').h*.22)<1e-9);assert.equal(image.locked,true);assert.equal(image.cropRotation,90);
 assert.equal(reopened.surfaces.outer.filter(l=>l.source==='referenceSpineLogo').length,2);
});

test('a later replacement logo cannot inherit suspended parameters from a missing original asset',()=>{
 const {p,q}=importBundle('~|bdefault-spineLogo_33_22_120_-35_4_0_1|bdefault-spineText_20_45_150_30_5_0');applyReferenceBlocks(p,q,'jcard',{pending:true});
 const replacement=makeLayer('image',{source:'referenceSpineLogo',x:7,y:11,w:9,h:9});p.surfaces.outer.push(replacement);const before=structuredClone(replacement);
 const result=resumeReferenceFreePlace(p);assert.equal(result.applied,1);assert.deepEqual(result.unsupported,['default-spineLogo']);assert.deepEqual(replacement,before);
});

test('replacing a previously eligible layer does not attach suspension by source name',()=>{
 const {p}=importBundle('~|bA-artist_71_24_200_50_63_0','label');p.surfaces.labelA=p.surfaces.labelA.filter(l=>l.source!=='artist');
 const replacement=makeLayer('text',{source:'artist',x:7,y:11,w:29,h:19});p.surfaces.labelA.push(replacement);const before=structuredClone(replacement);
 assert.deepEqual(resumeReferenceFreePlace(p),{applied:0,unsupported:['A-artist'],resumed:true});assert.deepEqual(replacement,before);
});

test('invalid or unsupported suspended bundle segments do not become actionable transforms',()=>{
 const {p}=importBundle('~');assert.equal(hasSuspendedReferenceBlocks(p),false);assert.equal(resumeReferenceFreePlace(p).resumed,false);
 const odd=importBundle('~bdefault-spineText_10_20_100_0_5_0|bdefault-spineText_35_61_100_0_5_0').p;
 assert.deepEqual(resumeReferenceFreePlace(odd),{applied:1,unsupported:[],resumed:true});assert.equal(odd.referenceFreePlace.suspended,false);const [,y]=center(odd.surfaces.outer.find(l=>l.source==='spine'));assert.ok(Math.abs(y-dimensions(odd,'outer').h*.61)<1e-9);
});

test('saved state sanitization bounds raw data, identities and markers before it can drive resume',()=>{
 const {p}=importBundle('~|bdefault-spineText_20_45_150_30_5_0'),token=p.referenceFreePlace.token,layer=p.surfaces.outer.find(l=>l.source==='spine');
 Object.assign(p.referenceFreePlace,{raw:p.referenceFreePlace.raw+'|'.repeat(40000),applied:900,appliedKeys:['default-spineText*1','default-spineText*1','other-block*2','bad*key',null],unsupported:['default-spineLogo','default-spineLogo','../bad'],mode:'invalid'});
 const unrelated=makeLayer('text',{source:'album',referenceSuspendedBlock:'other-album',referenceFreePlaceToken:token});p.surfaces.outer.push(unrelated);sanitizeReferenceFreePlace(p);
 assert.equal(p.referenceFreePlace.raw.length,30000);assert.deepEqual(p.referenceFreePlace.appliedKeys,['default-spineText*1']);assert.equal(p.referenceFreePlace.applied,1);assert.deepEqual(p.referenceFreePlace.unsupported,['default-spineLogo']);assert.equal(p.referenceFreePlace.mode,'jcard');assert.equal(layer.referenceFreePlaceToken,token);assert.equal(Object.hasOwn(unrelated,'referenceSuspendedBlock'),false);
 p.referenceFreePlace.token={invalid:true};sanitizeReferenceFreePlace(p);assert.equal(p.referenceFreePlace.token,'');assert.equal(Object.hasOwn(layer,'referenceSuspendedBlock'),false);assert.equal(resumeReferenceFreePlace(p).applied,1);
});

test('suspended content can be archived by reducing panels, saved and resumed after the panel returns',()=>{
 const {p}=importBundle('~|bdefault-inside1_61_37_125_20_15_0');const token=p.referenceFreePlace.token;
 p.layout.panels=3;rebuildReferenceFlow(p);assert.equal(p.surfaces.outer.some(l=>l.referenceSuspendedBlock),false);assert.equal(p.referenceFlowArchive.find(l=>l.referenceSuspendedBlock==='default-inside1').referenceFreePlaceToken,token);
 const reopened=migrate(JSON.parse(JSON.stringify(p)));assert.equal(reopened.referenceFlowArchive.find(l=>l.referenceSuspendedBlock==='default-inside1').referenceFreePlaceToken,token);
 reopened.layout.panels=4;rebuildReferenceFlow(reopened);const target=reopened.surfaces.outer.find(l=>l.referenceSuspendedBlock==='default-inside1');assert.ok(target);assert.equal(resumeReferenceFreePlace(reopened).applied,1);const [x,y]=center(target);assert.ok(Math.abs(x-referenceCenterX(reopened,61))<1e-9);assert.ok(Math.abs(y-dimensions(reopened,'outer').h*.37)<1e-9);
});
