import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {existsSync} from 'node:fs';
import {createProject,dimensions} from '../src/model.js';
import {setCassettePrintArea} from '../src/cassette-shell.js';
import {printShopLetter,printShopSpecs} from '../src/print-shop-letter.js';
import {prepareExport} from '../src/export.js';
import {printLayout} from '../src/print-layout.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const fontFile=['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(path=>existsSync(path));
function plain(){const p=createProject();for(const s of Object.keys(p.surfaces))p.surfaces[s]=[];return p}

test('print specifications report the actual regular PDF layout and duplex sides',()=>{
 const p=plain();p.layout.double=true;
 for(const opts of [{sheet:'auto',paper:'a4',copies:2,bleed:2},{sheet:'2up',paper:'letter',copies:3,bleed:1}]){
  const details=printShopSpecs(p,opts),prepared=prepareExport(p,opts),plan=printLayout(prepared.items,prepared.options);
  close(details.page.w,plan.w);close(details.page.h,plan.h);assert.equal(details.pageCount,plan.pages.length);assert.deepEqual(details.surfaces,['outer','inner']);assert.equal(details.duplex,true);
  assert.deepEqual(details.finished,dimensions(p,'outer'));assert.equal(details.bleed,opts.bleed);
 }
 const current=printShopSpecs(p,{selection:'current',surface:'inner'});assert.equal(current.duplex,false);assert.deepEqual(current.surfaces,['inner']);
});

test('12-up no-bleed job describes Letter dimensions and all emitted pages',()=>{
 const p=plain(),details=printShopSpecs(p,{mode:'label',sheet:'12up-trim',paper:'a4',bleed:3,copies:7});
 assert.equal(details.bleed,0);assert.equal(details.pageCount,2);assert.equal(details.copiesPerPage,12);assert.deepEqual(details.page,{w:215.9,h:279.4});assert.equal(details.duplex,false);
 const job=printShopLetter(p,{mode:'label',sheet:'12up-trim',copies:7,letterPaper:'letter'});assert.equal(job.w,215.9);assert.equal(job.h,279.4);assert.match(job.svg,/12 наклеек без вылетов/);assert.match(job.svg,/A и B/);
});

test('production job metadata matches finished trim, SRA3 seats and fixed PDF sizes',()=>{
 const p=plain();p.layout.panels=3;p.layout.double=true;
 const single=printShopSpecs(p,{sheet:'chalkpit-jcard',copies:2,dpi:150});assert.equal(single.dpi,600);assert.equal(single.pageCount,4);close(single.finished.w,104.648);close(single.finished.h,102.06566666666667);
 const eight=printShopSpecs(p,{sheet:'chalkpit-jcard-8up',copies:2,selection:'current',surface:'inner'});assert.deepEqual(eight.surfaces,['outer']);assert.equal(eight.duplex,false);assert.equal(eight.pageCount,2);assert.equal(eight.copiesPerPage,8);close(eight.finished.w,104.902);close(eight.finished.h,102.362);
 const job=printShopLetter(p,{sheet:'chalkpit-jcard-8up',copies:2});assert.match(job.svg,/Листов на сторону/);assert.match(job.svg,/Макетов на листе/);
 setCassettePrintArea(p,'full');const shell=printShopSpecs(p,{mode:'label',sheet:'chalkpit-cassette-4up',bleed:4,copies:2});assert.equal(shell.pageCount,4);assert.equal(shell.copiesPerPage,4);assert.equal(shell.bleed,0);assert.equal(shell.dpi,600);close(shell.page.w,592.982*25.4/72);close(shell.page.h,409.358*25.4/72);
 assert.throws(()=>printShopSpecs(p,{mode:'label',sheet:'chalkpit-cassette-4up',offsetX:1}),/позиции фиксированы/);
});

test('job QR links use album fallback, validated overrides and an explicit opt-out',()=>{
 const p=plain();p.data.url='https://example.com/album?x=1&y=2';
 const fallback=printShopLetter(p);assert.equal(fallback.details.url,p.data.url);assert.equal((fallback.svg.match(/<path d="M/g)||[]).length,1);assert.match(fallback.svg,/x=1&amp;y=2/);
 const override=printShopLetter(p,{shareUrl:'https://example.org/design'});assert.equal(override.details.url,'https://example.org/design');assert.match(override.svg,/Дизайн \/ ссылка/);
 const disabled=printShopLetter(p,{includeQr:false,shareUrl:'javascript:alert(1)'});assert.equal(disabled.details.url,'');assert.doesNotMatch(disabled.svg,/<path d="M/);
 for(const url of ['javascript:alert(1)','file:///C:/private','https://user:password@example.com/','https://example.com/'+ 'x'.repeat(2000)])assert.throws(()=>printShopLetter(p,{shareUrl:url}),/обычная ссылка/);
});

test('print job safely wraps hostile and maximum-length text inside A4 and Letter margins',()=>{
 const p=plain();p.title='W'.repeat(200);p.data.artist='Щ'.repeat(120);p.data.album='</text><script>bad()</script>'+'M'.repeat(120);p.data.url='https://example.com/'+ 'w'.repeat(1700);
 for(const letterPaper of ['a4','letter']){
  const job=printShopLetter(p,{letterPaper,sheet:'2up',copies:2});assert.doesNotMatch(job.svg,/<script>/);assert.match(job.svg,/&lt;script&gt;/);
  for(const match of job.svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>/g)){assert.ok(Number(match[1])>=18&&Number(match[1])<job.w-18);assert.ok(Number(match[2])>0&&Number(match[2])<=job.h-18,`y=${match[2]} on ${letterPaper}`)}
  const image=new Resvg(job.svg,{fitTo:{mode:'width',value:1000},font:fontFile?{loadSystemFonts:false,fontFiles:[fontFile],defaultFontFamily:'Arial'}:{loadSystemFonts:true}}).render(),margin=Math.floor(10*image.width/job.w),pixels=image.pixels;
  for(let y=0;y<image.height;y++)for(const x of [0,margin-1,image.width-margin,image.width-1]){const offset=(y*image.width+x)*4;assert.deepEqual(Array.from(pixels.subarray(offset,offset+4)),[255,255,255,255],`outside text margin x=${x}, y=${y}`)}
 }
});
