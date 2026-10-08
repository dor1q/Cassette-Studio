import {makeLayer,clone} from './model.js';
import {isCDMode,modeSurfaces} from './media-formats.js';
import {autoPaintColor} from './color-paint.js';

const UNIT=25.4/600;
export const CD_DEFAULTS={cdLabelDiameter:118.745,cdLabelHole:36.9,cdLabelHub:false,cdInsertPanels:2,cdInsertHeight:2850*UNIT,cdInsertDouble:false,cdTrayDouble:false,cdTrayWidth:3564*UNIT,cdTrayHeight:2787*UNIT,cdSpine:160*UNIT,cdTrayLeftSpine:true,cdTrayRightSpine:true,cdTrackLayout:'bottom'};
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const layout=project=>({...CD_DEFAULTS,...project.layout});
export function cdLabelGeometry(project){
 const l=layout(project),outerDiameter=l.cdLabelDiameter,frame=outerDiameter+1.355667,holeDiameter=l.cdLabelHub?14.957778:l.cdLabelHole;
 return {frame,center:frame/2,outerDiameter,holeDiameter:Math.max(0,Math.min(outerDiameter-1,holeDiameter)),safeOuterDiameter:Math.max(1,outerDiameter-3.104444),safeHoleDiameter:l.cdLabelHub?20.955:holeDiameter+5.997778};
}
export function cdDimensions(project,surface){
 const l=layout(project);
 if(surface==='cdLabel'){const {frame}=cdLabelGeometry(project);return {w:frame,h:frame}}
 if(surface.startsWith('cdTray'))return {w:l.cdTrayWidth-(l.cdTrayLeftSpine===false?l.cdSpine:0)-(l.cdTrayRightSpine===false?l.cdSpine:0),h:l.cdTrayHeight};
 const panels=Math.max(1,Math.min(3,Math.round(finite(l.cdInsertPanels,1)))),width=[2850,5700,8476][panels-1]*UNIT;
 return {w:width,h:l.cdInsertHeight};
}
export function cdPanelRects(project,surface){
 const l=layout(project),{w}=cdDimensions(project,surface);
 if(surface==='cdLabel')return [];
 if(surface.startsWith('cdTray')){
  const panels=[];let x=0;
  if(l.cdTrayLeftSpine!==false){panels.push({x,w:l.cdSpine,index:0,name:'Левый корешок'});x+=l.cdSpine}
  const body=l.cdTrayWidth-2*l.cdSpine;panels.push({x,w:body,index:2,name:'Задняя обложка'});x+=body;
  if(l.cdTrayRightSpine!==false)panels.push({x,w:l.cdSpine,index:1,name:'Правый корешок'});
  return surface==='cdTrayInside'?panels.map(panel=>({...panel,x:w-panel.x-panel.w})).reverse():panels;
 }
 const count=Math.max(1,Math.min(3,Math.round(finite(l.cdInsertPanels,1))));let x=0;
 const panels=Array.from({length:count},(_,index)=>{const width=count===3&&index===0?2776*UNIT:2850*UNIT,identity=count+1-index,panel={x,w:width,index:identity,name:identity===2?'Обложка':identity===3?'Задняя обложка':'Внутренняя панель'};x+=width;return panel});
 return surface==='cdInside'?panels.map(panel=>({...panel,x:w-panel.x-panel.w})).reverse():panels;
}
const circle=(cx,cy,r)=>`M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0Z`;
export function cdShapePath(project,surface,bleed=0){
 const {w,h}=cdDimensions(project,surface);
 if(surface==='cdLabel'){const geometry=cdLabelGeometry(project);return circle(geometry.center,geometry.center,geometry.outerDiameter/2+bleed)}
 return `M${-bleed} ${-bleed}H${w+bleed}V${h+bleed}H${-bleed}Z`;
}
export function cdCutPath(project,surface,bleed=0){
 const outer=cdShapePath(project,surface,bleed);if(surface!=='cdLabel')return outer;
 const geometry=cdLabelGeometry(project),hole=Math.max(0,geometry.holeDiameter/2-bleed);
 return outer+(hole?circle(geometry.center,geometry.center,hole):'');
}
export function cdPrintReadyCutPath(project){
 const {center,safeOuterDiameter,safeHoleDiameter}=cdLabelGeometry(project);
 if(safeHoleDiameter>=safeOuterDiameter)return '';
 return circle(center,center,safeOuterDiameter/2)+(safeHoleDiameter>0?circle(center,center,safeHoleDiameter/2):'');
}
export function cdLabelGuides(project){
 const geometry=cdLabelGeometry(project),{center}=geometry;
 return [geometry.holeDiameter,geometry.safeOuterDiameter,geometry.safeHoleDiameter].map(diameter=>`<circle cx="${center}" cy="${center}" r="${diameter/2}" fill="none" stroke="#999" stroke-width=".15" stroke-dasharray="1 1"/>`).join('');
}
function text(project,source,props={}){return makeLayer('text',{source,cdTemplate:true,name:{artist:'Исполнитель',album:'Альбом',note:'Подпись',cdTracks:'Треки CD',cdContents:'Содержание CD',cdSpine:'Корешок CD',lyrics:'Тексты песен',production:'Выходные данные'}[source]||source,color:project.settings.fg,size:3,...props})}
function insertContents(project,surface,panels,height){
 const frontCount=Math.max(0,Math.round(project.layout.cdInsertPanels||2)-1),columns=project.layout.columns===2?2:1,columnHeight=Math.max(.2,Math.min(1,(Number(project.layout.columnHeight)||100)/100));
 return panels.flatMap((panel,index)=>Array.from({length:columns},(_,column)=>{const width=(panel.w-14-4*(columns-1))/columns;return text(project,'cdContents',{name:'Содержание CD · '+panel.name+(columns===2?' · колонка '+(column+1):''),cdPanelIndex:panel.index,cdColumnIndex:column,cdContentFlow:true,cdContentIndex:((surface==='cdInside'?frontCount:0)+index)*columns+column,x:panel.x+7+column*(width+4),y:7,w:width,h:(height-14)*columnHeight,size:3,autoFit:false,lineHeight:1.4,trackOptions:{showSide:false,showProduction:true}})}));
}
function trayTracks(project,panel,height){
 const columns=project.layout.columns===2?2:1,gap=4,width=(panel.w-14-gap*(columns-1))/columns,columnHeight=Math.max(.2,Math.min(1,(Number(project.layout.columnHeight)||100)/100));
 return Array.from({length:columns},(_,column)=>text(project,'cdTracks',{name:'Треки CD'+(columns===2?' · колонка '+(column+1):''),cdPanelIndex:2,cdColumnIndex:column,cdTrayTrackFlow:true,x:panel.x+7+column*(width+gap),y:36,w:width,h:(height-56)*columnHeight,size:3,lineHeight:1.4}));
}
export function cdTrayTrackActive(project,layer,surface){
 return !surface.startsWith('cdTray')||layer.source!=='cdTracks'||!layer.cdTemplate&&!layer.cdTrayTrackFlow||(layer.cdColumnIndex||0)<(project.layout.columns===2?2:1);
}
export function makeCDProductionLayer(project){
 const {w}=cdDimensions(project,'cdLabel'),point=25.4/72,size=6*point;
 return text(project,'production',{x:w*.1,y:91.304*point-size*.9,w:w*.8,h:size*1.4,size,align:'center'});
}
export function updateCDTrackLayout(project){
 const layer=project.surfaces.cdLabel?.find(layer=>layer.source==='cdTracks'&&!layer.locked);if(!layer)return;
 const geometry=cdLabelGeometry(project),d=geometry.frame,kind=project.layout.cdTrackLayout||'bottom';
 Object.assign(layer,kind==='right'?{x:d*.69,y:d*.29,w:d*.22,h:d*.45,align:'left',cdArc:false}:kind==='circular'?{x:0,y:0,w:d,h:d,align:'left',cdArc:true,cdArcRadius:geometry.outerDiameter*.44836}:{x:d*.2,y:d*.72,w:d*.6,h:d*.19,align:'center',cdArc:false});
 if(kind==='right')layer.maxTracks=18;else delete layer.maxTracks;
 layer.trackOptions={...layer.trackOptions,inlineTracks:kind!=='right',showSide:false};
}
export function resetCDSurfaces(project,mode,{preserveReference=false}={}){
 const surfaces=isCDMode(mode)?modeSurfaces(project,mode):['cdLabel','cdFront','cdInside','cdTray','cdTrayInside'];
 if(!preserveReference){
  if(surfaces.includes('cdFront'))delete project.referenceCDContentTemplate;
  if(project.referenceFreePlace&&(mode===project.referenceFreePlace.mode||!mode&&isCDMode(project.referenceFreePlace.mode)))delete project.referenceFreePlace;
 }
 for(const surface of surfaces){
  const {w,h}=cdDimensions(project,surface),panels=cdPanelRects(project,surface),front=panels.find(panel=>panel.index===2)||{x:0,w};
  if(surface==='cdLabel')project.surfaces[surface]=[
   text(project,'artist',{x:w*.2,y:h*.14,w:w*.6,h:9,size:14*25.4/72,bold:true,align:'center'}),
   text(project,'album',{x:w*.2,y:(77.304-9*.9)*25.4/72,w:w*.6,h:8,size:9*25.4/72,italic:true,align:'center'}),
   makeCDProductionLayer(project),
   text(project,'cdTracks',{x:w*.2,y:h*.72,w:w*.6,h:h*.19,size:2.2,align:'center',lineHeight:1.3}),
   text(project,'note',{x:w*.3,y:h*.93,w:w*.4,h:4,size:1.8,align:'center'})
  ];
  else if(surface==='cdFront')project.surfaces[surface]=[
   text(project,'artist',{cdPanelIndex:2,x:front.x+7,y:8,w:front.w-14,h:12,size:6,bold:true,visible:false}),
   text(project,'album',{cdPanelIndex:2,x:front.x+7,y:h-25,w:front.w-14,h:16,size:7,visible:false}),
   ...insertContents(project,surface,panels.filter(panel=>panel.index!==2),h)
  ];
  else if(surface==='cdInside')project.surfaces[surface]=insertContents(project,surface,panels,h);
  else project.surfaces[surface]=[
   text(project,'artist',{cdPanelIndex:2,x:front.x+7,y:8,w:front.w-14,h:10,size:5,bold:true}),
   text(project,'album',{cdPanelIndex:2,x:front.x+7,y:21,w:front.w-14,h:10,size:4}),
   ...trayTracks(project,front,h),
   text(project,'note',{cdPanelIndex:2,x:front.x+7,y:h-15,w:front.w-14,h:6,size:2.2}),
   ...panels.filter(panel=>panel.index!==2).map(panel=>text(project,'cdSpine',{referenceSpine:true,cdPanelIndex:panel.index,name:panel.name,x:panel.x+panel.w*.75,y:5,w:h-10,h:panel.w*.55,size:2.6,rotation:90,align:'center'}))
  ];
  if(['cdInside','cdTrayInside'].includes(surface))for(const layer of project.surfaces[surface])layer.color=autoPaintColor(project.settings.bgInside);
 }
 if(surfaces.includes('cdLabel'))updateCDTrackLayout(project);
}
const geometryKeys=['x','y','w','h','rotation'];
const matchesFrame=(layer,frame)=>geometryKeys.every(key=>Math.abs((layer[key]||0)-(frame[key]||0))<.0001);
const templateKey=layer=>JSON.stringify([layer.source,layer.cdPanelIndex??null,layer.flowIndex??null,layer.cdColumnIndex??(layer.source==='cdTracks'&&layer.cdTemplate?0:null)]);
function coverFrame(project,surface){const size=cdDimensions(project,surface),front=cdPanelRects(project,surface).find(panel=>panel.index===2);return {x:front?.x||0,y:0,w:front?.w||size.w,h:size.h}}
function latentSpine(project,surface,index){
 const option=index===0?'cdTrayLeftSpine':'cdTrayRightSpine',shown={...project,layout:{...project.layout,[option]:true},surfaces:{}};resetCDSurfaces(shown,'cd-tray',{preserveReference:true});
 return shown.surfaces[surface].find(layer=>layer.source==='cdSpine'&&layer.cdPanelIndex===index);
}
function latentTrayColumn(project,surface,index){
 const shown={...project,layout:{...project.layout,columns:2}};
 return trayTracks(shown,cdPanelRects(shown,surface).find(panel=>panel.index===2),cdDimensions(shown,surface).h)[index];
}
const trayStyleKeys=['font','fontWeight','fontStretch','size','color','bold','italic','uppercase','smallcaps','align','lineHeight','spacing','outline','outlineColor','shadow','shadowColor','opacity','visible','autoFit','referenceOwnColor','hideA','hideB','hideTracks','showProduction'];
export function updateCDLayout(project,mode,previousLayout){
 if(!isCDMode(mode))return;
 const referenceContents=mode==='cd-insert'&&(project.referenceCDContentTemplate?.source==='cdContents'||['cdFront','cdInside'].some(surface=>project.surfaces[surface]?.some(layer=>layer.referenceCDContent)));
 const contentTemplate=mode==='cd-insert'&&!referenceContents?['cdFront','cdInside'].flatMap(surface=>project.surfaces[surface]||[]).find(layer=>layer.source==='cdContents'&&layer.cdContentFlow):null;
 const old={...project,layout:{...project.layout,...previousLayout},surfaces:{}},fresh={...project,surfaces:{}};
 resetCDSurfaces(old,mode,{preserveReference:true});resetCDSurfaces(fresh,mode,{preserveReference:true});
 for(const surface of modeSurfaces(project,mode)){
  const oldDefaults=new Map(old.surfaces[surface].map(layer=>[templateKey(layer),layer])),newDefaults=new Map(fresh.surfaces[surface].map(layer=>[templateKey(layer),layer])),seen=new Set();
  const oldCover=coverFrame(old,surface),nextCover=coverFrame(project,surface),layers=project.surfaces[surface]||[];
  const trayTemplate=mode==='cd-tray'?layers.find(layer=>layer.type==='text'&&layer.source==='cdTracks'&&(layer.cdTemplate||layer.cdTrayTrackFlow)):null;
  const legacyTray=mode==='cd-tray'?{...old,layout:{...old.layout,columns:1,columnHeight:100}}:null;
  project.surfaces[surface]=layers.filter(layer=>{
   if(layer.type==='image'&&['albumCover','art'].includes(layer.category)&&!layer.locked&&matchesFrame(layer,oldCover))Object.assign(layer,nextCover);
   if(!layer.cdTemplate)return true;
   const key=templateKey(layer);let before=oldDefaults.get(key),after=newDefaults.get(key);seen.add(key);
   if(mode==='cd-tray'&&layer.source==='cdSpine'&&[0,1].includes(layer.cdPanelIndex)){
    before||=latentSpine(old,surface,layer.cdPanelIndex);after||=latentSpine(project,surface,layer.cdPanelIndex);
   }
   if(mode==='cd-tray'&&layer.source==='cdTracks'&&layer.cdColumnIndex===1){
    before||=latentTrayColumn(old,surface,1);after||=latentTrayColumn(project,surface,1);
   }
   const legacyFrame=legacyTray&&layer.source==='cdTracks'&&!layer.cdTrayTrackFlow&&layer.cdColumnIndex===undefined?trayTracks(legacyTray,cdPanelRects(legacyTray,surface).find(panel=>panel.index===2),cdDimensions(legacyTray,surface).h)[0]:null;
   if(layer.locked||!before||!matchesFrame(layer,before)&&!(legacyFrame&&matchesFrame(layer,legacyFrame)))return true;
   if(!after)return false;
   if(layer.align===before.align)layer.align=after.align;
   for(const field of [...geometryKeys,'cdArc','cdArcRadius','cdContentFlow','cdContentIndex','cdTrayTrackFlow','cdColumnIndex'])if(after[field]===undefined)delete layer[field];else layer[field]=after[field];
   return true;
  });
  if(!referenceContents&&(mode!=='cd-tray'||layers.some(layer=>layer.cdTemplate)))for(const [key,layer]of newDefaults)if(!seen.has(key)){
   if(contentTemplate&&layer.source==='cdContents'&&layer.cdContentFlow){
    if(contentTemplate.trackOptions===undefined)delete layer.trackOptions;else layer.trackOptions=clone(contentTemplate.trackOptions);
    for(const option of ['hideArtist','hideAlbum','hideTracks','hideLyrics','hideA','hideB','showProduction'])if(contentTemplate[option]!==undefined)layer[option]=contentTemplate[option];
   }
   if(trayTemplate&&layer.source==='cdTracks'&&layer.cdTrayTrackFlow){
    if(trayTemplate.trackOptions===undefined)delete layer.trackOptions;else layer.trackOptions=clone(trayTemplate.trackOptions);
    for(const option of trayStyleKeys)if(trayTemplate[option]!==undefined)layer[option]=clone(trayTemplate[option]);
   }
   project.surfaces[surface].push(layer);
  }
 }
}
