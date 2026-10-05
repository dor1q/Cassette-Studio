import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {applyAlbumArt,fitCoverImage,parseReferenceArtwork,applyReferenceArtwork,referenceArtworkKey,cachedReferenceArtwork} from '../src/album-art.js';
import {renderSvg} from '../src/render.js';
test('locked design imports cover to both formats without changing text layers',()=>{
 const p=createProject(),text=p.surfaces.outer[0];p.settings.lockDesign=true;
 applyAlbumArt(p,'first');
 assert.equal(p.surfaces.outer[0].src,'first');assert.equal(p.surfaces.outer[1],text);
 assert.equal(p.surfaces.labelA[0].src,'first');assert.equal(p.surfaces.labelB[0].src,'first');
 Object.assign(p.surfaces.outer[0],{x:45,w:50,opacity:.3,rotation:20});
 applyAlbumArt(p,'second');
 assert.equal(p.surfaces.outer[0].x,45);assert.equal(p.surfaces.outer[0].opacity,.3);
 assert.equal(p.surfaces.outer.filter(l=>l.category==='albumCover').length,1);
 assert.equal(p.uploads.length,1);assert.equal(p.uploads[0].src,'second');
});
test('side-specific artwork does not replace the other side or custom images',()=>{
 const p=createProject(),custom=makeLayer('image',{name:'Моя картинка',src:'custom'});p.surfaces.labelB.unshift(custom);
 applyAlbumArt(p,'album','B');
 assert.equal(p.surfaces.labelB[1],custom);assert.equal(p.surfaces.labelB[0].src,'album');
 assert.equal(p.surfaces.labelA.some(l=>l.type==='image'),false);
 assert.equal(p.surfaces.outer.some(l=>l.type==='image'),false);
});

test('replacing artwork drops stale gallery asset keys from its frame and cache',()=>{
 const p=createProject();applyAlbumArt(p,'first');
 p.surfaces.outer[0].referenceAssetKey='https://example.com/first.jpg';p.surfaces.outer[0].referenceCoverIndex=2;
 p.uploads[0].referenceAssetKey='https://example.com/first.jpg';applyAlbumArt(p,'second');
 assert.equal(p.surfaces.outer[0].referenceAssetKey,undefined);assert.equal(p.surfaces.outer[0].referenceCoverIndex,undefined);
 assert.equal(p.uploads[0].referenceAssetKey,undefined);assert.equal(p.uploads[0].src,'second');
});

test('new cover clears old cropping and preserves the existing frame',()=>{
 const p=createProject(),cover=makeLayer('image',{category:'art',name:'upload.png',src:'old',x:48,y:9,w:30,h:60,cropRotation:-45,cropX:2,cropZoom:1.3});
 p.surfaces.outer.unshift(cover);applyAlbumArt(p,'new');
 assert.equal(p.surfaces.outer[0],cover);assert.equal(cover.src,'new');assert.equal(cover.category,'albumCover');
 assert.equal(cover.fit,'meet');assert.equal(cover.cropRotation,0);assert.equal(cover.cropX,0);assert.equal(cover.cropZoom,1);assert.equal(cover.x,48);
 assert.equal(cover.y,9);assert.equal(cover.w,30);assert.equal(cover.h,60);
 assert.equal(p.surfaces.outer.filter(l=>l.type==='image').length,1);
});

test('complete cover fit survives saving and SVG export in portrait J-card and wide label frames',()=>{
 const p=createProject();applyAlbumArt(p,'data:image/png;base64,AA==');
 for(const surface of ['outer','labelA','labelB']){
  const layer=p.surfaces[surface][0];
  assert.equal(layer.fit,'meet');assert.equal(layer.cropZoom,1);
  assert.match(renderSvg(p,surface).svg,/preserveAspectRatio="xMidYMid meet"/);
 }
 const saved=migrate(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.surfaces.outer[0].fit,'meet');assert.equal(saved.surfaces.labelA[0].fit,'meet');
 const uploaded=makeLayer('image',{category:'art',fit:'slice',cropZoom:3,cropX:17,cropY:-9,cropRotation:90,w:45,h:85});
 fitCoverImage(uploaded);assert.equal(uploaded.fit,'meet');assert.equal(uploaded.cropZoom,1);assert.equal(uploaded.cropX,0);assert.equal(uploaded.cropY,0);assert.equal(uploaded.cropRotation,0);assert.equal(uploaded.w,45);assert.equal(uploaded.h,85);
});

test('original artwork parameters restore zoom and pixel offsets in physical units',()=>{
 const p=createProject();applyAlbumArt(p,'data:image/png;base64,AA==');
 applyReferenceArtwork(p,new URLSearchParams({mp:'0.1.10.33.-218.30',opacity:'.3'}),640,640);
 const art=p.surfaces.outer[0];
 assert.ok(Math.abs(art.cropZoom-1.1/(101.6/65.1))<1e-8);
 assert.ok(Math.abs(art.cropX-1.397)<1e-8);assert.ok(Math.abs(art.cropY+9.2286666667)<1e-8);
 assert.equal(art.cropRotation,30);assert.equal(art.rotation,0);assert.equal(art.opacity,.3);
 assert.equal(p.surfaces.labelA[0].cropRotation,0);
 const saved=migrate(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.surfaces.outer[0].cropRotation,30);
 assert.match(renderSvg(saved,'outer').svg,/scale\([^)]*\) rotate\(30\) translate/);
 assert.equal(parseReferenceArtwork('0.99.00.0.0.0'),null);
 assert.equal(parseReferenceArtwork('0.1.00.0.0.99999'),null);
});

test('original Fit mode keeps contain scaling and does not move the image frame',()=>{
 const p=createProject();applyAlbumArt(p,'data:image/png;base64,AA==');const art=p.surfaces.outer[0],frame=[art.x,art.y,art.w,art.h];
 applyReferenceArtwork(p,new URLSearchParams({mp:'0.1.25.-10.50.-45',pf:'f'}),640,640);
 assert.equal(art.fit,'meet');assert.equal(art.cropZoom,1.25);assert.equal(art.cropRotation,-45);
 assert.deepEqual([art.x,art.y,art.w,art.h],frame);
});

test('repeat reference import reuses embedded album artwork only for the same source',()=>{
 const p=createProject(),url='https://vhs.texs.org/en/cassette?id=a.1586476451';applyAlbumArt(p,'embedded');p.referenceArtworkSource=referenceArtworkKey(url);
 assert.equal(cachedReferenceArtwork(p,url+'&mp=0.1.00.0.0.30'),'embedded');
 assert.equal(cachedReferenceArtwork(p,'https://vhs.texs.org/en/jcard?id=a.1586476451'),'embedded');
 assert.equal(cachedReferenceArtwork(p,'https://vhs.texs.org/en/cassette?id=a.123'),'');
 assert.equal(cachedReferenceArtwork(p,'https://vhs.texs.org/en/cassette?musicArtist=Other'),'');
 const saved=migrate(JSON.parse(JSON.stringify(p)));assert.equal(cachedReferenceArtwork(saved,url),'');
 // Imported projects retain valid image bytes; placeholder data in this test is discarded.
 p.uploads[0].src='data:image/png;base64,AA==';assert.equal(cachedReferenceArtwork(migrate(p),url),p.uploads[0].src);
});

test('legacy cassette image parameters match equivalent modern bundles in each supported format',()=>{
 for(const mode of ['label','jcard']){
  const legacy=createProject(),modern=createProject();applyAlbumArt(legacy,'data:image/png;base64,AA==');applyAlbumArt(modern,'data:image/png;base64,AA==');
  applyReferenceArtwork(legacy,new URLSearchParams({cassetteScale:'1.5',cassetteOffsetX:'12',cassetteOffsetY:'-24',cassetteRotation:'90',pf:'f',opacity:'.7'}),900,600,mode);
  applyReferenceArtwork(modern,new URLSearchParams({mp:'0.1.50.12.-24.90',pf:'f',opacity:'.7'}),900,600,mode);
  for(const surface of mode==='label'?['labelA','labelB']:['outer']){
   const a=legacy.surfaces[surface].find(l=>l.category==='albumCover'),b=modern.surfaces[surface].find(l=>l.category==='albumCover');
   for(const key of ['x','y','w','h','fit','cropZoom','cropX','cropY','cropRotation','opacity'])assert.equal(a[key],b[key]);
  }
  const saved=migrate(JSON.parse(JSON.stringify(legacy)));
  assert.match(renderSvg(saved,mode==='label'?'labelA':'outer').svg,/rotate\(90\)/);
 }
});

test('modern image bundles override stale legacy transforms and hidden artwork stays hidden',()=>{
 const project=createProject();applyAlbumArt(project,'data:image/png;base64,AA==');
 const params=new URLSearchParams({mp:'0.1.25.-10.50.-45',cassetteScale:'5',cassetteOffsetX:'999',cassetteOffsetY:'999',cassetteRotation:'90',pf:'f'});
 applyReferenceArtwork(project,params,640,640,'label');
 for(const surface of ['labelA','labelB']){const art=project.surfaces[surface].find(l=>l.category==='albumCover');assert.equal(art.cropZoom,1.25*1.06);assert.equal(art.cropRotation,-45);assert.ok(Math.abs(art.cropX+10*25.4/72)<1e-9);assert.ok(Math.abs(art.cropY-50*25.4/72)<1e-9)}
 params.set('mp','_');applyReferenceArtwork(project,params,640,640,'label');assert.equal(project.surfaces.labelA.find(l=>l.category==='albumCover').visible,false);assert.equal(project.surfaces.labelB.find(l=>l.category==='albumCover').visible,false);
});

test('partial legacy image parameters restore valid fields and ignore malformed transforms',()=>{
 const project=createProject();applyAlbumArt(project,'data:image/png;base64,AA==');
 applyReferenceArtwork(project,new URLSearchParams({cassetteOffsetX:'12',cassetteOffsetY:'-24',pf:'f'}),640,640,'label');
 const art=project.surfaces.labelA.find(l=>l.category==='albumCover');assert.equal(art.cropZoom,2*1.06);assert.ok(Math.abs(art.cropX-12*25.4/72)<1e-9);assert.ok(Math.abs(art.cropY+24*25.4/72)<1e-9);
 for(const invalid of ['','NaN','Infinity','1.5garbage','999999']){
  applyReferenceArtwork(project,new URLSearchParams({cassetteScale:invalid,cassetteOffsetX:invalid,cassetteRotation:invalid,pf:'f'}),640,640,'label');
  assert.equal(art.cropZoom,2*1.06);assert.equal(art.cropX,0);assert.equal(art.cropRotation,0);assert.ok(Number.isFinite(art.cropY));
 }
});
