import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {restoreReferenceBackgrounds} from '../src/reference-background.js';
import {missingReferenceImages,retryReferenceImages} from '../src/reference-image-retry.js';
import {storeMusicGallery} from '../src/cover-gallery.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+/lHkAAAAASUVORK5CYII=';
const size=async()=>[800,400],offline=async()=>{throw Error('offline')};

test('manual replacement for an unavailable gallery index survives JSON reopen and reapplying the same link',async()=>{
 const params=new URLSearchParams({id:'sa.album-one',bg:'131139.t17.80.0'}),p=createProject();p.referenceBackgroundChoices=[];
 await restoreReferenceBackgrounds(p,params,offline,'label',[],size);
 for(const surface of ['labelA','labelB']){const layer=p.surfaces[surface].find(l=>l.referenceBackground);layer.src=image;delete layer.missingReference}
 const saved=migrate(JSON.parse(JSON.stringify(p))),next=createProject();next.referenceBackgroundChoices=[];
 const result=await restoreReferenceBackgrounds(next,params,offline,'label',Object.values(saved.surfaces).flat(),size);
 assert.deepEqual(result,{restored:1,missing:0});
 for(const surface of ['labelA','labelB'])assert.equal(next.surfaces[surface].find(l=>l.referenceBackground).src,image);
});

test('an unavailable index in another album cannot inherit the previous manual picture',async()=>{
 const old=new URLSearchParams({id:'sa.old-album',bg:'131139.t17.80.0'}),p=createProject();p.referenceBackgroundChoices=[];
 await restoreReferenceBackgrounds(p,old,offline,'label',[],size);p.surfaces.labelA.find(l=>l.referenceBackground).src=image;
 const next=createProject();next.referenceBackgroundChoices=[];const changed=new URLSearchParams(old);changed.set('id','sa.new-album');
 assert.equal((await restoreReferenceBackgrounds(next,changed,offline,'label',Object.values(p.surfaces).flat(),size)).missing,1);
 assert.equal(next.surfaces.labelA.find(l=>l.referenceBackground).src,'');
});

test('retry loads a shared public asset once and preserves edited text and frames',async()=>{
 const p=createProject(),key='https://vhs.texs.org/_patterns/04-pattern.png';p.layout.sync=false;
 for(const surface of ['labelA','labelB'])p.surfaces[surface].push(makeLayer('image',{name:'Картинка — замените файл',src:'',missingReference:true,referenceAssetKey:key,x:7,y:4,w:20,h:15,rotation:35,cropZoom:1.7}));
 const text=structuredClone(p.surfaces.labelA.filter(l=>l.type==='text'));let calls=0;
 const result=await retryReferenceImages(p,async()=>{calls++;return {src:image}},{getDimensions:size});
 assert.equal(calls,1);assert.equal(result.restored,2);assert.equal(missingReferenceImages(p).length,0);
 assert.deepEqual(p.surfaces.labelA.filter(l=>l.type==='text'),text);
 for(const surface of ['labelA','labelB']){const layer=p.surfaces[surface].at(-1);assert.equal(layer.src,image);assert.deepEqual([layer.x,layer.y,layer.w,layer.h,layer.rotation,layer.cropZoom],[7,4,20,15,35,1.7]);assert.equal(layer.name,'Картинка')}
});

test('locked synchronized A/B images are not replaced through the unlocked counterpart',async()=>{
 const p=createProject(),key='https://vhs.texs.org/_patterns/04-pattern.png';
 for(const surface of ['labelA','labelB'])p.surfaces[surface].push(makeLayer('image',{missingReference:true,referenceAssetKey:key,locked:surface==='labelA'}));
 const result=await retryReferenceImages(p,()=>{assert.fail('Locked pair must not fetch')},{getDimensions:size});
 assert.equal(result.locked,2);assert.equal(result.restored,0);assert.ok(p.surfaces.labelB.at(-1).missingReference);
});

test('unresolved and private files stay replaceable without attempting account access',async()=>{
 const p=createProject();p.surfaces.outer.push(makeLayer('image',{missingReference:true,referenceAssetKey:'storage:owner/file.png'}),makeLayer('image',{missingReference:true}));
 const result=await retryReferenceImages(p,()=>{assert.fail('Private source must not fetch')},{getDimensions:size});
 assert.equal(result.missing,2);assert.equal(missingReferenceImages(p).length,2);assert.ok(result.warnings.length);
});

test('refreshing gallery metadata recovers the requested image without substituting another index',async()=>{
 const params=new URLSearchParams({id:'sa.album',bg:'131139.t3.100.0'}),p=createProject();p.referenceBackgroundChoices=[];
 await restoreReferenceBackgrounds(p,params,offline,'jcard',[],size);let calls=0,refreshed=0;
 const result=await retryReferenceImages(p,async url=>{calls++;assert.ok(decodeURIComponent(url).endsWith('https://vhs.texs.org/chosen.jpg'));return {src:image}},{getDimensions:size,refreshGallery:async project=>{refreshed++;project.referenceBackgroundChoices=[{file_path:'https://vhs.texs.org/main.jpg'},null,null,{file_path:'https://vhs.texs.org/chosen.jpg'}]}});
 assert.equal(refreshed,1);assert.equal(calls,1);assert.equal(result.restored,2);assert.equal(result.missing,0);
 assert.equal(p.surfaces.outer.find(l=>l.referenceBackground).referenceAssetKey,'https://vhs.texs.org/chosen.jpg');
});

test('retry adjusts an untouched placeholder to the real aspect ratio while retaining manually moved geometry',async()=>{
 const params=new URLSearchParams({bg:'131139.t1.100.0'}),p=createProject();p.referenceBackgroundChoices=[null,{file_path:'https://vhs.texs.org/chosen.jpg'}];
 await restoreReferenceBackgrounds(p,params,offline,'jcard',[],size);
 const outer=p.surfaces.outer.find(l=>l.referenceBackground),inner=p.surfaces.inner.find(l=>l.referenceBackground),originalWidth=outer.w;
 inner.x+=5;const edited=Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,inner[key]]));
 await retryReferenceImages(p,async()=>({src:image}),{getDimensions:size});
 assert.notEqual(outer.w,originalWidth);assert.equal(outer.w/outer.h,2);
 assert.deepEqual(Object.fromEntries(Object.keys(edited).map(key=>[key,inner[key]])),edited);
});

test('album names scope manual gallery replacements when the link has no service id',async()=>{
 const params=new URLSearchParams({musicArtist:'Artist',musicAlbum:'Old album',bg:'131139.t17.100.0'}),old=createProject();old.referenceBackgroundChoices=[];
 await restoreReferenceBackgrounds(old,params,offline,'label',[],size);
 const replacement=old.surfaces.labelA.find(l=>l.referenceBackground);replacement.src=image;delete replacement.missingReference;
 const next=createProject();next.referenceBackgroundChoices=[];const changed=new URLSearchParams(params);changed.set('musicAlbum','New album');
 const result=await restoreReferenceBackgrounds(next,changed,offline,'label',Object.values(old.surfaces).flat(),size);
 assert.equal(result.restored,0);assert.equal(result.missing,1);
 for(const surface of ['labelA','labelB'])assert.equal(next.surfaces[surface].find(l=>l.referenceBackground).src,'');
});

test('retry never resolves a retained old album index through a newly imported album gallery',async()=>{
 const oldId='0123456789ABCDEFGHIJKL',newId='ABCDEFGHIJKL0123456789',oldUrl='https://open.spotify.com/album/'+oldId,newUrl='https://open.spotify.com/album/'+newId;
 const params=new URLSearchParams({id:'sa.'+oldId,playlistUrl:oldUrl,musicArtist:'Old artist',musicAlbum:'Old album',bg:'131139.t0.100.0'}),p=createProject();p.referenceBackgroundChoices=[];
 await restoreReferenceBackgrounds(p,params,offline,'label',[],size);
 Object.assign(p.data,{artist:'New artist',album:'New album',url:newUrl});
 storeMusicGallery(p,{artist:'New artist',album:'New album',url:newUrl,cover:'https://vhs.texs.org/new-album.jpg',tracks:[]});
 const result=await retryReferenceImages(p,()=>{assert.fail('A new album gallery must not supply an old album index')},{getDimensions:size});
 assert.equal(result.restored,0);assert.equal(result.missing,2);
 for(const surface of ['labelA','labelB'])assert.equal(p.surfaces[surface].find(l=>l.referenceBackground).src,'');
});

test('a valid locked synchronized counterpart also blocks retry of its missing paired image',async()=>{
 const p=createProject(),key='https://vhs.texs.org/_patterns/04-pattern.png';
 p.surfaces.labelA.push(makeLayer('image',{src:image,referenceAssetKey:key,locked:true}));
 p.surfaces.labelB.push(makeLayer('image',{src:'',referenceAssetKey:key,missingReference:true}));
 const result=await retryReferenceImages(p,()=>{assert.fail('A locked pair must not fetch')},{getDimensions:size});
 assert.equal(result.restored,0);assert.equal(result.locked,1);assert.equal(p.surfaces.labelA.at(-1).src,image);assert.equal(p.surfaces.labelB.at(-1).src,'');
});

test('retry preserves manual fitting, tiling and panel choices even when coordinates remain unchanged',async()=>{
 const params=new URLSearchParams({bg:'131139.t1.100.0'}),p=createProject();p.referenceBackgroundChoices=[null,{file_path:'https://vhs.texs.org/chosen.jpg'}];
 await restoreReferenceBackgrounds(p,params,offline,'jcard',[],size);
 const layer=p.surfaces.outer.find(l=>l.referenceBackground);layer.fit='meet';layer.imageTile=true;layer.panelTargets=[2];
 const keys=['x','y','w','h','rotation','tileWidth','tileHeight','fit','imageTile','panelTargets'],manual=structuredClone(Object.fromEntries(keys.map(key=>[key,layer[key]])));
 const result=await retryReferenceImages(p,async()=>({src:image}),{getDimensions:size});
 assert.equal(result.restored,2);assert.equal(layer.src,image);
 assert.deepEqual(Object.fromEntries(keys.map(key=>[key,layer[key]])),manual);
});
