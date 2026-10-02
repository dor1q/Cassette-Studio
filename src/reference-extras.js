import {clone,uid,makeLayer,dimensions,referencePosition} from './model.js';
import {referencePlacement,referenceSurface,REFERENCE_UNIT} from './reference-format.js';
import {remix} from './decal-picker.js';
export function spotifyCodeUrl(params){
 const id=params.get('id')||'',link=params.get('playlistUrl')||'';
 let match=/^sa\.([A-Za-z0-9]{22})$/.exec(id),type='album',value=match?.[1];
 if(!value){match=link.match(/open\.spotify\.com\/(album|playlist)\/([A-Za-z0-9]{22})(?:[/?#]|$)/);type=match?.[1];value=match?.[2]}
 return value?`https://scannables.scdn.co/uri/plain/png/000000/white/640/spotify:${type}:${value}`:null;
}
export function parseReferenceOverlays(raw,mode='jcard'){
 const entries=String(raw||'').split('|').slice(0,12),used=new Set();return entries.map(part=>{
  const [index,blend,opacity,seed]=part.split('.');
  const id=mode==='jcard'&&index==='1'?'wild-america':index==='a1'?'wild-america-remix':index==='c'?'custom':null;
  if(!id||used.has(id))return null;used.add(id);
  return {id,opacity:Number.isFinite(parseInt(opacity))?Math.max(0,Math.min(100,parseInt(opacity)))/100:.7,blendMode:blend==='2'?'hard-light':'screen',seed:parseInt(seed||'1',36)||1};
 }).filter(Boolean);
}
export async function restoreReferenceExtras(project,params,request,mode='jcard',cached=[]){
 let restored=0,missing=0;const surfaces=mode==='label'?['labelA','labelB']:project.layout.double?['outer','inner']:['outer'];
 const overlays=parseReferenceOverlays(params.get('ol'),mode);
 for(const overlay of overlays){
  const key='overlay:'+overlay.id+':'+(overlay.id==='custom'?params.get('col')||'':overlay.seed);
  let src=cached.find(l=>l.referenceAssetKey===key&&l.src)?.src;
  try{
   if(!src){const result=await request(overlay.id==='custom'?'/api/image?url='+encodeURIComponent(params.get('col')||''):'/api/decal?'+new URLSearchParams({category:'overlays',id:overlay.id}));src=result.src;if(result.parts)src=await remix(result.parts,dimensions(project,surfaces[0]).w/dimensions(project,surfaces[0]).h,overlay.seed)}
   if(!src)throw Error('Нет изображения');
   for(const surface of surfaces){const d=dimensions(project,surface),list=project.surfaces[surface],at=list.findIndex(l=>l.referenceDecalLayer==='over'||['referenceText','referenceCode'].includes(l.category));list.splice(at<0?list.length:at,0,makeLayer('image',{name:'Наложение из ссылки',category:'overlay',referenceAssetKey:key,referenceSeed:overlay.seed,src,x:0,y:0,w:d.w,h:d.h,fit:'stretch',opacity:overlay.opacity,blendMode:overlay.blendMode}))}
   restored++;
  }catch{missing++}
 }
 const code=spotifyCodeUrl(params),placements=String(params.get('sc')||'').split('|').map(referencePlacement).filter(Boolean);
 if(code&&placements.length){
  let src=cached.find(l=>l.referenceAssetKey===code&&l.src)?.src;
  try{src||=(await request('/api/image?url='+encodeURIComponent(code))).src;if(!src)throw Error('Нет кода');
   for(const t of placements){const surface=referenceSurface(project,mode,t.side),unit=mode==='label'?.13*project.layout.labelW/251.16:REFERENCE_UNIT,w=280*unit*t.scale/100,h=70*unit*t.scale/100,layer=makeLayer('image',{name:'Spotify Code',category:'spotifyCode',referenceAssetKey:code,src,...referencePosition(project,t.x,t.y,w,h,t.rotation,surface),w,h,rotation:t.rotation,fit:'stretch'});project.surfaces[surface].push(layer);if(mode==='label'&&project.layout.sync)project.surfaces[surface==='labelA'?'labelB':'labelA'].push({...clone(layer),id:uid()})}
   restored+=placements.length;
  }catch{missing+=placements.length}
 }
 return {restored,missing};
}
