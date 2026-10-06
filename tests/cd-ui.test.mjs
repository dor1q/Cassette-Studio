import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,clone,parseTracks,parseTrackDuration,serializeTracks,dimensions,makeLayer,esc,clamp,resetSurfaces} from '../src/model.js';
import {rebuildReferenceCDContents} from '../src/reference-cd.js';
import {cdTracks,editCDTrack,replaceCDTracks,moveCDTrack,deleteCDTrack,addCDTrack} from '../src/cd-track-editing.js';
import {cdTextPanel,cdTracksPanel,cdLayoutPanel} from '../src/cd-panels.js';
import {CD_DEFAULTS,resetCDSurfaces,updateCDLayout,updateCDTrackLayout} from '../src/cd-layout.js';
import {isCDMode,modeDefaultSurface,modeSurfaces,modeTitle,normalizeEditorMode} from '../src/media-formats.js';
import {previewGeometry,previewCrop} from '../src/preview-geometry.js';
import {remixGeometry} from '../src/overlay-remix-plan.js';

test('CD editing preserves order across former sides and never applies an invalid duration',()=>{
 const p=createProject(),all=cdTracks(p);assert.equal(all.length,9);
 const old=all[0].seconds;assert.equal(editCDTrack(p,0,'seconds','1:75'),false);assert.equal(all[0].seconds,old);
 assert.equal(editCDTrack(p,5,'seconds','1:02:03'),true);assert.equal(p.data.B[0].seconds,3723);
 assert.equal(moveCDTrack(p,5,0),true);assert.equal(cdTracks(p)[0],all[5]);assert.equal(p.data.B.length,0);
 assert.equal(deleteCDTrack(p,999),false);assert.equal(deleteCDTrack(p,0),true);addCDTrack(p);assert.equal(cdTracks(p).length,9);
 assert.equal(cdTracks(p).at(-1).title,'Новый трек');
});

const controls={field:(label,key,value,type,attrs,group)=>`<input aria-label="${label}" data-bind="${group||'data'}.${key}" value="${value}" ${attrs||''}>`,select:(label,key,value,options,group)=>`<select aria-label="${label}" data-bind="${group||'settings'}.${key}">${options.map(([v,text])=>`<option value="${v}">${text}</option>`).join('')}</select>`,check:(label,key,value,group)=>`<input aria-label="${label}" data-bind="${group||'settings'}.${key}" type="checkbox">`,btn:(label,action,attrs)=>`<button data-action="${action}" ${attrs||''}>${label}</button>`};
test('CD panels expose their own print controls and the complete track list without cassette side actions',()=>{
 const p=createProject();
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const html=cdLayoutPanel(p,mode,controls);assert.match(html,/cd-standard/);assert.match(html,/cd-reset-blocks/);assert.doesNotMatch(html,/layout\.holeW|layout\.labelW|Синхронизировать/);
  assert.match(cdTextPanel(p,mode,modeDefaultSurface(mode),controls),/cd-focus-text/);
 }
 const tracks=cdTracksPanel(p,controls);assert.equal((tracks.match(/data-track="/g)||[]).length,9);assert.match(tracks,/cd-m3u/);assert.doesNotMatch(tracks,/data-action="(?:balance|swap|track-move)"/);
});

test('CD text tools group title, contents and extra text while retaining every text field',()=>{
 const p=createProject();
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const html=cdTextPanel(p,mode,modeDefaultSurface(mode),controls);
  for(const field of ['artist','album','lyrics','production','note'])assert.equal((html.match(new RegExp(`data-bind="data\\.${field}"`,'g'))||[]).length,1);
  assert.match(html,/<legend>Название<\/legend>/);assert.match(html,/<legend>Дополнительный текст<\/legend>/);
  if(mode==='cd-insert')assert.equal((html.match(/data-source="(?:cdTracks|lyrics|production)"/g)||[]).length,1);
 }
});

test('content columns are disabled only for a single sided one panel CD cover',()=>{
 const p=createProject();p.layout.cdInsertPanels=1;p.layout.cdInsertDouble=false;
 assert.match(cdLayoutPanel(p,'cd-insert',controls),/<fieldset[^>]*disabled><legend>Содержание вкладыша/);
 p.layout.cdInsertDouble=true;assert.doesNotMatch(cdLayoutPanel(p,'cd-insert',controls),/<fieldset[^>]*disabled/);
 p.layout.cdInsertDouble=false;p.layout.cdInsertPanels=2;assert.doesNotMatch(cdLayoutPanel(p,'cd-insert',controls),/<fieldset[^>]*disabled/);
});

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const action=app.slice(app.indexOf('function cdAction('),app.indexOf('\nfunction uiAction('));
function harness(mode='cd-insert'){
 const initial=createProject();initial.editorMode=mode;const calls={history:[],saved:[],full:0,toasts:[],m3u:[]},inputs={cdBulk:{value:'New track (3:45)'},modal:{close(){}}};
 return new Function('initial','initialMode','calls','inputs','clone','cdTracks','replaceCDTracks','moveCDTrack','deleteCDTrack','addCDTrack','parseTracks','serializeTracks','esc','CD_DEFAULTS','resetCDSurfaces','updateCDLayout','updateCDTrackLayout','rebuildReferenceCDContents','modeDefaultSurface','dimensions',`
  let p=initial,mode=initialMode,surface=modeDefaultSurface(mode),selected='';const layers=()=>p.surfaces[surface],$=name=>inputs[name],btn=()=>'',modal=()=>{},add=()=>{};
  const checkpoint=()=>calls.history.push(clone(p)),changed=()=>calls.saved.push(clone(p)),full=()=>calls.full++,draw=()=>{},renderInspector=()=>{},toast=message=>calls.toasts.push(message),beginM3UUpload=side=>calls.m3u.push(side);
  ${action}
  return {run:cdAction,state:()=>({p,mode,surface,selected}),calls};
 `)(initial,mode,calls,inputs,clone,cdTracks,replaceCDTracks,moveCDTrack,deleteCDTrack,addCDTrack,parseTracks,serializeTracks,esc,CD_DEFAULTS,resetCDSurfaces,updateCDLayout,updateCDTrackLayout,rebuildReferenceCDContents,modeDefaultSurface,dimensions);
}
test('actual CD actions use one undo step, import M3U to CD and enable hidden front titles',()=>{
 const h=harness(),p=h.state().p,first=p.surfaces.cdFront.find(layer=>layer.source==='artist');assert.equal(first.visible,false);
 h.run('cd-focus-text',{dataset:{source:'artist'}});assert.equal(first.visible,true);assert.equal(h.state().selected,first.id);assert.equal(h.calls.history.length,1);
 h.run('cd-m3u');assert.deepEqual(h.calls.m3u,['cd']);
 h.run('cd-apply-bulk');assert.equal(cdTracks(p).length,1);assert.equal(p.data.A[0].seconds,225);assert.equal(h.calls.history.length,2);
});
test('the actual standard-size command restores each CD geometry and preserves manual locked layers',()=>{
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const h=harness(mode),p=h.state().p,target=modeDefaultSurface(mode),locked=p.surfaces[target][0];locked.locked=true;locked.x+=3;const before=clone(locked);
  p.layout.cdLabelDiameter=110;p.layout.cdInsertPanels=3;p.layout.cdTrayWidth=160;h.run('cd-standard');
  assert.equal(h.calls.history.length,1);assert.equal(h.calls.saved.length,1);assert.equal(h.state().surface,target);assert.deepEqual(p.surfaces[target].find(layer=>layer.id===locked.id),before);
  assert.equal(mode==='cd-label'?p.layout.cdLabelDiameter:mode==='cd-insert'?p.layout.cdInsertPanels:p.layout.cdTrayWidth,mode==='cd-label'?CD_DEFAULTS.cdLabelDiameter:mode==='cd-insert'?2:CD_DEFAULTS.cdTrayWidth);
 }
});
test('CD content focus selects the existing flow and never creates a duplicate list',()=>{
 const h=harness(),p=h.state().p,body=p.surfaces.cdFront.find(layer=>layer.cdContentFlow),before=p.surfaces.cdFront.length;
 assert.ok(body);h.run('cd-focus-text',{dataset:{source:'cdTracks'},textContent:'Треки CD'});assert.equal(h.state().selected,body.id);assert.equal(p.surfaces.cdFront.length,before);assert.equal(h.calls.history.length,0);
});
test('actual CD layout controls change columns and track placement without modifying cassette layers',()=>{
 const layoutCallback=app.slice(app.indexOf("if(el.dataset.bind?.startsWith('layout.cd')"),app.indexOf("\nif(el.dataset.bind==='layout.printArea')"));
 for(const [mode,key,value]of [['cd-insert','columns','2'],['cd-label','cdTrackLayout','circular'],['cd-label','cdLabelHub','1']]){
  const p=createProject();p.editorMode=mode;const old=clone(p.surfaces.outer),calls={history:0,full:0,saved:0};
  const tracks=p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');tracks.x+=5;
  new Function('p','mode','el','calls','clone','clamp','isCDMode','updateCDLayout','updateCDTrackLayout','rebuildReferenceCDContents','modeDefaultSurface',`
   let surface=modeDefaultSurface(mode),selected='';const checkpoint=()=>calls.history++,full=()=>calls.full++,changed=()=>calls.saved++;
   ${layoutCallback}
  `)(p,mode,{dataset:{bind:'layout.'+key},type:'select-one',value,tagName:'SELECT'},calls,clone,clamp,isCDMode,updateCDLayout,updateCDTrackLayout,rebuildReferenceCDContents,modeDefaultSurface);
  assert.deepEqual(p.surfaces.outer,old);assert.deepEqual(calls,{history:1,full:1,saved:1});
  if(key==='columns'){assert.equal(p.layout.columns,2);assert.equal(p.surfaces.cdFront.filter(layer=>layer.cdContentFlow).length,2)}
  else if(key==='cdTrackLayout'){assert.equal(p.layout.cdTrackLayout,'circular');assert.equal(tracks.cdArc,true);assert.equal(tracks.x,0)}
  else assert.equal(p.layout.cdLabelHub,true);
 }
});
test('the shared reset command preserves artwork and reference archives belonging to another format',()=>{
 const resetCase=app.slice(app.indexOf("case 'reset-layout':"),app.indexOf("case 'blank':",app.indexOf("case 'reset-layout':")));
 for(const mode of ['jcard','label','cd-label','cd-insert','cd-tray']){
  const p=createProject();p.editorMode=mode;p.referenceCDContentTemplate={source:'cdContents',sentinel:'CD archive'};p.referenceFlowArchive={sentinel:'Cassette archive'};
  p.referenceFlowTemplate={sentinel:'Cassette template'};p.layout.referenceTemplate=true;p.referenceFreePlace={mode:isCDMode(mode)?'jcard':'cd-insert',sentinel:'Other format'};
  const other=isCDMode(mode)?['outer','inner','labelA','labelB']:['cdLabel','cdFront','cdInside','cdTray','cdTrayInside'],before=Object.fromEntries(other.map(surface=>[surface,clone(p.surfaces[surface])])),calls={history:0,saved:0};
  new Function('p','mode','calls','isCDMode','resetCDSurfaces','resetSurfaces',`let selected='';const checkpoint=()=>calls.history++,changed=()=>calls.saved++,toast=()=>{};switch('reset-layout'){${resetCase}}`)(p,mode,calls,isCDMode,resetCDSurfaces,resetSurfaces);
  for(const surface of other)assert.deepEqual(p.surfaces[surface],before[surface]);assert.deepEqual(p.referenceFreePlace,{mode:isCDMode(mode)?'jcard':'cd-insert',sentinel:'Other format'});assert.deepEqual(calls,{history:1,saved:1});
  if(isCDMode(mode)){assert.deepEqual(p.referenceFlowArchive,{sentinel:'Cassette archive'});assert.deepEqual(p.referenceFlowTemplate,{sentinel:'Cassette template'});assert.equal(p.layout.referenceTemplate,true)}else assert.deepEqual(p.referenceCDContentTemplate,{source:'cdContents',sentinel:'CD archive'});
 }
});
test('CD preview and Remix use the selected CD geometry and preserve cassette families',()=>{
 const p=createProject(),old=clone(p.surfaces.outer);
 for(const mode of ['cd-label','cd-insert','cd-tray']){
  const geometry=previewGeometry(p,mode);assert.ok(geometry.width>0&&geometry.height>0);assert.ok(geometry.depth>0);
  if(geometry.faces){for(const face of [geometry.faces.front,geometry.faces.back]){const crop=previewCrop({width:1000,height:800},face);assert.ok(crop.sourceX>=0&&crop.sourceX+crop.sourceWidth<=1000+.001)}}
  for(const surface of modeSurfaces(p,mode)){const remix=remixGeometry(p,surface);assert.equal(remix.width,dimensions(p,surface).w);assert.ok(remix.outline.startsWith('M'))}
 }
 assert.deepEqual(p.surfaces.outer,old);
});

test('the actual refresh restores a saved CD format and offers only its valid printed sides',()=>{
 const refresh=app.slice(app.indexOf('function full(){'),app.indexOf('\nfunction layerList()'));
 for(const [mode,side]of [['cd-label','cdLabel'],['cd-insert','cdFront'],['cd-tray','cdTray']]){
  const p=createProject();p.editorMode=mode;p.layout.cdInsertDouble=true;p.layout.cdTrayDouble=true;
  const inputs={},classes=[],nodes=[{dataset:{mode},classList:{toggle:()=>{}}}],document={body:{classList:{toggle:(name,value)=>classes.push([name,value])}},querySelectorAll:selector=>selector==='[data-mode]'?nodes:[]};
  const $=name=>inputs[name]||=(name==='importTarget'?{options:[{textContent:''}],value:'A'}:{});
  const state=new Function('project','$','document','normalizeEditorMode','isCDMode','modeSurfaces','modeDefaultSurface','modeTitle',`
   let p=project,mode='jcard',surface='outer',bothView=false,tab='tracks',cropEditing=true;const syncToolNavigation=()=>{},draw=()=>{},renderPanel=()=>{},renderInspector=()=>{};
   ${refresh}
   full();return {mode,surface,bothView};
  `)(p,$,document,normalizeEditorMode,isCDMode,modeSurfaces,modeDefaultSurface,modeTitle);
  assert.equal(state.mode,mode);assert.equal(state.surface,side);assert.equal(inputs.importTarget.disabled,true);assert.equal(inputs.importTarget.value,'both');
  assert.match(inputs.surfaces.innerHTML,new RegExp(`data-surface="${side}"`));assert.doesNotMatch(inputs.surfaces.innerHTML,/data-surface="(?:outer|labelA)"/);
  assert.ok(classes.some(([name,value])=>name==='cd-mode'&&value));
 }
});
