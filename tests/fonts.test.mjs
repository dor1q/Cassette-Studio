import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';
test('embedded font faces preserve weight and italic through import and SVG export',()=>{
 const p=createProject();p.fonts=[{name:'Example',weight:700,style:'italic',data:'data:font/ttf;base64,AAEAAA=='}];
 const loaded=migrate(p),svg=renderSvg(loaded,'outer').svg;
 assert.equal(loaded.fonts[0].weight,700);assert.equal(loaded.fonts[0].style,'italic');
 assert.match(svg,/font-weight:700;font-style:italic;src:url\('data:font\/ttf;base64,AAEAAA=='\)/);
});
test('font downloads validate the catalog variant and reject off-host resources',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('metadata/fonts')?new Response(JSON.stringify({familyMetadataList:[{family:'Test',category:'Serif',fonts:{400:{}},subsets:['cyrillic'],isOpenSource:true}]})):new Response('src: url(https://example.com/file.ttf)');
 try{const {fetchGoogleFont}=await import('../google-fonts.mjs?test');
 await assert.rejects(fetchGoogleFont('Test','999'),/каталога/);
 await assert.rejects(fetchGoogleFont('Test','400'),/источник/);
 }finally{globalThis.fetch=original}
});
