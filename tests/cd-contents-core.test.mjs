import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {boundText,clone,createProject,makeLayer} from '../src/model.js';
import {cdLabelGeometry,cdPrintReadyCutPath,resetCDSurfaces,updateCDLayout,updateCDTrackLayout} from '../src/cd-layout.js';
import {setCDContentOption} from '../src/cd-content-edit.js';
import {flowText,renderSvg} from '../src/render.js';

function contentsProject(){
 const p=createProject();Object.assign(p.data,{artist:'ARTISTTOKEN',album:'ALBUMTOKEN',lyrics:'LYRICTOKEN',production:'PRODUCTIONTOKEN',A:[{title:'TRACKATOKEN',seconds:61}],B:[{title:'TRACKBTOKEN',seconds:62}]});return p;
}
const contentsLayer=props=>makeLayer('text',{source:'cdContents',name:'Содержание CD',x:5,y:5,w:110,h:110,size:3,autoFit:false,...props});

test('CD contents controls hide each section and keep production once in the actual bound text',()=>{
 const p=contentsProject(),layer=contentsLayer();
 const full=boundText(p,layer,'cdFront');for(const token of ['ARTISTTOKEN','ALBUMTOKEN','TRACKATOKEN','TRACKBTOKEN','LYRICTOKEN','PRODUCTIONTOKEN'])assert.ok(full.includes(token),token);
 assert.equal(full.split('PRODUCTIONTOKEN').length-1,1);
 for(const [option,tokens]of [['hideArtist',['ARTISTTOKEN']],['hideAlbum',['ALBUMTOKEN']],['hideTracks',['TRACKATOKEN','TRACKBTOKEN']],['hideLyrics',['LYRICTOKEN']]]){
  layer.trackOptions={[option]:true};const text=boundText(p,layer,'cdFront');for(const token of tokens)assert.equal(text.includes(token),false,option);assert.ok(text.includes('PRODUCTIONTOKEN'));
 }
 layer.trackOptions={hideArtist:true,hideAlbum:true,hideTracks:true,hideLyrics:true};assert.equal(boundText(p,layer,'cdFront'),'PRODUCTIONTOKEN');
 layer.trackOptions.showProduction=false;assert.equal(boundText(p,layer,'cdFront'),'');
});

test('explicit CD options can reveal legacy hidden sections while unchanged legacy flags still work',()=>{
 const p=contentsProject(),layer=contentsLayer({hideArtist:true,hideAlbum:true,hideTracks:true,hideLyrics:true,showProduction:false});
 assert.equal(boundText(p,layer,'cdFront'),'');
 layer.trackOptions={hideArtist:false,hideAlbum:false,hideTracks:false,hideLyrics:false,showProduction:true};
 const text=boundText(p,layer,'cdFront');for(const token of ['ARTISTTOKEN','ALBUMTOKEN','TRACKATOKEN','LYRICTOKEN','PRODUCTIONTOKEN'])assert.ok(text.includes(token),token);
 const tracks={...layer,source:'cdTracks',trackOptions:{hideTracks:true,showProduction:true}};assert.equal(boundText(p,tracks,'cdLabel'),'PRODUCTIONTOKEN');
 tracks.trackOptions.showProduction=false;assert.equal(boundText(p,tracks,'cdLabel'),'');
});

test('CD content checkbox choices change the native exported artwork without mutating cassette settings',()=>{
 const p=contentsProject(),cassette=clone(p.surfaces.outer),layer=contentsLayer({trackOptions:{hideTracks:true,hideLyrics:true,showProduction:false}});p.surfaces.cdFront=[layer];
 const result=renderSvg(p,'cdFront',{guides:false});assert.ok(result.svg.includes('ARTISTTOKEN'));assert.ok(result.svg.includes('ALBUMTOKEN'));for(const token of ['TRACKATOKEN','TRACKBTOKEN','LYRICTOKEN','PRODUCTIONTOKEN'])assert.equal(result.svg.includes(token),false,token);
 const native=new Resvg(result.svg,{fitTo:{mode:'width',value:600}}).render();assert.ok(native.asPng().length>1000);assert.deepEqual(p.surfaces.outer,cassette);
});

function flowFixture(front,back,flag){
 const p=createProject();Object.assign(p.data,{artist:'',album:'',lyrics:'',production:'PRODUCTION-END',A:Array.from({length:12},(_,i)=>({title:'TRACK-'+String(i+1).padStart(2,'0'),seconds:60})),B:[]});
 const layer=index=>contentsLayer({[flag]:true,cdContentIndex:index,h:index?105:7,trackOptions:{showProduction:true}});
 p.surfaces[front]=[layer(0)];p.surfaces[back]=[layer(1)];return p;
}

for(const flag of ['referenceCDContent','cdContentFlow'])test('single-sided insert '+flag+' reports overflow without silently consuming stored reverse-face frames',()=>{
 const p=flowFixture('cdFront','cdInside',flag),a=p.surfaces.cdFront[0],b=p.surfaces.cdInside[0],stored=clone(p.surfaces.cdInside);
 p.layout.cdInsertDouble=false;assert.equal(flowText(p,a,'cdFront').overflow,true);assert.deepEqual(flowText(p,b,'cdInside'),{text:'',overflow:false});
 assert.match(renderSvg(p,'cdFront',{guides:false}).warnings.join('\n'),/Содержание CD не помещается/);assert.equal(renderSvg(p,'cdFront',{guides:false}).svg.includes('PRODUCTION-END'),false);
 p.layout.cdInsertDouble=true;const first=flowText(p,a,'cdFront'),last=flowText(p,b,'cdInside');assert.equal(first.overflow,false);assert.equal(last.overflow,false);assert.ok(last.text.includes('PRODUCTION-END'));assert.equal(last.text.includes('TRACK-01'),false);
 const printed=first.text+'\n'+last.text;for(const track of p.data.A)assert.equal(printed.split(track.title).length-1,1,track.title);assert.equal(printed.split('PRODUCTION-END').length-1,1);assert.deepEqual(p.surfaces.cdInside,stored);
 p.layout.cdInsertDouble=false;assert.equal(flowText(p,a,'cdFront').overflow,true);assert.deepEqual(p.surfaces.cdInside,stored);
});

test('CD tray contents only flow into a reverse face when tray duplex is enabled',()=>{
 const p=flowFixture('cdTray','cdTrayInside','referenceCDContent'),front=p.surfaces.cdTray[0],inside=p.surfaces.cdTrayInside[0],stored=clone(p.surfaces.cdTrayInside);p.layout.cdInsertDouble=true;
 assert.equal(flowText(p,front,'cdTray').overflow,true);assert.deepEqual(flowText(p,inside,'cdTrayInside'),{text:'',overflow:false});
 p.layout.cdTrayDouble=true;assert.equal(flowText(p,front,'cdTray').overflow,false);assert.ok(flowText(p,inside,'cdTrayInside').text.includes('PRODUCTION-END'));assert.deepEqual(p.surfaces.cdTrayInside,stored);
});

test('legacy reference flow on CD ignores unrelated cassette and unprinted CD reverse-face frames',()=>{
 const p=createProject();p.data.lyrics=Array.from({length:12},(_,i)=>'LYRIC-'+String(i+1).padStart(2,'0')).join('\n');
 const layer=index=>makeLayer('text',{source:'lyrics',referenceFlow:true,flowIndex:index,x:4,y:4,w:100,h:index?100:7,size:3,autoFit:false});
 const first=layer(0),reverse=layer(1),cassette=layer(2);p.surfaces.cdFront=[first];p.surfaces.cdInside=[reverse];p.surfaces.outer=[cassette];p.layout.cdInsertDouble=false;
 assert.equal(flowText(p,first,'cdFront').overflow,true);assert.deepEqual(flowText(p,reverse,'cdInside'),{text:'',overflow:false});
 p.layout.cdInsertDouble=true;assert.equal(flowText(p,first,'cdFront').overflow,false);assert.ok(flowText(p,reverse,'cdInside').text.includes('LYRIC-12'));
});

test('right CD track layout announces its 18-track limit and other layouts restore all titles',()=>{
 const p=createProject();p.data.A=Array.from({length:22},(_,i)=>({title:'TRACKTOKEN'+String(i+1).padStart(2,'0'),seconds:60}));p.data.B=[];p.layout.cdTrackLayout='right';resetCDSurfaces(p,'cd-label');
 const layer=p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');
 const result=renderSvg(p,'cdLabel',{guides:false});assert.match(result.warnings.join('\n'),/первые 18 из 22 треков CD/);assert.ok(result.svg.includes('TRACKTOKEN18'));assert.equal(result.svg.includes('TRACKTOKEN19'),false);assert.equal(p.data.A.length,22);
 layer.visible=false;assert.equal(renderSvg(p,'cdLabel',{guides:false}).warnings.some(warning=>warning.includes('первые')),false);layer.visible=true;layer.trackOptions.hideTracks=true;assert.equal(renderSvg(p,'cdLabel',{guides:false}).warnings.some(warning=>warning.includes('первые')),false);layer.trackOptions.hideTracks=false;
 for(const kind of ['bottom','circular']){p.layout.cdTrackLayout=kind;updateCDTrackLayout(p);const rendered=renderSvg(p,'cdLabel',{guides:false});assert.equal(rendered.warnings.some(warning=>warning.includes('первые')),false);assert.ok(rendered.svg.includes('TRACKTOKEN22'))}
});

test('CD visibility additions leave cassette track and combined-content text behavior unchanged',()=>{
 const p=contentsProject(),layer=makeLayer('text',{source:'referenceContents',hideArtist:true,trackOptions:{hideTracks:true,hideLyrics:true,showProduction:false,showSide:false}});
 const text=boundText(p,layer,'outer');assert.equal(text.includes('ARTISTTOKEN'),false);assert.equal(text.includes('TRACKATOKEN'),false);assert.ok(text.includes('LYRICTOKEN'));assert.equal(text.includes('PRODUCTIONTOKEN'),false);
 const cassetteTracks={...layer,source:'tracks',trackOptions:{hideTracks:true,showProduction:true}};assert.equal(boundText(p,cassetteTracks,'labelA'),'PRODUCTIONTOKEN');
});

test('CD Print Ready clips all artwork to exact safe rings while leaving editable frames intact',()=>{
 for(const [hub,hole]of [[false,42.897778],[true,20.955]]){
  const p=createProject();p.layout.cdLabelHub=hub;p.settings.bg='#aabbcc';p.settings.guides=true;p.surfaces.cdLabel=[makeLayer('shape',{shape:'rect',x:0,y:0,w:130,h:130,color:'#ff0000'})];const stored=clone(p);
  const geometry=cdLabelGeometry(p);assert.equal(geometry.safeHoleDiameter,hole);assert.ok(Math.abs(geometry.safeOuterDiameter-115.640556)<1e-6);
  const result=renderSvg(p,'cdLabel',{cdPrintReady:true,guides:true});assert.doesNotMatch(result.svg,/<circle|stroke-dasharray|class="selection"/);assert.deepEqual(p,stored);
  const native=new Resvg(result.svg,{fitTo:{mode:'width',value:1000}}).render(),scale=native.width/geometry.frame,center=geometry.center*scale;
  const alpha=(radius)=>native.pixels[(Math.floor(center)*native.width+Math.floor(center+radius*scale))*4+3];
  assert.equal(alpha(0),0);assert.equal(alpha(hole/2-.6),0);assert.ok(alpha(hole/2+.6)>240);assert.ok(alpha(geometry.safeOuterDiameter/2-.6)>240);assert.equal(alpha(geometry.safeOuterDiameter/2+.6),0);
  const normal=new Resvg(renderSvg(p,'cdLabel',{guides:false}).svg,{fitTo:{mode:'width',value:1000}}).render();const normalAlpha=radius=>normal.pixels[(Math.floor(center)*normal.width+Math.floor(center+radius*scale))*4+3];assert.ok(normalAlpha(geometry.safeOuterDiameter/2+.6)>240);assert.ok(normalAlpha(hole/2-.6)>240);
 }
});

test('Print Ready is restricted to disc labels and cannot invert an impossible custom safe ring',()=>{
 const p=createProject();assert.equal(renderSvg(p,'cdFront',{cdPrintReady:true,guides:false}).svg,renderSvg(p,'cdFront',{guides:false}).svg);
 p.layout.cdLabelDiameter=70;p.layout.cdLabelHole=75;p.surfaces.cdLabel=[];assert.equal(cdPrintReadyCutPath(p),'');
 const native=new Resvg(renderSvg(p,'cdLabel',{cdPrintReady:true}).svg,{fitTo:{mode:'width',value:200}}).render();assert.equal(native.pixels.some((value,index)=>index%4===3&&value>0),false);
});

test('new generic CD panels and columns inherit all content options without restoring hidden sections',()=>{
 const p=contentsProject();p.editorMode='cd-insert';const first=p.surfaces.cdFront.find(layer=>layer.cdContentFlow);
 for(const [key,value]of [['hideTracks',true],['hideLyrics',true],['showProduction',false],['numbers',false],['durations',false]])assert.equal(setCDContentOption(p,first,'cdFront',key,value),true);
 const otherFormats=clone({outer:p.surfaces.outer,cdLabel:p.surfaces.cdLabel,cdTray:p.surfaces.cdTray});
 first.font='Georgia';first.color='#123456';const kept={id:first.id,font:first.font,color:first.color};
 for(const change of [{cdInsertPanels:3},{columns:2},{cdInsertDouble:true}]){
  const old=clone(p.layout);Object.assign(p.layout,change);updateCDLayout(p,'cd-insert',old);
  const frames=['cdFront','cdInside'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.cdContentFlow).map(layer=>({surface,layer})));
  for(const {layer}of frames){assert.deepEqual(layer.trackOptions,first.trackOptions);for(const token of ['TRACKATOKEN','TRACKBTOKEN','LYRICTOKEN','PRODUCTIONTOKEN'])assert.equal(boundText(p,layer,'cdFront').includes(token),false)}
  const printed=frames.sort((a,b)=>a.layer.cdContentIndex-b.layer.cdContentIndex).map(({surface,layer})=>flowText(p,layer,surface).text).join('\n');
  assert.equal(printed.split('ARTISTTOKEN').length-1,1);assert.equal(printed.split('ALBUMTOKEN').length-1,1);for(const token of ['TRACKATOKEN','TRACKBTOKEN','LYRICTOKEN','PRODUCTIONTOKEN'])assert.equal(printed.includes(token),false);
  assert.equal(first.id,kept.id);assert.equal(first.font,kept.font);assert.equal(first.color,kept.color);
 }
 const newer=p.surfaces.cdFront.find(layer=>layer.cdContentFlow&&layer!==first);assert.notEqual(newer.trackOptions,first.trackOptions);
 assert.deepEqual({outer:p.surfaces.outer,cdLabel:p.surfaces.cdLabel,cdTray:p.surfaces.cdTray},otherFormats);
});

test('new generic inside columns inherit legacy visibility and preserve locked frames',()=>{
 const p=contentsProject();p.layout.cdInsertPanels=1;resetCDSurfaces(p,'cd-insert');const first=p.surfaces.cdInside[0];
 delete first.trackOptions;Object.assign(first,{hideArtist:true,hideAlbum:true,hideTracks:true,hideLyrics:true,showProduction:false,hideA:true,hideB:true,locked:true,font:'Georgia'});const before=clone(first),old=clone(p.layout);
 p.layout.cdInsertDouble=true;p.layout.columns=2;updateCDLayout(p,'cd-insert',old);
 assert.deepEqual(p.surfaces.cdInside.find(layer=>layer.id===first.id),before);
 const created=p.surfaces.cdInside.find(layer=>layer.id!==first.id);assert.ok(created);assert.equal(created.locked,false);assert.equal(created.trackOptions,undefined);
 for(const option of ['hideArtist','hideAlbum','hideTracks','hideLyrics','hideA','hideB','showProduction'])assert.equal(created[option],first[option]);
 assert.equal(boundText(p,created,'cdInside'),'');
});
