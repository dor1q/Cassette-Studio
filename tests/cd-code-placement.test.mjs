import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,dimensions,migrate,clone} from '../src/model.js';
import {referenceCodeUnit} from '../src/reference-format.js';
import {renderSvg} from '../src/render.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const cases=[['cd','cd-label','cdLabel',76.73,41.24,124,90],['cd-insert','cd-insert','cdFront',28.8,92.03,173,0],['cd-tray','cd-tray','cdTray',76.23,91.76,148,0]];
for(const [route,mode,surface,x,y,scale,rotation] of cases)test(`${route} links without bp use the format's own barcode position`,()=>{
 const p=importReference(createProject(),`https://vhs.texs.org/en/${route}?cid=541252545430&bv=1`),layer=p.surfaces[surface].find(layer=>layer.type==='barcode'),unit=referenceCodeUnit(p,mode),w=352*unit*scale/100,h=176*unit*scale/100;
 const a=rotation*Math.PI/180,centerX=layer.x+(w*Math.cos(a)-h*Math.sin(a))/2,centerY=layer.y+(w*Math.sin(a)+h*Math.cos(a))/2;
 near(layer.w,w);near(layer.h,h);near(centerX,(route==='cd-insert'?8476*25.4/600:dimensions(p,surface).w)*x/100);near(centerY,dimensions(p,surface).h*y/100);assert.equal(layer.rotation,rotation);assert.equal(layer.visible,true);
 assert.doesNotMatch(renderSvg(p,surface).warnings.join(' '),/Некорректный код/);
 const restored=migrate(clone(p)).surfaces[surface].find(layer=>layer.type==='barcode');for(const key of ['x','y','w','h','rotation','text','visible'])assert.equal(restored[key],layer[key]);
});
test('explicit CD barcode placement and reverse-side placement take precedence over defaults',()=>{
 for(const [route,mode,surface]of cases){const p=importReference(createProject(),`https://vhs.texs.org/en/${route}?ds=1&mode=d2&cid=541252545430&bv=1&bp=50_50_50_0`),layer=p.surfaces[surface].find(layer=>layer.type==='barcode');near(layer.w,352*referenceCodeUnit(p,mode)*.5);assert.equal(layer.rotation,0)}
 const p=importReference(createProject(),'https://vhs.texs.org/en/cd-tray?ds=1&cid=541252545430&bv=1&bp=b~50_50_60_0');assert.equal(p.surfaces.cdTray.filter(layer=>layer.type==='barcode').length,0);assert.equal(p.surfaces.cdTrayInside.filter(layer=>layer.type==='barcode').length,1);
});
test('cassette defaults and explicitly hidden CD barcodes remain unchanged',()=>{
 for(const [route,surface,scale,rotation]of [['jcard','outer',196,90],['cassette','labelA',89,0]]){const p=importReference(createProject(),`https://vhs.texs.org/en/${route}?cid=541252545430&bv=1`),layer=p.surfaces[surface].find(layer=>layer.type==='barcode');near(layer.w,352*referenceCodeUnit(p,p.editorMode)*scale/100);assert.equal(layer.rotation,rotation)}
 const p=importReference(createProject(),'https://vhs.texs.org/en/cd-tray?cid=541252545430&bv=0');assert.equal(p.surfaces.cdTray.find(layer=>layer.type==='barcode').visible,false);
});
