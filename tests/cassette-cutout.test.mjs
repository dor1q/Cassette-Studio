import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,makeLayer,migrate} from '../src/model.js';
import {renderSvg} from '../src/render.js';

function image(p,surface='labelA',options={}){
 const svg=renderSvg(p,surface,{guides:false,...options});
 const rendered=new Resvg(svg.svg,{fitTo:{mode:'width',value:Math.round(svg.w*10)}}).render();
 const scale=rendered.width/svg.w,bleed=options.bleed||0;
 return {alpha(x,y){const px=Math.floor((x+bleed)*scale),py=Math.floor((y+bleed)*scale);return rendered.pixels[(py*rendered.width+px)*4+3]}};
}
function windowCenter(p){const l=p.layout;return {x:l.labelW/2+(l.holeOffsetX||0),y:l.holeY+l.holeH/2}}

test('cassette A and B have transparent central windows through every artwork layer',()=>{
 const p=createProject();
 for(const surface of ['labelA','labelB']){
  p.surfaces[surface]=[
   makeLayer('shape',{x:0,y:0,w:88.6,h:41.8,color:'#ff0000'}),
   makeLayer('image',{x:0,y:0,w:88.6,h:41.8,fit:'stretch',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1UAAAAASUVORK5CYII='}),
   makeLayer('qr',{x:25,y:12,w:35,h:25,text:'cassette-cutout'}),
  ];
  const img=image(p,surface),c=windowCenter(p);
  for(const [dx,dy] of [[0,0],[12,0],[-12,0],[0,-4],[0,4]])assert.equal(img.alpha(c.x+dx,c.y+dy),0,surface+' window');
  assert.equal(img.alpha(10,10),255,surface+' printed area');
 }
});

test('cassette outline has two diagonal upper corners and square lower corners',()=>{
 const p=createProject();p.surfaces.labelA=[];const img=image(p),w=p.layout.labelW,h=p.layout.labelH;
 for(const x of [.3,w-.3]){assert.equal(img.alpha(x,.3),0);assert.equal(img.alpha(x,h-.3),255)}
 assert.equal(img.alpha(1,1),0);assert.equal(img.alpha(2,2),255);
 assert.equal(img.alpha(w-1,1),0);assert.equal(img.alpha(w-2,2),255);
 assert.equal(img.alpha(w/2,.3),255);
});

test('raster silhouette agrees with the public cassette template contour',()=>{
 const p=createProject();p.surfaces.labelA=[];
 const reference='<svg xmlns="http://www.w3.org/2000/svg" width="88.6mm" height="41.8mm" viewBox="0 0 251.16 118.43"><path fill-rule="evenodd" d="M0,118.43V9.2L9.2,0h232.76l9.2,9.2v109.23H0ZM61.50,45.40c-11.82,0-21.42,9.61-21.42,21.42s9.61,21.42,21.42,21.42h127.69c11.82,0,21.42-9.61,21.42-21.42s-9.61-21.42-21.42-21.42h-127.69Z"/></svg>';
 const render=svg=>new Resvg(svg,{fitTo:{mode:'width',value:886}}).render().pixels;
 const actual=render(renderSvg(p,'labelA',{guides:false}).svg),expected=render(reference);
 let differing=0;for(let i=3;i<actual.length;i+=4)if((actual[i]>127)!==(expected[i]>127))differing++;
 assert.ok(differing<32,`Silhouette differs at ${differing} pixels`);
});

test('capsule boundary preserves the public template position and round ends',()=>{
 const p=createProject();p.surfaces.labelA=[];const img=image(p),l=p.layout,c=windowCenter(p),left=c.x-l.holeW/2;
 assert.equal(img.alpha(c.x,l.holeY-.5),255);assert.equal(img.alpha(c.x,l.holeY+.5),0);
 assert.equal(img.alpha(c.x,l.holeY+l.holeH-.5),0);assert.equal(img.alpha(c.x,l.holeY+l.holeH+.5),255);
 assert.equal(img.alpha(left-.5,c.y),255);assert.equal(img.alpha(left+.5,c.y),0);
 assert.equal(img.alpha(left+1,l.holeY+1),255);
});

test('saved custom window geometry and disabled cutout survive reopening',()=>{
 const p=createProject();p.surfaces.labelA=[];
 Object.assign(p.layout,{holeW:40,holeH:10,holeY:3,holeOffsetX:12});
 const q=migrate(JSON.parse(JSON.stringify(p))),c=windowCenter(q),img=image(q);
 assert.equal(img.alpha(c.x,c.y),0);assert.equal(img.alpha(44,25),255);
 q.layout.hole=false;const filled=image(q);assert.equal(filled.alpha(c.x,c.y),255);
});

test('print bleed extends the perimeter and inner ink without filling the window',()=>{
 const p=createProject();p.surfaces.labelA=[];const img=image(p,'labelA',{bleed:2}),l=p.layout,c=windowCenter(p);
 assert.equal(img.alpha(c.x,c.y),0);
 assert.equal(img.alpha(c.x,l.holeY+1),255);assert.equal(img.alpha(c.x,l.holeY+3),0);
 assert.equal(img.alpha(-1,l.labelH/2),255);
 assert.equal(img.alpha(-1.8,-1.8),0);assert.equal(img.alpha(-1,l.labelH+1),255);
});

test('guides, editing, and layer-only exports keep the center empty',()=>{
 const p=createProject();p.surfaces.labelA=[makeLayer('shape',{x:0,y:0,w:88.6,h:41.8,color:'#ff0000'})];
 const c=windowCenter(p);
 for(const options of [{guides:true},{editing:true},{onlyLayers:true},{blank:true}])assert.equal(image(p,'labelA',options).alpha(c.x,c.y),0);
});

test('zero-sized windows do not erase the label',()=>{
 for(const key of ['holeW','holeH']){const p=createProject();p.surfaces.labelA=[];p.layout[key]=0;const c=windowCenter(p);assert.equal(image(p).alpha(c.x,c.y),255)}
});

test('an oversized or moved window cannot paint outside the cassette outline',()=>{
 const p=createProject();p.surfaces.labelA=[];
 Object.assign(p.layout,{holeW:95,holeH:35,holeY:0,holeOffsetX:-40});
 const img=image(p);
 assert.equal(img.alpha(.3,.3),0);assert.equal(img.alpha(p.layout.labelW-.3,.3),0);
 assert.equal(img.alpha(70,35),255);
});
