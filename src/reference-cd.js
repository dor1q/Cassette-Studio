import {makeLayer,dimensions,panelRects,clamp,clone,uid} from './model.js';
import {resetCDSurfaces,updateCDTrackLayout,cdReferenceTrayTrackFrame} from './cd-layout.js';
import {REFERENCE_UNIT,referenceFont,referenceFlags} from './reference-format.js';
import {referenceCDTrayFontStyle} from './cd-tray-font.js';

const POINT=25.4/72;
const number=(value,fallback,min,max)=>value!==null&&value!==''&&Number.isFinite(Number(value))?clamp(Number(value),min,max):fallback;
export function decodeReferenceCD(params,mode){
 const requested=params.get('mode'),insert=/^[sd][123]$/.test(requested||'')?requested:'s2';
 const [opacity,blur,scale]=String(params.get('tp')||'').split('_');
 return {cdLabelDiameter:118.745,cdLabelHole:36.9,cdLabelHub:params.get('dh')==='1',
  cdTrackLayout:({0:'bottom',1:'right',2:'circular'})[params.get('tl')]||(params.has('id')||params.has('musicId')?'bottom':'circular'),
  cdInsertPanels:Number(insert.slice(1)),cdInsertHeight:2850*REFERENCE_UNIT,cdInsertDouble:insert.startsWith('d'),
  cdTrayWidth:3564*REFERENCE_UNIT,cdTrayHeight:2787*REFERENCE_UNIT,cdSpine:160*REFERENCE_UNIT,
  cdTrayLeftSpine:true,cdTrayRightSpine:true,cdTrayDouble:params.get('ds')==='1',
  cdTrayPosterOpacity:number(opacity,20,0,100),cdTrayPosterBlur:number(blur,60,0,200),cdTrayPosterScale:number(scale,1.1,.3,5),
  columns:mode==='cd-insert'&&insert==='s1'?1:params.get('dc')==='1'||params.get('dc')==='2'?2:1,
  columnHeight:number(params.get('ch'),100,20,100),spineTwoLines:params.get('s2l')==='1'};
}
const text=(project,source,name,frame,style,more={})=>makeLayer('text',{source,name,referenceCDStandard:true,...frame,...style,color:project.settings.fg,autoFit:false,lineHeight:1.4,...more});
function colorProps(project,key){const color=project.settings.referenceSectionColors?.[key];return {color:color||project.settings.fg,referenceOwnColor:!!color}}
const contentFrameKeys=['x','y','w','h','rotation'];
const frameSnapshot=layer=>Object.fromEntries(contentFrameKeys.map(key=>[key,layer[key]||0]));
function contentFrames(project,{includeInside=project.layout.cdInsertDouble}={}){
 const frames=[],pad=96*REFERENCE_UNIT,gap=48*REFERENCE_UNIT,columns=project.layout.columns===2?2:1;
 for(const surface of ['cdFront',...(includeInside?['cdInside']:[])])for(const panel of panelRects(project,surface).filter(panel=>surface!=='cdFront'||panel.index!==2)){
  const {h}=dimensions(project,surface),width=(panel.w-2*pad-(columns-1)*gap)/columns;
  for(let column=0;column<columns;column++)frames.push({surface,cdPanelIndex:panel.index,cdColumnIndex:column,x:panel.x+pad+column*(width+gap),y:pad,w:width,h:(h-2*pad)*project.layout.columnHeight/100,rotation:0});
 }
 return frames;
}
export function rebuildReferenceCDContents(project){
 if(project.editorMode!=='cd-insert')return {updated:0,created:0,removed:0,preserved:0};
 const old=['cdFront','cdInside'].flatMap(surface=>(project.surfaces[surface]||[]).filter(layer=>layer.referenceCDContent&&!layer.referenceBlockCopy).map(layer=>({surface,layer}))),template=old[0]?.layer||project.referenceCDContentTemplate;
 if(!template||template.type!=='text'||template.source!=='cdContents')return {updated:0,created:0,removed:0,preserved:0};
 const key=(surface,layer)=>[surface,layer.cdPanelIndex,layer.cdColumnIndex||0].join(':'),oldByKey=new Map(old.map(item=>[key(item.surface,item.layer),item])),used=new Set(),fresh={cdFront:[],cdInside:[]},result={updated:0,created:0,removed:0,preserved:0};
 const untouched=layer=>!layer.locked&&layer.referenceCDContentFrame&&contentFrameKeys.every(field=>Math.abs((layer[field]||0)-(layer.referenceCDContentFrame[field]||0))<.0001);
 const includeInside=project.layout.cdInsertDouble||old.some(item=>item.surface==='cdInside');
 for(const [index,frame]of contentFrames(project,{includeInside}).entries()){
  const {surface,...geometry}=frame,existing=oldByKey.get(key(surface,frame)),layer=existing?.layer||{...clone(template),id:uid(),locked:false};
  used.add(existing?.layer);
  if(existing&&!untouched(layer))result.preserved++;else{Object.assign(layer,geometry);layer.referenceCDContentFrame=frameSnapshot(layer);layer.cdContentIndex=index;existing?result.updated++:result.created++}
  if(!existing)layer.name='Содержание CD · блок '+(index+1);fresh[surface].push(layer);
 }
 for(const {surface,layer}of old)if(!used.has(layer)){fresh[surface].push(layer);result.preserved++}
 for(const surface of ['cdFront','cdInside']){
  const layers=project.surfaces[surface]||[],at=layers.findIndex(layer=>layer.referenceCDContent&&!layer.referenceBlockCopy),rest=layers.filter(layer=>!layer.referenceCDContent||layer.referenceBlockCopy);rest.splice(at<0?rest.length:Math.min(at,rest.length),0,...fresh[surface]);project.surfaces[surface]=rest;
 }
 return result;
}
export function importReferenceCD(project,params,mode){
 project.editorMode=mode;Object.assign(project.layout,decodeReferenceCD(params,mode));resetCDSurfaces(project,mode);
 const hidden=referenceFlags(params.get(mode==='cd-label'||mode==='cd-tray'?'cdh':'jh'));
 if(mode==='cd-label'){
  project.data.production=params.get('musicPL')??params.get('musicProd')??'';
  const {w,h}=dimensions(project,'cdLabel'),artist=referenceFont(params.get('fb'),14*POINT,POINT,{font:'Arial',weight:700}),album=referenceFont(params.get('f3')||params.get('fb'),9*POINT,POINT,{font:'Arial',weight:600,italic:true}),trackSize=project.layout.cdTrackLayout==='bottom'?6:5,tracks=referenceFont(params.get('f2'),trackSize*POINT,POINT,{font:'Arial',weight:400});
  const baseline=(source,name,y,style,visible,key)=>text(project,source,name,{x:w*.1,y:y*POINT-style.size*.9,w:w*.8,h:style.size*1.4},style,{align:'center',visible,...colorProps(project,key)});
  project.surfaces.cdLabel=[baseline('artist','Исполнитель',60.304,artist,!(hidden&1),'back'),baseline('album','Альбом',77.304,album,!(hidden&2),'album'),baseline('production','Выходные данные',91.304,referenceFont(params.get('fb'),6*POINT,POINT,{font:'Arial',weight:700}),!(hidden&8),'back'),
   text(project,'cdTracks','Треки CD',{x:0,y:0,w,h},tracks,{visible:!(hidden&4),trackOptions:{inlineTracks:true,showSide:false},...colorProps(project,'spine')})];
  updateCDTrackLayout(project);
  const track=project.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');
  if(project.layout.cdTrackLayout==='circular')track.cdArcRadius=150.916*POINT;
  if(project.layout.cdTrackLayout==='right')Object.assign(track,{x:238.22*POINT,y:h/2-7*POINT*Math.min(18,project.data.A.length+project.data.B.length)/2,w:90*POINT,h:126*POINT,maxTracks:18,trackOptions:{inlineTracks:false,showSide:false}});
  return project;
 }
 const surface=mode==='cd-tray'?'cdTray':'cdFront',styles=mode==='cd-tray'?{content:referenceCDTrayFontStyle(params,project.data),spine:referenceFont(params.get('f2'),56*REFERENCE_UNIT,REFERENCE_UNIT,{font:'Nunito Sans',weight:500})}:{content:referenceFont(params.get('fi'),48*REFERENCE_UNIT,REFERENCE_UNIT,{font:'Futura',weight:700})};
 if(mode==='cd-tray'){
  for(const layer of project.surfaces.cdTray){
   layer.referenceCDStandard=true;
   if(layer.source==='cdSpine')Object.assign(layer,styles.spine,colorProps(project,'spine'),{literalText:true,referenceBlockKey:layer.name==='Левый корешок'?'spineText1':'spineText2',hideArtist:!!(hidden&1),hideAlbum:!!(hidden&2),spineTwoLines:project.layout.spineTwoLines,visible:!(hidden&1&&hidden&2)});
   else if(layer.source==='cdTracks'){
    Object.assign(layer,styles.content,colorProps(project,'back'),{visible:true,autoFit:false,align:'left',lineHeight:1.5,referenceCDTrayTrack:true,trackOptions:{inlineTracks:false,showSide:false,showProduction:true,hideTracks:!!(hidden&4)}});
    Object.assign(layer,cdReferenceTrayTrackFrame(project,'cdTray',layer));layer.referenceCDTrayTrackFrame=frameSnapshot(layer);
   }
   else if(layer.source==='artist'||layer.source==='album')Object.assign(layer,styles.content,colorProps(project,layer.source==='artist'?'back':'album'),{visible:false,size:styles.content.size*(layer.source==='artist'?1.4:1.1)});
   else if(layer.source==='note')layer.visible=false;
  }
  for(const layer of project.surfaces.cdTray.filter(layer=>layer.source==='cdSpine'))if(params.has('f3')){layer.albumStyle={...referenceFont(params.get('f3'),56*REFERENCE_UNIT,REFERENCE_UNIT,{font:'Nunito Sans',weight:500}),...colorProps(project,'album')};layer.referenceAlbumOwnColor=!!project.settings.referenceSectionColors?.album}
  const inside=panelRects(project,'cdTrayInside').find(panel=>panel.index===2),pad=120*REFERENCE_UNIT;
  project.surfaces.cdTrayInside=project.layout.cdTrayDouble?[text(project,'production','Выходные данные внутри CD',{
   cdPanelIndex:2,x:inside.x+pad,y:pad,w:inside.w-2*pad,h:dimensions(project,'cdTrayInside').h-2*pad
  },{font:'Arial',size:60*REFERENCE_UNIT,fontWeight:400},{literalText:true,cdTrayInsideProduction:true,align:'center',opacity:.5,...colorProps(project,'back')})]:[];
  return project;
 }
 project.surfaces.cdFront=[];project.surfaces.cdInside=[];
 project.referenceCDContentTemplate=text(project,'cdContents','Содержание CD',{x:0,y:0,w:1,h:1},styles.content,{...colorProps(project,'inside'),hideArtist:!!(hidden&1),hideAlbum:!!(hidden&2),hideA:!!(hidden&4),hideB:!!(hidden&8),referenceCDContent:true,trackOptions:{inlineTracks:false,showSide:false,showProduction:true}});
 for(const [index,item]of contentFrames(project).entries()){
  const {surface:current,...frame}=item,layer=text(project,'cdContents','Содержание CD · блок '+(index+1),frame,styles.content,{...colorProps(project,'inside'),hideArtist:!!(hidden&1),hideAlbum:!!(hidden&2),hideA:!!(hidden&4),hideB:!!(hidden&8),referenceCDContent:true,cdContentIndex:index,trackOptions:{inlineTracks:false,showSide:false,showProduction:true}});
  layer.referenceCDContentFrame=frameSnapshot(layer);project.surfaces[current].push(layer);
 }
 return project;
}
