import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {boundText,clone,createProject,importReference,makeLayer,migrate} from '../src/model.js';
import {flowText,renderSvg} from '../src/render.js';

function project(reference=false){
 const params={mode:'d2',musicArtist:'ARTISTTOKEN',musicAlbum:'ALBUMTOKEN',musicLyrics:'## LYRICHEADING\nLYRICFIRST\n\nLYRICLAST',musicProd:'**PRODUCTIONTOKEN**',musicA:'TRACKATOKEN (1:01)',musicB:'TRACKBTOKEN (1:02)',sep:'1'};
 const p=reference?importReference(createProject(),'https://vhs.texs.org/en/cd-insert?'+new URLSearchParams(params)):createProject();
 if(!reference){p.editorMode='cd-insert';p.layout.cdInsertDouble=true;p.settings.referenceSeparator='|';Object.assign(p.data,{artist:params.musicArtist,album:params.musicAlbum,lyrics:params.musicLyrics,production:params.musicProd,A:[{title:'TRACKATOKEN',seconds:61}],B:[{title:'TRACKBTOKEN',seconds:62}]})}
 return p;
}
const content=p=>p.surfaces.cdFront.find(layer=>layer.source==='cdContents');
const sequence=['ARTISTTOKEN','ALBUMTOKEN','LYRICHEADING','LYRICFIRST','LYRICLAST','Tracklist','TRACKATOKEN','TRACKBTOKEN','PRODUCTIONTOKEN'];
function ordered(text,tokens=sequence){let previous=-1;for(const token of tokens){const index=text.indexOf(token);assert.ok(index>previous,token+' is missing or out of order');previous=index}}

test('new and reference CD inserts share the heading, lyrics, tracklist and production order',()=>{
 for(const reference of [false,true]){
  const p=project(reference),before=clone(p),text=boundText(p,content(p),'cdFront');
  assert.equal(text,'## ARTISTTOKEN | ALBUMTOKEN\n\n## LYRICHEADING\nLYRICFIRST\n\nLYRICLAST\n\n### Tracklist\n1. TRACKATOKEN (1:01)\n2. TRACKBTOKEN (1:02)\n\n**PRODUCTIONTOKEN**');
  ordered(text);for(const token of sequence)assert.equal(text.split(token).length-1,1,token);assert.deepEqual(p,before);
 }
});

test('heading uses the configured separator and leaves no separator when either title is hidden',()=>{
 const p=project(),layer=content(p);
 for(const separator of ['-','|','\u2002','•','·']){p.settings.referenceSeparator=separator;const expected=separator==='\u2002'?'ARTISTTOKEN'+separator+'ALBUMTOKEN':'ARTISTTOKEN '+separator+' ALBUMTOKEN';assert.equal(boundText(p,layer,'cdFront').split('\n')[0],'## '+expected)}
 layer.trackOptions={hideArtist:true};assert.equal(boundText(p,layer,'cdFront').split('\n')[0],'## ALBUMTOKEN');
 layer.trackOptions={hideAlbum:true};assert.equal(boundText(p,layer,'cdFront').split('\n')[0],'## ARTISTTOKEN');
 layer.trackOptions={hideArtist:true,hideAlbum:true};assert.ok(boundText(p,layer,'cdFront').startsWith('## LYRICHEADING'));
});

test('all supported content controls omit their section without clearing album or track data',()=>{
 const p=project(true),layer=content(p),data=clone(p.data);
 for(const [key,token]of [['hideArtist','ARTISTTOKEN'],['hideAlbum','ALBUMTOKEN'],['hideLyrics','LYRICFIRST'],['hideTracks','TRACKATOKEN']]){layer.trackOptions={[key]:true};const text=boundText(p,layer,'cdFront');assert.ok(!text.includes(token));if(key==='hideTracks')assert.ok(!text.includes('Tracklist'));assert.ok(text.includes('PRODUCTIONTOKEN'))}
 layer.trackOptions={hideArtist:true,hideAlbum:true,hideLyrics:true,hideTracks:true,showProduction:false};assert.equal(boundText(p,layer,'cdFront'),'');assert.deepEqual(p.data,data);
 Object.assign(layer,{hideArtist:true,hideAlbum:true,hideTracks:true,hideLyrics:true,showProduction:false});layer.trackOptions={hideArtist:false,hideAlbum:false,hideTracks:false,hideLyrics:false,showProduction:true};ordered(boundText(p,layer,'cdFront'));assert.deepEqual(p.data,data);
});

test('imported side visibility remains effective while a hidden track section has no empty heading',()=>{
 for(const [mask,shown,hidden]of [['4','TRACKBTOKEN','TRACKATOKEN'],['8','TRACKATOKEN','TRACKBTOKEN']]){
  const p=importReference(createProject(),'https://vhs.texs.org/en/cd-insert?'+new URLSearchParams({mode:'d2',jh:mask,musicA:'TRACKATOKEN',musicB:'TRACKBTOKEN'})),text=boundText(p,content(p),'cdFront');assert.ok(text.includes(shown));assert.ok(!text.includes(hidden));assert.ok(text.includes('### Tracklist'));
 }
 const p=importReference(createProject(),'https://vhs.texs.org/en/cd-insert?mode=d2&jh=c&musicA=TRACKATOKEN&musicB=TRACKBTOKEN');assert.ok(!boundText(p,content(p),'cdFront').includes('Tracklist'));
});

test('local track formatting stays supported and CD Label and Tray text stay unchanged',()=>{
 const p=project(),layer=content(p),disc=p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks'),tray=p.surfaces.cdTray.find(layer=>layer.source==='cdTracks');
 const other=clone({disc,discText:boundText(p,disc,'cdLabel'),tray,trayText:boundText(p,tray,'cdTray')});
 layer.trackOptions={numbers:false,durations:false,bullets:true,inlineTracks:false};assert.match(boundText(p,layer,'cdFront'),/### Tracklist\n- TRACKATOKEN\n- TRACKBTOKEN/);
 layer.trackOptions={numbers:false,durations:false,bullets:false,inlineTracks:false};assert.match(boundText(p,layer,'cdFront'),/### Tracklist\nTRACKATOKEN\nTRACKBTOKEN/);
 layer.trackOptions={numbers:false,durations:false,bullets:true,inlineTracks:true};assert.match(boundText(p,layer,'cdFront'),/### Tracklist\nTRACKATOKEN · TRACKBTOKEN/);
 assert.deepEqual({disc,discText:boundText(p,disc,'cdLabel'),tray,trayText:boundText(p,tray,'cdTray')},other);
});

test('printed content flows once in the new order and survives save and reopen with manual geometry',()=>{
 let p=project(true),first=content(p);Object.assign(first,{x:13,w:99,h:22,font:'Georgia',color:'#123456',locked:true});const saved=clone(first);p=migrate(clone(p));first=content(p);for(const key of ['x','w','h','font','color','locked'])assert.equal(first[key],saved[key]);
 const frames=['cdFront','cdInside'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.source==='cdContents').map(layer=>({surface,layer}))).sort((a,b)=>a.layer.cdContentIndex-b.layer.cdContentIndex),before=clone(p);
 const text=frames.map(({surface,layer})=>flowText(p,layer,surface).text).join('\n');ordered(text);for(const token of sequence)assert.equal(text.split(token).length-1,1,token);
 const printed=frames.map(({surface})=>renderSvg(p,surface,{guides:false}).svg);assert.ok(printed.some(svg=>svg.includes('LYRICFIRST')));assert.ok(printed.some(svg=>svg.includes('TRACKBTOKEN')));for(const svg of new Set(printed))assert.ok(new Resvg(svg,{fitTo:{mode:'width',value:600}}).render().asPng().length>1000);
 assert.deepEqual(p,before);
});
