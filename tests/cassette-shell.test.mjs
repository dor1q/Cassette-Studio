import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,makeLayer,dimensions,migrate,resetSurfaces} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {CASSETTE_POINT,cassetteArtworkOffset,cassettePrintArea,setCassettePrintArea} from '../src/cassette-shell.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function picture(project,surface='labelA',options={}){
 const result=renderSvg(project,surface,{guides:false,...options}),image=new Resvg(result.svg,{fitTo:{mode:'width',value:1200}}).render();
 const bleed=options.bleed||0,scale=image.width/result.w;
 return {result,alpha(x,y){const px=Math.floor((x+bleed)*scale),py=Math.floor((y+bleed)*scale);return image.pixels[(py*image.width+px)*4+3]},point(x,y){return this.alpha(x*CASSETTE_POINT,y*CASSETTE_POINT)}};
}

test('shell print areas retain the original physical dimensions and label settings',()=>{
 const p=createProject();assert.equal(p.layout.printArea,'label');
 assert.deepEqual(dimensions(p,'labelA'),{w:88.6,h:41.8});
 const label=structuredClone(p.layout);
 for(const area of ['body','full']){
  setCassettePrintArea(p,area);const d=dimensions(p,'labelA');near(d.w,100.584);near(d.h,64.21966666666667);
  assert.deepEqual(dimensions(p,'labelA'),dimensions(p,'labelB'));
  assert.equal(p.layout.labelW,label.labelW);assert.equal(p.layout.labelH,label.labelH);
  near(d.w/CASSETTE_POINT,285.12);near(d.h/CASSETTE_POINT,182.04);
 }
 assert.equal(cassettePrintArea('unexpected'),'label');
});

test('changing print area shifts label text and expands full-frame art on both sides',()=>{
 const p=createProject(),offset=cassetteArtworkOffset('full');
 for(const surface of ['labelA','labelB'])p.surfaces[surface].unshift(makeLayer('image',{category:'albumCover',x:0,y:0,w:88.6,h:41.8,cropZoom:2,cropX:3}));
 const before=structuredClone(p.surfaces),outer=structuredClone(p.surfaces.outer);
 setCassettePrintArea(p,'body');
 for(const surface of ['labelA','labelB']){
  const [cover,text]=p.surfaces[surface];near(cover.w,100.584);near(cover.h,64.21966666666667);
  assert.equal(cover.x,0);assert.equal(cover.y,0);assert.equal(cover.cropZoom,2);assert.equal(cover.cropX,3);
  near(text.x,before[surface][1].x+offset.x);near(text.y,before[surface][1].y+offset.y);
 }
 const body=structuredClone(p.surfaces);setCassettePrintArea(p,'full');assert.deepEqual(p.surfaces,body);
 setCassettePrintArea(p,'label');
 for(const surface of ['labelA','labelB'])for(let i=0;i<p.surfaces[surface].length;i++)for(const key of ['x','y','w','h'])near(p.surfaces[surface][i][key],before[surface][i][key]);
 assert.deepEqual(p.surfaces.outer,outer);
});

test('On Body prints only the body rectangle and leaves mechanisms transparent',()=>{
 const p=createProject();setCassettePrintArea(p,'body');p.surfaces.labelA=[];const img=picture(p);
 for(const [x,y]of [[20,20],[142,30],[10,120],[275,120]])assert.equal(img.point(x,y),255,`body ink ${x},${y}`);
 for(const [x,y]of [[2,50],[142,140],[142,180],[82.86,83.7],[202.62,83.7],[142,83.7]])assert.equal(img.point(x,y),0,`empty ${x},${y}`);
 p.layout.hole=false;assert.equal(picture(p).point(82.86,83.7),0,'physical holes cannot be disabled');
});

test('Full Body preserves all seven physical openings through foreground layers',()=>{
 const p=createProject();setCassettePrintArea(p,'full');
 const d=dimensions(p,'labelA');
 for(const surface of ['labelA','labelB']){
  p.surfaces[surface]=[makeLayer('shape',{x:0,y:0,w:d.w,h:d.h,color:'#ff0000'}),makeLayer('qr',{x:22,y:10,w:65,h:45,text:'cassette-body'})];
  const img=picture(p,surface);
  for(const [x,y]of [[82.86,83.7],[202.62,83.7],[142.5,83.46],[101.28,167.88],[181.8,167.88],[73.74,171.54],[210.06,171.54]])assert.equal(img.point(x,y),0,`${surface} hole ${x},${y}`);
  for(const [x,y]of [[20,10],[142,140],[142,175],[82.86,61],[202.62,106],[67,171.54]])assert.equal(img.point(x,y),255,`${surface} ink ${x},${y}`);
  assert.equal(img.point(.5,.5),0);assert.equal(img.point(284.62,181.54),0);
 }
});

test('On Body unused area is visible only while editing and retains empty lower holes',()=>{
 const p=createProject();setCassettePrintArea(p,'body');p.surfaces.labelA=[];
 const editing=picture(p,'labelA',{editing:true}),exported=picture(p);
 assert.equal(exported.point(142,160),0);assert.ok(editing.point(142,160)>25&&editing.point(142,160)<45);
 for(const [x,y]of [[101.28,167.88],[181.8,167.88],[73.74,171.54],[210.06,171.54],[82.86,83.7]])assert.equal(editing.point(x,y),0);
 assert.equal(picture(p,'labelA',{blank:true}).point(142,160),0);
 assert.doesNotMatch(exported.result.svg,/fill-opacity=".14"/);
});

test('saved body/full designs and reset templates keep the same print footprint',()=>{
 for(const area of ['body','full']){
  const p=createProject();setCassettePrintArea(p,area);
  const before=renderSvg(p,'labelA',{guides:false}),q=migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(q.layout.printArea,area);assert.deepEqual(dimensions(q,'labelA'),dimensions(p,'labelA'));
  assert.deepEqual(q.surfaces.labelA.map(l=>[l.x,l.y,l.w,l.h]),p.surfaces.labelA.map(l=>[l.x,l.y,l.w,l.h]));
  const after=renderSvg(q,'labelA',{guides:false});assert.equal(after.w,before.w);assert.equal(after.h,before.h);
  const textPosition={x:q.surfaces.labelA[0].x,y:q.surfaces.labelA[0].y};resetSurfaces(q);assert.equal(q.layout.printArea,area);
  near(q.surfaces.labelA[0].x,textPosition.x);near(q.surfaces.labelA[0].y,textPosition.y);
 }
 const invalid=createProject();invalid.layout.printArea='not-a-format';assert.equal(migrate(invalid).layout.printArea,'label');
});

test('shell guides include the trapezoid without adding its outline to normal artwork',()=>{
 const p=createProject();setCassettePrintArea(p,'full');
 assert.match(renderSvg(p,'labelA',{blank:true}).svg,/data-cassette-trapezoid="true"/);
 assert.doesNotMatch(renderSvg(p,'labelA',{guides:false}).svg,/data-cassette-trapezoid="true"/);
 p.settings.cutGuides=false;assert.doesNotMatch(renderSvg(p,'labelA',{guides:true}).svg,/data-cassette-trapezoid="true"/);
});

test('bleed extends the shell perimeter without filling mechanism centers',()=>{
 const p=createProject();setCassettePrintArea(p,'full');p.surfaces.labelA=[];
 const img=picture(p,'labelA',{bleed:1});near(img.result.w,102.584);
 assert.equal(img.alpha(-.5,30),255);
 for(const [x,y]of [[82.86,83.7],[202.62,83.7],[142.5,83.46]])assert.equal(img.point(x,y),0);
});
