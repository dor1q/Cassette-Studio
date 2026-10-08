import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,clone,makeLayer,dimensions} from '../src/model.js';
import {applyAlbumArt,applyReferenceArtwork,albumArtLayer,albumCoverFrame,albumCoverAppearance,fitCoverImage} from '../src/album-art.js';
import {cdTrayPosterState,setCDTrayPoster,applyOriginalCDTrayPoster} from '../src/cd-tray-poster.js';
import {applyGalleryCover} from '../src/cover-gallery.js';
import {exportImagePages} from '../src/export.js';

const unit=25.4/600,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const fixture=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="200" height="400" fill="red"/><rect x="200" width="200" height="400" fill="blue"/></svg>').render().asPng();
const image='data:image/png;base64,'+fixture.toString('base64');
function project(){const p=createProject();p.editorMode='cd-tray';applyAlbumArt(p,image);return p}
function withoutAppearance(layer){const copy=clone(layer);for(const key of ['opacity','blur','cropZoom'])delete copy[key];return copy}

test('new CD Tray covers use a soft uncut image while other album-art formats retain their defaults',()=>{
 const p=project(),layer=albumArtLayer(p,'cdTray');
 assert.deepEqual(albumCoverAppearance('cdTray'),{opacity:.2,blur:2.54});assert.deepEqual(albumCoverAppearance('cdTrayInside'),{opacity:.2,blur:2.54});
 near(layer.opacity,.2);near(layer.blur,2.54);assert.equal(layer.cropZoom,1);assert.equal(layer.fit,'meet');assert.equal(layer.cropX,0);assert.equal(layer.cropY,0);
 assert.deepEqual(cdTrayPosterState(p,'cdTray'),{layerId:layer.id,locked:false,opacity:20,blur:60,scale:1});
 assert.equal(albumArtLayer(p,'cdTrayInside'),undefined);
 for(const [mode,surface,opacity]of [['jcard','outer',1],['label','labelA',.5],['cd-label','cdLabel',1],['cd-insert','cdFront',1]]){
  const q=createProject();q.editorMode=mode;applyAlbumArt(q,image);const art=albumArtLayer(q,surface);
  assert.equal(art.opacity,opacity);assert.equal(art.blur,0);assert.equal(art.cropZoom,1);assert.equal(art.fit,'meet');assert.equal(art.cdTrayPosterZoomBase,undefined);
 }
});

test('poster controls read the selected actual cover rather than stale global reference values',()=>{
 const p=project();Object.assign(p.layout,{cdTrayPosterOpacity:90,cdTrayPosterBlur:190,cdTrayPosterScale:3});
 const layer=albumArtLayer(p,'cdTray');Object.assign(layer,{opacity:.35,blur:80*unit,cropZoom:1.4});
 const other=makeLayer('image',{category:'albumCover',src:image,...albumCoverFrame(p,'cdTray'),opacity:.65,blur:25*unit,cropZoom:.8});p.surfaces.cdTray.push(other);
 assert.deepEqual(cdTrayPosterState(p,'cdTray',{layer:other}),{layerId:other.id,locked:false,opacity:65,blur:25,scale:.8});
 assert.equal(setCDTrayPoster(p,'cdTray','opacity',45,{layer:other}),true);assert.equal(layer.opacity,.35);assert.equal(other.opacity,.45);
 assert.equal(cdTrayPosterState(p,'cdTrayInside',{layer:other}),null);
 p.editorMode='cd-insert';assert.equal(cdTrayPosterState(p,'cdTray'),null);assert.equal(setCDTrayPoster(p,'cdTray','opacity',20),false);
});

test('each appearance control changes only its own field on the current CD Tray face',()=>{
 const p=project();applyAlbumArt(p,image,{surfaces:['cdTrayInside']});
 const layer=albumArtLayer(p,'cdTray');Object.assign(layer,{x:8,y:3,w:121,h:113,fit:'slice',cropX:12,cropY:-9,cropRotation:30,rotation:15,cropZoom:1.6,blendMode:'multiply'});
 const before=clone(p),frame=withoutAppearance(layer);
 assert.equal(setCDTrayPoster(p,'cdTray','opacity',40),true);assert.equal(layer.opacity,.4);assert.equal(layer.blur,before.surfaces.cdTray.find(item=>item.id===layer.id).blur);assert.equal(layer.cropZoom,1.6);
 assert.equal(setCDTrayPoster(p,'cdTray','blur',125),true);near(layer.blur,125*unit);assert.equal(layer.opacity,.4);assert.equal(layer.cropZoom,1.6);
 assert.equal(setCDTrayPoster(p,'cdTray','scale',2.1),true);near(layer.cropZoom,2.1);assert.deepEqual(withoutAppearance(layer),frame);
 assert.deepEqual(p.layout,before.layout);assert.deepEqual(p.data,before.data);assert.deepEqual(p.surfaces.cdTrayInside,before.surfaces.cdTrayInside);assert.deepEqual(p.surfaces.cdFront,before.surfaces.cdFront);
});

test('poster setters clamp slider limits, reject invalid keys or numbers and report unchanged values',()=>{
 const p=project();for(const [key,value,expected]of [['opacity',-10,0],['opacity',110,100],['blur',-3,0],['blur',220,200],['scale',.1,.5],['scale',4,3]]){
  setCDTrayPoster(p,'cdTray',key,value);near(cdTrayPosterState(p,'cdTray')[key],expected);
 }
 const before=clone(p);for(const [key,value]of [['constructor',1],['__proto__',1],['other',1],['opacity',''],['blur',null],['scale',NaN],['scale',Infinity],['blur','invalid']])assert.equal(setCDTrayPoster(p,'cdTray',key,value),false);
 assert.equal(setCDTrayPoster(p,'cdTray','scale',3),false);assert.deepEqual(p,before);
});

test('locked covers reject individual controls and the original appearance preset without any mutation',()=>{
 const p=project(),layer=albumArtLayer(p,'cdTray');layer.locked=true;const before=clone(p);
 assert.equal(cdTrayPosterState(p,'cdTray').locked,true);
 for(const key of ['opacity','blur','scale'])assert.equal(setCDTrayPoster(p,'cdTray',key,1),false);
 assert.equal(applyOriginalCDTrayPoster(p,'cdTray'),false);assert.deepEqual(p,before);
});

test('an explicit original-style preset applies 20/60/1.1 while keeping frame, position, fit and rotation',()=>{
 const p=project(),layer=albumArtLayer(p,'cdTray');Object.assign(layer,{fit:'stretch',x:9,y:4,w:131,h:99,cropX:-8,cropY:11,cropRotation:80,rotation:-20,opacity:.75,blur:0,cropZoom:1.5});
 const frame=withoutAppearance(layer);assert.equal(applyOriginalCDTrayPoster(p,'cdTray'),true);
 assert.deepEqual(cdTrayPosterState(p,'cdTray'),{layerId:layer.id,locked:false,opacity:20,blur:60,scale:1.1});assert.deepEqual(withoutAppearance(layer),frame);assert.equal(applyOriginalCDTrayPoster(p,'cdTray'),false);
});

test('reference tray zoom keeps its fit correction when controls read or change the original tp scale',()=>{
 const p=project();Object.assign(p.layout,{cdTrayPosterOpacity:37,cdTrayPosterBlur:85,cdTrayPosterScale:1.25});
 applyReferenceArtwork(p,new URLSearchParams('mp=0.1.00.50.-25.30'),400,600,'cd-tray');
 const layer=albumArtLayer(p,'cdTray'),base=layer.cdTrayPosterZoomBase;assert.ok(base>0&&base<1);near(layer.cropZoom,base*1.25);
 assert.deepEqual(cdTrayPosterState(p,'cdTray'),{layerId:layer.id,locked:false,opacity:37,blur:85,scale:1.25});
 const frame=withoutAppearance(layer);setCDTrayPoster(p,'cdTray','scale',1.7);near(layer.cropZoom,base*1.7);assert.deepEqual(withoutAppearance(layer),frame);
 applyOriginalCDTrayPoster(p,'cdTray');near(layer.cropZoom,base*1.1);near(layer.opacity,.2);near(layer.blur,60*unit);
 fitCoverImage(layer);assert.equal(layer.cdTrayPosterZoomBase,undefined);assert.equal(cdTrayPosterState(p,'cdTray').scale,1);assert.equal(layer.fit,'meet');
});

test('replacing ordinary tray artwork preserves custom opacity, blur, geometry and the other face',()=>{
 const p=project();applyAlbumArt(p,image,{surfaces:['cdTrayInside']});const layer=albumArtLayer(p,'cdTray');
 Object.assign(layer,{opacity:.67,blur:1.8,x:9,y:4,w:123,h:110,fit:'slice',cropX:6,cropY:8,cropRotation:15,cropZoom:1.8,cdTrayPosterZoomBase:.75});
 const inside=clone(p.surfaces.cdTrayInside);applyAlbumArt(p,'data:image/png;base64,AQ==');
 near(layer.opacity,.67);near(layer.blur,1.8);assert.equal(layer.x,9);assert.equal(layer.y,4);assert.equal(layer.w,123);assert.equal(layer.h,110);assert.equal(layer.fit,'meet');assert.equal(layer.cropZoom,1);assert.equal(layer.cropX,0);assert.equal(layer.cropY,0);assert.equal(layer.cropRotation,0);assert.equal(layer.cdTrayPosterZoomBase,undefined);assert.deepEqual(p.surfaces.cdTrayInside,inside);
 layer.locked=true;const before=clone(layer),result=applyAlbumArt(p,image);assert.deepEqual(layer,before);assert.deepEqual(result,{applied:[],locked:['cdTray']});
});

test('explicit gallery choices reveal a hidden unlocked cover and preserve its custom appearance',()=>{
 const p=project();applyAlbumArt(p,image,{surfaces:['cdTrayInside']});const layer=albumArtLayer(p,'cdTray');Object.assign(layer,{visible:false,opacity:.7,blur:1.4,x:9,y:5,cropZoom:1.8,cdTrayPosterZoomBase:.6});
 const inside=clone(p.surfaces.cdTrayInside),chosen=applyGalleryCover(p,'cdTray',{index:2,label:'New cover'},{src:image,key:'new-cover'});
 assert.equal(chosen,layer);assert.equal(layer.visible,true);assert.equal(layer.opacity,.7);assert.equal(layer.blur,1.4);assert.equal(layer.x,9);assert.equal(layer.y,5);assert.equal(layer.fit,'meet');assert.equal(layer.cropZoom,1);assert.equal(layer.cdTrayPosterZoomBase,undefined);assert.deepEqual(p.surfaces.cdTrayInside,inside);
 layer.locked=true;const before=clone(p);assert.throws(()=>applyGalleryCover(p,'cdTray',{index:3},{src:image,key:'locked-replacement'}),/закреплена/);assert.deepEqual(p,before);
});

test('a new gallery cover on the inside uses soft full-image defaults independently of the outside',()=>{
 const p=project(),outside=clone(p.surfaces.cdTray),layer=applyGalleryCover(p,'cdTrayInside',{index:1,label:'Inside'},{src:image,key:'inside-cover'});
 assert.equal(layer.visible,true);near(layer.opacity,.2);near(layer.blur,2.54);assert.equal(layer.fit,'meet');assert.equal(layer.cropZoom,1);assert.deepEqual(p.surfaces.cdTray,outside);
 assert.equal(cdTrayPosterState(p,'cdTrayInside').scale,1);
});

test('native exported artwork responds to actual tray opacity and blur changes at the same physical size',()=>{
 const p=project(),layer=albumArtLayer(p,'cdTray');p.surfaces.cdTray=[layer];p.settings.bg='#ffffff';
 const render=()=>{const page=exportImagePages(p,{guides:false,bleed:0})[0],png=new Resvg(page.svg,{fitTo:{mode:'width',value:900},font:{loadSystemFonts:false}}).render();return {page,png}};
 const color=(frame,x,y)=>{const px=Math.floor(x/frame.page.w*frame.png.width),py=Math.floor(y/frame.page.h*frame.png.height),offset=(py*frame.png.width+px)*4;return Array.from(frame.png.pixels.subarray(offset,offset+4))};
 setCDTrayPoster(p,'cdTray','blur',0);const a=render(),size=dimensions(p,'cdTray'),x=layer.x+layer.w/2-4,y=size.h/2,soft=color(a,x,y);
 setCDTrayPoster(p,'cdTray','opacity',80);const b=render(),strong=color(b,x,y);assert.ok(strong[1]<soft[1]-100);assert.ok(strong[2]<soft[2]-100);
 setCDTrayPoster(p,'cdTray','blur',200);const c=render(),blurred=color(c,x,y);assert.ok(blurred[2]>strong[2]+20);assert.ok(blurred[0]<strong[0]-20);
 for(const frame of [a,b,c]){near(frame.page.w,size.w);near(frame.page.h,size.h);assert.equal(frame.page.dpi,600);assert.deepEqual(frame.page.warnings,[])}
});
