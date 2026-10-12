import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,boundText,clone,validateProject} from '../src/model.js';
import {textLayout,renderSvg} from '../src/render.js';

const value=(params={})=>importReference(createProject(),'https://vhs.texs.org/en/jcard?'+new URLSearchParams({
 musicArtist:'*Artist*',musicAlbum:'# **Album**',musicA:'# **First** - *Artist* (2:00)',musicB:'*Last* (1:00)',
 musicProd:'**Credits** & <label>',musicDS:'*STEREO*',musicLyrics:'**LYRICSTOKEN**',jh:'w',bg:'ffffff',color:'000000',...params
}));
const visibleText=layout=>layout.lineRuns.flat().map(run=>run.text).join('');

test('J-card spine joins raw artist and album independently of the inside separator',()=>{
 for(const sep of ['0','1','2','3','4']){
  const p=value({sep}),spine=p.surfaces.outer.find(layer=>layer.referenceSpine),heading=p.surfaces.outer.find(layer=>layer.referenceFlow);
  assert.equal(boundText(p,spine,'outer'),'*Artist* # **Album**');
  const layout=textLayout(boundText(p,spine,'outer'),{...spine,w:400,h:400},{project:p});
  assert.equal(visibleText(layout),'*Artist* # **Album**');assert.ok(layout.lineRuns.flat().every(run=>!run.bold&&!run.italic&&!run.heading));
  assert.notEqual(boundText(p,heading,'outer').split('\n')[0],boundText(p,spine,'outer'));
 }
 const p=value({s2l:'1'}),spine=p.surfaces.outer.find(layer=>layer.referenceSpine);
 assert.equal(boundText(p,spine,'outer'),'*Artist*\n# **Album**');
 spine.hideArtist=true;assert.equal(boundText(p,spine,'outer'),'# **Album**');
 spine.hideArtist=false;spine.hideAlbum=true;assert.equal(boundText(p,spine,'outer'),'*Artist*');
});

test('standard, tapered, extended and short J-card flaps preserve punctuation in tracks and credits',()=>{
 for(const params of [{},{tb:'1'},{eb:'1'},{sb:'1'}]){
  const p=value(params),flap=p.surfaces.outer.find(layer=>layer.source==='flapTracks'),before=clone(p),raw=boundText(p,flap,'outer');
  const layout=textLayout(raw,{...flap,w:1000,h:1000,flapTapered:false});
  assert.equal(flap.literalText,true);assert.ok(visibleText(layout).includes('# **First**'));assert.ok(visibleText(layout).includes('*Last*'));
  assert.ok(layout.lineRuns.flat().every(run=>!run.bold&&!run.italic&&!run.heading));
  if(params.sb){
   const credits=p.surfaces.outer.find(layer=>layer.source==='flapProduction');assert.equal(credits.literalText,true);
   assert.equal(visibleText(textLayout(boundText(p,credits,'outer'),{...credits,w:400,h:400})),'**Credits** & <label>');
  }else assert.ok(visibleText(layout).includes('**Credits** & <label>'));
  assert.deepEqual(p,before);
 }
});

test('literal imported spine retains independent album face while inside and custom text keep Markdown',()=>{
 const p=value({f2:'1.2s.4.2s.0',f3:'2.2s.6.2s.4',cxt:'**CUSTOMTOKEN**|30|30|0|60|1.2s.4.2s.0|140|||c'}),spine=p.surfaces.outer.find(layer=>layer.referenceSpine),before=clone(p);
 const layout=textLayout(boundText(p,spine,'outer'),{...spine,w:400,h:400},{project:p}),runs=layout.lineRuns.flat(),album=runs.find(run=>run.style);
 assert.equal(visibleText(layout),'*Artist* # **Album**');assert.equal(album.text,'# **Album**');assert.equal(album.style.font,'Times New Roman');assert.equal(album.style.italic,true);
 const saved=validateProject(p),reopened=saved.surfaces.outer.find(layer=>layer.referenceSpine);assert.equal(reopened.literalText,true);
 const contents=p.surfaces.outer.find(layer=>layer.referenceFlow);assert.equal(contents.literalText,undefined);
 const svg=renderSvg(p,'outer',{guides:false}).svg;assert.ok(svg.includes('LYRICSTOKEN'));assert.ok(svg.includes('CUSTOMTOKEN'));assert.ok(svg.includes('font-weight="bold"'));
 assert.deepEqual(p,before);
});
