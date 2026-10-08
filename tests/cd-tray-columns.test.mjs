import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,clone,makeLayer,boundText,dimensions,importReference,panelRects} from '../src/model.js';
import {resetCDSurfaces,updateCDLayout,makeCDProductionLayer,cdTrayTrackActive} from '../src/cd-layout.js';
import {renderSvg,flowText,textLayout} from '../src/render.js';
import {duplicateSelection} from '../src/selection-edit.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const trackLayers=(p,surface)=>p.surfaces[surface].filter(layer=>layer.source==='cdTracks');
function project(){
 const p=createProject();p.editorMode='cd-tray';p.data.A=Array.from({length:10},(_,i)=>({title:'TRACKTOKEN'+String(i+1).padStart(2,'0'),seconds:121+i}));p.data.B=Array.from({length:10},(_,i)=>({title:'TRACKTOKEN'+String(i+11).padStart(2,'0'),seconds:131+i}));return p;
}
function change(p,patch){const old=clone(p.layout);Object.assign(p.layout,patch);updateCDLayout(p,'cd-tray',old)}
function joined(p,surface){return trackLayers(p,surface).sort((a,b)=>(a.cdColumnIndex||0)-(b.cdColumnIndex||0)).map(layer=>flowText(p,layer,surface).text).join('\n')}

test('CD tray two columns serialize each complete ordered album once on each independent face',()=>{
 const p=project();change(p,{columns:2,cdTrayDouble:true});
 for(const surface of ['cdTray','cdTrayInside']){
  const columns=trackLayers(p,surface);assert.equal(columns.length,2);assert.deepEqual(columns.map(layer=>layer.cdColumnIndex),[0,1]);assert.ok(columns.every(layer=>layer.cdTrayTrackFlow));
  const panel=panelRects(p,surface).find(panel=>panel.index===2);near(columns[0].x,panel.x+7);near(columns[1].x,columns[0].x+columns[0].w+4);near(columns[1].x+columns[1].w,panel.x+panel.w-7);
  const text=joined(p,surface);for(const track of [...p.data.A,...p.data.B])assert.equal(text.split(track.title).length-1,1,track.title);assert.ok(text.indexOf('TRACKTOKEN10')<text.indexOf('TRACKTOKEN11'));assert.doesNotMatch(text,/SIDE|Сторона/);
  assert.equal(flowText(p,columns.at(-1),surface).overflow,false);const rendered=renderSvg(p,surface,{guides:false});for(const track of [...p.data.A,...p.data.B])assert.equal(rendered.svg.split(track.title).length-1,1,track.title);assert.equal(rendered.warnings.length,0);
  assert.ok(new Resvg(rendered.svg,{fitTo:{mode:'width',value:700}}).render().asPng().length>1000);
 }
});

test('CD tray column-height controls the actual frame and exposes overflow without discarding source tracks',()=>{
 const p=project(),all=clone(p.data);change(p,{columns:2,columnHeight:20});
 for(const layer of trackLayers(p,'cdTray'))near(layer.h,(dimensions(p,'cdTray').h-56)*.2);
 assert.equal(flowText(p,trackLayers(p,'cdTray').at(-1),'cdTray').overflow,true);assert.match(renderSvg(p,'cdTray',{guides:false}).warnings.join('\n'),/Содержание CD не помещается/);assert.deepEqual(p.data,all);
 change(p,{columnHeight:100});assert.equal(flowText(p,trackLayers(p,'cdTray').at(-1),'cdTray').overflow,false);assert.equal(renderSvg(p,'cdTray',{guides:false}).warnings.length,0);assert.ok(joined(p,'cdTray').includes('TRACKTOKEN20'));
});

test('legacy one-column CD tray upgrades only its untouched geometry and retains typography and controls',()=>{
 const p=project();p.layout.columns=2;p.layout.columnHeight=55;
 for(const surface of ['cdTray','cdTrayInside']){
  const first=trackLayers(p,surface)[0],panel=panelRects(p,surface).find(panel=>panel.index===2);delete first.cdTrayTrackFlow;delete first.cdColumnIndex;Object.assign(first,{x:panel.x+7,y:36,w:panel.w-14,h:dimensions(p,surface).h-56,font:'Georgia',color:'#123456',size:2.1,trackOptions:{numbers:false,durations:false,hideTracks:false,showProduction:true}});
 }
 p.data.production='PRODUCTION-END';const first=trackLayers(p,'cdTray')[0],id=first.id;change(p,{columns:2,columnHeight:100});
 const columns=trackLayers(p,'cdTray');assert.equal(columns.length,2);assert.equal(columns[0].id,id);near(columns[0].w,(panelRects(p,'cdTray').find(panel=>panel.index===2).w-18)/2);
 for(const layer of columns){assert.equal(layer.font,'Georgia');assert.equal(layer.color,'#123456');assert.equal(layer.size,2.1);assert.deepEqual(layer.trackOptions,first.trackOptions)}
 assert.notEqual(columns[0].trackOptions,columns[1].trackOptions);const text=joined(p,'cdTray');assert.equal(text.split('PRODUCTION-END').length-1,1);assert.doesNotMatch(text,/1\. TRACKTOKEN01|2:01/);for(const track of [...p.data.A,...p.data.B])assert.equal(text.split(track.title).length-1,1);
});

test('legacy locked or manually placed tray blocks retain exact stored data during column changes',()=>{
 for(const kind of ['locked','manual']){
  const p=project(),first=trackLayers(p,'cdTray')[0];delete first.cdTrayTrackFlow;delete first.cdColumnIndex;if(kind==='locked')first.locked=true;else first.x+=3;
  first.font='Georgia';first.trackOptions={hideTracks:true,showProduction:false};const before=clone(first);change(p,{columns:2,columnHeight:70});
  assert.deepEqual(p.surfaces.cdTray.find(layer=>layer.id===first.id),before);const columns=trackLayers(p,'cdTray');assert.equal(columns.length,2);assert.equal(columns[1].locked,false);assert.equal(columns[1].font,'Georgia');assert.deepEqual(columns[1].trackOptions,first.trackOptions);assert.equal(joined(p,'cdTray').trim(),'');
 }
});

test('imported tray gains columns on its front while empty or custom-only reverse faces stay intact',()=>{
 const p=importReference(project(),'https://vhs.texs.org/en/cd-tray?musicA=One+%281%3A00%29&musicB=Two+%282%3A00%29'),caption=makeLayer('text',{name:'Inside custom',text:'Keep this',locked:true});p.surfaces.cdTrayInside=[caption];const saved=clone(caption);
 change(p,{columns:2,columnHeight:75,cdTrayDouble:true});assert.equal(trackLayers(p,'cdTray').length,2);assert.deepEqual(p.surfaces.cdTrayInside,[saved]);assert.match(joined(p,'cdTray'),/One.*Two/s);
 p.surfaces.cdTrayInside=[];change(p,{columns:1});assert.deepEqual(p.surfaces.cdTrayInside,[]);assert.equal(trackLayers(p,'cdTray').filter(layer=>cdTrayTrackActive(p,layer,'cdTray')).length,1);
});

test('CD tray changes retain all other format layers and disabled spine templates retain their identities and styles',()=>{
 const p=project(),others=clone({outer:p.surfaces.outer,inner:p.surfaces.inner,cdLabel:p.surfaces.cdLabel,cdFront:p.surfaces.cdFront,cdInside:p.surfaces.cdInside});
 for(const surface of ['cdTray','cdTrayInside'])for(const index of [0,1]){
  const spine=p.surfaces[surface].find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===index);spine.font='Georgia';spine.hideArtist=true;spine.albumStyle={font:'Times New Roman',size:4,color:'#ff0000'};
 }
 const before=['cdTray','cdTrayInside'].flatMap(surface=>p.surfaces[surface].filter(layer=>layer.source==='cdSpine').map(layer=>({surface,layer,saved:clone(layer)})));
 change(p,{cdTrayLeftSpine:false,cdTrayRightSpine:false,columns:2});
 for(const {surface,layer}of before)assert.equal(p.surfaces[surface].find(candidate=>candidate.id===layer.id),layer);
 for(const surface of ['cdTray','cdTrayInside']){
  const rendered=renderSvg(p,surface,{guides:false});for(const {layer}of before.filter(item=>item.surface===surface))assert.equal(rendered.svg.includes('s'+surface+'-'+layer.id.replace(/[^a-z0-9]/gi,'')),false);
  const folds=[...renderSvg(p,surface,{blank:true}).svg.matchAll(/d="M([0-9.]+) 0V/g)];assert.equal(folds.length,0);
 }
 change(p,{cdTrayLeftSpine:true,cdTrayRightSpine:true});
 for(const {surface,layer,saved}of before){assert.equal(p.surfaces[surface].find(candidate=>candidate.id===layer.id),layer);for(const key of ['id','font','hideArtist','albumStyle','visible','locked'])assert.deepEqual(layer[key],saved[key]);assert.equal(boundText(p,layer,surface),p.data.album)}
 assert.deepEqual({outer:p.surfaces.outer,inner:p.surfaces.inner,cdLabel:p.surfaces.cdLabel,cdFront:p.surfaces.cdFront,cdInside:p.surfaces.cdInside},others);
});

test('locked and manual latent spines remain unchanged while disabled and restored',()=>{
 for(const kind of ['locked','manual']){
  const p=project(),layer=p.surfaces.cdTray.find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===0);if(kind==='locked')layer.locked=true;else layer.x+=2;
  const before=clone(layer);change(p,{cdTrayLeftSpine:false});change(p,{cdTrayHeight:125});change(p,{cdTrayLeftSpine:true});assert.deepEqual(layer,before);
 }
});

test('a new CD Label has the original centered production line and factory adds no cassette-specific text',()=>{
 const p=createProject(),layers=p.surfaces.cdLabel.filter(layer=>layer.source==='production');assert.equal(layers.length,1);const layer=layers[0],point=25.4/72;near(layer.size,6*point);near(layer.y+.9*layer.size,91.304*point);assert.equal(layer.align,'center');
 p.data.production='CDPRODUCTIONTOKEN';assert.ok(renderSvg(p,'cdLabel',{guides:false}).svg.includes('CDPRODUCTIONTOKEN'));const next=makeCDProductionLayer(p);assert.notEqual(next.id,layer.id);near(next.y,layer.y);assert.equal(next.source,'production');
});

test('only the original reverse-production marker centers its text vertically without changing its frame',()=>{
 const p=project();p.data.production='CREDITSTOKEN';const layer=makeLayer('text',{source:'production',cdTrayInsideProduction:true,x:12,y:18,w:100,h:70,size:3,align:'center',autoFit:false});p.surfaces.cdTrayInside=[layer];const before=clone(layer),layout=textLayout(p.data.production,layer),rendered=renderSvg(p,'cdTrayInside',{guides:false});
 near(Number(rendered.svg.match(/ y="([0-9.]+)" font-size="3"/)[1]),layout.baselines[0]+(layer.h-layout.height)/2);assert.deepEqual(layer,before);
 delete layer.cdTrayInsideProduction;const uncentered=renderSvg(p,'cdTrayInside',{guides:false});near(Number(uncentered.svg.match(/ y="([0-9.]+)" font-size="3"/)[1]),layout.baselines[0]);
});

test('a duplicated CD tray column keeps its own visible text without joining or changing the album flow',()=>{
 const p=project();p.data.A=[{title:'DUPLICATEDTRACKTOKEN',seconds:60}];p.data.B=[];const original=trackLayers(p,'cdTray')[0],expected=flowText(p,original,'cdTray').text,before=clone(original);
 const [copy]=duplicateSelection(p,original,'cdTray',{joined:false});p.surfaces.cdTray.push(copy);
 assert.equal(copy.source,undefined);assert.equal(copy.cdTemplate,undefined);assert.equal(copy.cdTrayTrackFlow,undefined);assert.equal(copy.text,expected);assert.equal(copy.visible,original.visible);assert.equal(copy.locked,original.locked);
 assert.equal(flowText(p,copy,'cdTray').text,expected);assert.equal(flowText(p,original,'cdTray').text,expected);assert.deepEqual(original,before);
 const rendered=renderSvg(p,'cdTray',{guides:false});assert.equal(rendered.svg.split('DUPLICATEDTRACKTOKEN').length-1,2);assert.equal(rendered.warnings.length,0);
 p.data.A=[];assert.equal(flowText(p,copy,'cdTray').text,expected);assert.equal(flowText(p,original,'cdTray').text,'');
});

test('copies of the second tray column and copied faces keep the exact visible segment through structural toggles',()=>{
 const p=project();change(p,{columns:2});const second=trackLayers(p,'cdTray')[1],expected=flowText(p,second,'cdTray').text;assert.ok(expected.includes('TRACKTOKEN20'));assert.ok(!expected.includes('TRACKTOKEN01'));
 Object.assign(second,{font:'Georgia',color:'#fa0000',opacity:.6});const [copy]=duplicateSelection(p,second,'cdTray',{joined:false,dx:0,dy:0});p.surfaces.cdTrayInside.push(copy);
 assert.equal(flowText(p,copy,'cdTrayInside').text,expected);for(const key of ['font','color','opacity','visible','locked','x','y','w','h'])assert.deepEqual(copy[key],second[key]);
 const [copiedAgain]=duplicateSelection(p,copy,'cdTrayInside',{joined:false});p.surfaces.cdTrayInside.push(copiedAgain);assert.equal(copiedAgain.text,expected);
 change(p,{columns:1});assert.equal(flowText(p,copy,'cdTrayInside').text,expected);assert.equal(flowText(p,copiedAgain,'cdTrayInside').text,expected);
 const rendered=renderSvg(p,'cdTrayInside',{guides:false});assert.ok(rendered.svg.includes('TRACKTOKEN20'));assert.ok(new Resvg(rendered.svg,{fitTo:{mode:'width',value:700}}).render().asPng().length>1000);
});

test('duplicating CD insert content captures its own flowing segment independently of remaining panels',()=>{
 const p=project();p.editorMode='cd-insert';Object.assign(p.layout,{cdInsertPanels:2,cdInsertDouble:true,columns:1});resetCDSurfaces(p,'cd-insert');
 const original=p.surfaces.cdFront.find(layer=>layer.source==='cdContents'),expected=flowText(p,original,'cdFront').text,before=clone(original);
 const [copy]=duplicateSelection(p,original,'cdFront',{joined:false});p.surfaces.cdInside.push(copy);assert.equal(copy.source,undefined);assert.equal(copy.cdContentFlow,undefined);assert.equal(copy.cdTemplate,undefined);assert.equal(copy.text,expected);
 assert.equal(flowText(p,copy,'cdInside').text,expected);assert.equal(flowText(p,original,'cdFront').text,expected);assert.deepEqual(original,before);
});

test('a new second tray column inherits hidden visibility and cannot reveal a hidden list',()=>{
 const p=project();for(const surface of ['cdTray','cdTrayInside'])trackLayers(p,surface)[0].visible=false;change(p,{columns:2});
 for(const surface of ['cdTray','cdTrayInside']){
  const columns=trackLayers(p,surface);assert.equal(columns.length,2);assert.ok(columns.every(layer=>layer.visible===false));assert.equal(joined(p,surface),'\n');
  const rendered=renderSvg(p,surface,{guides:false});assert.ok(!rendered.svg.includes('TRACKTOKEN'));assert.equal(rendered.warnings.length,0);
 }
});

test('a latent second tray column retains its identity, typography, options and visibility through repeated toggles',()=>{
 const p=project();change(p,{columns:2});const second=trackLayers(p,'cdTray')[1];Object.assign(second,{font:'Georgia',color:'#fa0000',size:4,visible:false,trackOptions:{numbers:false,durations:false,showProduction:true}});const saved=clone(second);
 for(let index=0;index<2;index++){
  change(p,{columns:1});assert.equal(p.surfaces.cdTray.find(layer=>layer.id===second.id),second);assert.deepEqual(second,saved);assert.equal(cdTrayTrackActive(p,second,'cdTray'),false);assert.equal(flowText(p,second,'cdTray').text,'');
  assert.ok(!renderSvg(p,'cdTray',{guides:false}).svg.includes('scdTray-'+second.id.replace(/[^a-z0-9]/gi,'')));
  change(p,{columns:2});assert.equal(trackLayers(p,'cdTray').length,2);assert.equal(cdTrayTrackActive(p,second,'cdTray'),true);assert.deepEqual(second,saved);
 }
});

test('locked or manually placed second tray columns are latent without any stored-data mutation',()=>{
 for(const kind of ['locked','manual']){
  const p=project();change(p,{columns:2});const layer=trackLayers(p,'cdTray')[1];if(kind==='locked')layer.locked=true;else layer.x+=3;
  const saved=clone(layer);change(p,{columns:1});assert.deepEqual(layer,saved);assert.equal(flowText(p,layer,'cdTray').text,'');assert.ok(!renderSvg(p,'cdTray',{guides:false}).svg.includes('scdTray-'+layer.id.replace(/[^a-z0-9]/gi,'')));
  change(p,{cdTrayHeight:130});assert.deepEqual(layer,saved);change(p,{columns:2});assert.deepEqual(layer,saved);assert.equal(cdTrayTrackActive(p,layer,'cdTray'),true);
 }
});
