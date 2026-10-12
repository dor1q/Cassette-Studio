import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,makeLayer,validateProject,boundText,clone} from '../src/model.js';
import {textLayout,renderSvg} from '../src/render.js';
import {duplicateSelection} from '../src/selection-edit.js';

const referenceURL='https://vhs.texs.org/en/cassette?'+new URLSearchParams({
 musicArtist:'*Artist*',musicAlbum:'# **Album**',musicA:'# **Track** - *Player* (3:07)',
 musicB:'*B Track* (1:26)',musicPL:'© **Label** & <company>',sll:'*Side*',sla:'# A',slb:'**B**',
 bg:'ffffff',color:'000000'
});
const visibleText=(project,layer,surface)=>textLayout(boundText(project,layer,surface),layer,{project}).lineRuns.flat().map(run=>run.text).join('');

test('imported label prints punctuation in all standard metadata without adding emphasis',()=>{
 const project=importReference(createProject(),referenceURL),before=clone(project);
 for(const surface of ['labelA','labelB']){
  for(const layer of project.surfaces[surface]){
   const expected=boundText(project,layer,surface),layout=textLayout(expected,layer,{project});
   assert.equal(layout.lineRuns.flat().map(run=>run.text).join(''),layer.uppercase?expected.toUpperCase():expected);
   assert.ok(layout.lineRuns.flat().every(run=>!run.bold&&!run.italic&&!run.heading),layer.source+' is metadata');
  }
  const svg=renderSvg(project,surface,{guides:false}).svg;
  assert.ok(svg.includes('*Artist*'));assert.ok(svg.includes('# **Album**'));assert.ok(svg.includes('*SIDE*'));
  assert.ok(svg.includes('© **Label** &amp; &lt;company&gt;'));assert.ok(!svg.includes('<company>'));
  assert.ok(svg.includes(surface==='labelA'?'# **Track**':'*B Track*'));
 }
 assert.deepEqual(project,before,'printing must not rewrite metadata or layer settings');
});

test('new label templates preserve raw titles and user-created captions still accept formatting',()=>{
 const project=createProject();project.data.artist='*New*';project.data.album='# **Album**';project.data.note='© **Note**';
 const caption=makeLayer('text',{text:'**Caption**',x:1,y:1,w:50,h:10,size:2});project.surfaces.labelA.push(caption);
 for(const surface of ['labelA','labelB']){
  const artist=project.surfaces[surface].find(layer=>layer.source==='artist');
  const album=project.surfaces[surface].find(layer=>layer.source==='album');
  const note=project.surfaces[surface].find(layer=>layer.source==='note');
  assert.equal(visibleText(project,artist,surface),'*New*');assert.equal(visibleText(project,album,surface),'# **Album**');
  assert.equal(visibleText(project,note,surface),'© **Note**');
 }
 const custom=textLayout(caption.text,caption,{project});assert.equal(custom.lineRuns.flat().map(run=>run.text).join(''),'Caption');
 assert.ok(custom.lineRuns.flat().some(run=>run.bold));
});

test('label raw text survives copies, save and reopen, edits, and a replacement reference import',()=>{
 const project=importReference(createProject(),referenceURL),tracks=project.surfaces.labelA.find(layer=>layer.source==='tracks');
 const [copy]=duplicateSelection(project,tracks,'labelA');project.surfaces.labelA.push(copy);
 const reopened=validateProject(JSON.parse(JSON.stringify(project)));
 const copied=reopened.surfaces.labelA.find(layer=>layer.name===copy.name);
 assert.ok(visibleText(reopened,copied,'labelA').includes('# **Track**'));
 reopened.data.A[0].title='*Edited*';assert.ok(visibleText(reopened,copied,'labelA').includes('*Edited*'));
 reopened.data.album='# **Edited Album**';
 assert.equal(visibleText(reopened,reopened.surfaces.labelA.find(layer=>layer.source==='album'),'labelA'),'# **Edited Album**');
 importReference(reopened,referenceURL.replace('Track','Replacement'));
 assert.ok(visibleText(reopened,reopened.surfaces.labelA.find(layer=>layer.source==='tracks'),'labelA').includes('# **Replacement**'));
});

test('older saved standard label and J-card direct fields are repaired while explicit formatting is retained',()=>{
 const project=importReference(createProject(),referenceURL);
 for(const surface of ['labelA','labelB'])for(const layer of project.surfaces[surface])delete layer.literalText;
 project.surfaces.labelA.find(layer=>layer.source==='album').literalText=false;
 const custom=makeLayer('text',{text:'**Custom**'});project.surfaces.labelB.push(custom);
 const reopened=validateProject(JSON.parse(JSON.stringify(project)));
 assert.ok(visibleText(reopened,reopened.surfaces.labelA.find(layer=>layer.source==='artist'),'labelA').includes('*Artist*'));
 const album=reopened.surfaces.labelA.find(layer=>layer.source==='album');assert.equal(album.literalText,false);
 assert.equal(visibleText(reopened,album,'labelA'),'Album');
 assert.equal(reopened.surfaces.labelB.find(layer=>!layer.source).literalText,undefined);
 const jcard=importReference(createProject(),'https://vhs.texs.org/en/jcard?'+new URLSearchParams({
  musicArtist:'*Artist*',musicAlbum:'# **Album**',musicA:'*Track* (1:00)',musicDS:'*Stereo*',musicDSh:'0',
  musicProd:'**Production**',jh:'w',musicLyrics:'**Lyrics**'
 }));
 for(const layers of Object.values(jcard.surfaces))for(const layer of layers)delete layer.literalText;
 const repaired=validateProject(JSON.parse(JSON.stringify(jcard)));
 const direct=repaired.surfaces.outer.filter(layer=>layer.referenceSpine||layer.source==='flapTracks'||layer.referenceFlapProduction||layer.category==='referenceStereo');
 assert.ok(direct.length>=3);assert.ok(direct.every(layer=>layer.literalText));
 assert.ok(repaired.surfaces.outer.filter(layer=>layer.source==='referenceContents').every(layer=>layer.literalText===undefined));
 const contents=makeLayer('text',{source:'referenceContents',text:'**Contents**'});repaired.surfaces.outer.push(contents);
 assert.equal(validateProject(repaired).surfaces.outer.at(-1).literalText,undefined);
});

test('old manual copies of short-flap credits recover literal text without recovering automatic geometry',()=>{
 const project=importReference(createProject(),'https://vhs.texs.org/en/jcard?'+new URLSearchParams({
  sb:'1',jh:'w',musicProd:'**Production**',musicA:'Track',musicB:'Last'
 }));
 const production=project.surfaces.outer.find(layer=>layer.referenceFlapProduction),[copy]=duplicateSelection(project,production,'outer');
 assert.equal(copy.referenceFlapProduction,undefined);delete copy.literalText;delete copy.standardBlockCopy;
 Object.assign(copy,{x:35,y:12,w:44,h:18,rotation:15,locked:true});project.surfaces.outer.push(copy);
 const reopened=validateProject(JSON.parse(JSON.stringify(project))),restored=reopened.surfaces.outer.find(layer=>layer.name===copy.name);
 assert.equal(visibleText(reopened,restored,'outer'),'**Production**');assert.equal(restored.referenceFlapProduction,undefined);
 for(const key of ['x','y','w','h','rotation','locked'])assert.equal(restored[key],copy[key],key+' stays manual');
});
