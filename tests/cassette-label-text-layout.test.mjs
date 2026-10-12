import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutStyledText} from '../src/text-layout.js';
import {Resvg} from '@resvg/resvg-js';
import {createProject,importReference,makeLayer,migrate,boundText} from '../src/model.js';
import {renderSvg,textLayout} from '../src/render.js';
import {prepareExport} from '../src/export.js';

const face={size:5.2,w:22,h:20,lineHeight:1.3,fontStretch:100,literalText:true,autoFit:false};
const visibleLines=layout=>layout.lineRuns.map(runs=>runs.map(run=>run.text).join(''));

test('a reference label single-line face keeps its written size and punctuation',()=>{
 const text='# A **very long** album title';
 const layout=layoutStyledText(text,{...face,nowrap:true});
 assert.deepEqual(visibleLines(layout),[text]);
 assert.equal(layout.size,5.2);
 assert.equal(layout.overflow,true);
 assert.ok(layout.widths[0]>face.w);
});

test('a reference label clipped track frame wraps at its fixed font size',()=>{
 const text='1. A long first song (3:07) · 2. Another long song (4:31) · 3. Final song (2:42)';
 const layout=layoutStyledText(text,{...face,clipText:true});
 assert.equal(layout.size,5.2);
 assert.ok(layout.height>face.h);
 assert.equal(layout.overflow,false);
 assert.deepEqual(layout.lineHeights,layout.lineHeights.map(()=>5.2*1.3));
 const ordinary=layoutStyledText(text,face);
 assert.equal(ordinary.overflow,true);
 assert.equal(ordinary.size,5.2);
});

test('manual automatic fitting still works for a clipped or single-line label face',()=>{
 const text='An album title that is longer than this frame';
 const layout=layoutStyledText(text,{...face,nowrap:true,clipText:true,autoFit:true});
 assert.equal(visibleLines(layout).length,1);
 assert.ok(layout.size<face.size);
 assert.ok(layout.widths[0]<=face.w+1e-9);
 assert.equal(layout.overflow,false);
});

test('ordinary editable text keeps wrapping and explicit lines remain in nowrap mode',()=>{
 const text='Two words\nAnother line';
 assert.ok(visibleLines(layoutStyledText(text,face)).length>2);
 assert.deepEqual(visibleLines(layoutStyledText(text,{...face,nowrap:true})),['Two words','Another line']);
 assert.deepEqual(visibleLines(layoutStyledText(text,{...face,nowrap:true,singleLine:true})),['Two words Another line']);
 assert.deepEqual(visibleLines(layoutStyledText(' \tTwo  words\r\n   Another line\t ',{...face,nowrap:true,singleLine:true})),['Two words Another line']);
 assert.ok(visibleLines(layoutStyledText(text,{...face,nowrap:false,singleLine:true})).length>2);
});

test('explicit permitted width overflow leaves generic height diagnostics and automatic fitting intact',()=>{
 const text='A title far wider than its frame';
 const allowed=layoutStyledText(text,{...face,nowrap:true,singleLine:true,allowTextOverflow:true});
 assert.equal(allowed.overflow,false);assert.equal(allowed.size,face.size);
 assert.equal(layoutStyledText(text,{...face,nowrap:true,allowTextOverflow:true,h:1}).overflow,true);
 const fitted=layoutStyledText(text,{...face,nowrap:true,allowTextOverflow:true,autoFit:true});
 assert.ok(fitted.size<face.size);assert.ok(fitted.widths[0]<=face.w+1e-9);
});

const referenceLabel=()=>{
 const project=createProject();
 const query=new URLSearchParams({musicArtist:'A long artist name '.repeat(12),musicAlbum:'A long album title '.repeat(12),musicA:Array.from({length:30},(_,index)=>`Song ${index+1} with an unusually long title (3:07)`).join('|'),musicB:'Other side (1:20)',musicPL:'Written production line',sla:'First side',slb:'Second side',sll:'The long side prefix'});
 importReference(project,'https://vhs.texs.org/en/cassette?'+query);
 return project;
};

test('imported label metadata stays on one line at the original size and baseline',()=>{
 const project=referenceLabel(),sx=project.layout.labelW/251.16,sy=project.layout.labelH/118.43;
 const targets={artist:{size:10,baseline:19},album:{size:7,baseline:102.43},sideText:{size:5,baseline:60},side:{size:13,baseline:72},production:{size:3.7,baseline:108.43}};
 for(const surface of ['labelA','labelB']){
  for(const [source,expected] of Object.entries(targets)){
   const layer=project.surfaces[surface].find(layer=>layer.source===source),layout=textLayout(boundText(project,layer,surface),layer);
   assert.equal(layer.autoFit,false,source+' default automatic fitting');
   assert.equal(layer.nowrap,true,source+' single-line face');
   assert.equal(layer.singleLine,true);assert.equal(layer.allowTextOverflow,true);
   assert.equal(layout.lineRuns.length,1,source+' line count');
   assert.equal(layout.overflow,false,source+' whole-label overflow is intentional');
   assert.ok(Math.abs(layout.size-expected.size*sy)<1e-10,source+' written size');
   assert.ok(Math.abs(layer.y+layout.baselines[0]-expected.baseline*sy)<1e-10,source+' baseline');
   assert.ok(Math.abs(layer.x+layer.w/2-(source==='side'||source==='sideText'?229.16:125.58)*sx)<1e-10,source+' center');
  }
 }
 const tracks=project.surfaces.labelA.find(layer=>layer.source==='tracks'),layout=textLayout(boundText(project,tracks,'labelA'),tracks);
 assert.equal(tracks.autoFit,false);assert.equal(tracks.nowrap,false);assert.equal(tracks.clipText,true);
 assert.ok(Math.abs(tracks.size-5.2*sy)<1e-10);assert.ok(Math.abs(tracks.h-20*sy)<1e-10);
 assert.ok(layout.height>tracks.h);assert.equal(layout.size,tracks.size);assert.equal(layout.overflow,false);
 const ordinary=createProject().surfaces.labelA.find(layer=>layer.source==='tracks');
 assert.equal(ordinary.autoFit,true);assert.equal(ordinary.nowrap,undefined);assert.equal(ordinary.clipText,undefined);
 assert.doesNotThrow(()=>prepareExport(project,{mode:'label',selection:'current',surface:'labelA'}));
});

function raster(project,options={}){
 const result=renderSvg(project,'labelA',{guides:false,onlyLayers:true,...options});
 const render=new Resvg(result.svg,{fitTo:{mode:'width',value:886},font:{loadSystemFonts:false,fontFiles:['C:/Windows/Fonts/arial.ttf'],defaultFontFamily:'Arial'}}).render();
 return {...result,width:render.width,height:render.height,pixels:render.pixels,scale:render.width/result.w};
}

function inkOutsideFrame(image,layer){
 let inside=0,outside=0;
 const angle=layer.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  if(image.pixels[(y*image.width+x)*4+3]<128)continue;
  const dx=(x+.5)/image.scale-layer.x,dy=(y+.5)/image.scale-layer.y;
  const localX=dx*cos+dy*sin,localY=-dx*sin+dy*cos;
  if(localX>=-.1&&localX<=layer.w+.1&&localY>=-.1&&localY<=layer.h+.1)inside++;else outside++;
 }
 return {inside,outside};
}

test('SVG and raster export clip long imported tracks without painting beyond their frame',()=>{
 const project=referenceLabel(),layer=project.surfaces.labelA.find(layer=>layer.source==='tracks');
 project.surfaces.labelA=[layer];
 const clipped=raster(project),clippedInk=inkOutsideFrame(clipped,layer);
 assert.deepEqual(clipped.warnings,[]);assert.ok(clippedInk.inside>100);assert.equal(clippedInk.outside,0);
 assert.match(clipped.svg,/-textclip" clipPathUnits="userSpaceOnUse"><rect width=/);
 const unclipped=raster({...project,surfaces:{...project.surfaces,labelA:[{...layer,clipText:false}]}});
 assert.ok(inkOutsideFrame(unclipped,layer).outside>100);
 assert.ok(unclipped.warnings.some(warning=>warning.includes(layer.name)));
 for(const rotation of [15,-15]){
  const moved={...layer,x:20,y:5,w:30,h:4,rotation,flipX:true,flipY:true};
  const image=raster({...project,surfaces:{...project.surfaces,labelA:[moved]}}),ink=inkOutsideFrame(image,moved);
  assert.ok(ink.inside>20,JSON.stringify({rotation,...ink}));assert.equal(ink.outside,0,'rotation '+rotation);
 }
 const centerX=project.layout.labelW/2+(project.layout.holeOffsetX||0),centerY=project.layout.holeY+project.layout.holeH/2;
 const holeLayer={...layer,x:0,y:0,w:project.layout.labelW,h:project.layout.labelH,clipText:false};
 const holeImage=raster({...project,surfaces:{...project.surfaces,labelA:[holeLayer]}});
 const pixel=(Math.floor(centerY*holeImage.scale)*holeImage.width+Math.floor(centerX*holeImage.scale))*4;
 assert.equal(holeImage.pixels[pixel+3],0,'central window stays transparent');
});

test('saved fixed-size label faces and their locked copies preserve clipping when reopened',()=>{
 const project=referenceLabel(),tracks=project.surfaces.labelA.find(layer=>layer.source==='tracks');
 tracks.locked=true;
 const copy=makeLayer('text',{...tracks,id:'label-tracks-copy',name:'Copy',referenceBlockCopy:true,y:tracks.y+1,locked:true});
 project.surfaces.labelA=[tracks,copy];
 const before=JSON.stringify(project),reopened=migrate(JSON.parse(before));
 assert.equal(JSON.stringify(project),before,'reopening leaves source and locked geometry untouched');
 for(let index=0;index<2;index++){
  const original=project.surfaces.labelA[index],actual=reopened.surfaces.labelA[index];
  for(const key of ['size','w','h','x','y','rotation','autoFit','nowrap','singleLine','allowTextOverflow','clipText','locked'])assert.equal(actual[key],original[key],key);
 }
 assert.deepEqual(raster(reopened).pixels,raster(project).pixels);
});
