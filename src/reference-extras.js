import {clone,uid,makeLayer,dimensions,referencePosition} from './model.js';
import {referencePlacement,referenceSurface,REFERENCE_UNIT} from './reference-format.js';
import {prepareRemix,normalizeRemixParts} from './overlay-remix.js';
import {remixGeometry,remixSeed} from './overlay-remix-plan.js';
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
  const numericSeed=parseInt(seed??'1',36);
  return {id,opacity:Number.isFinite(parseInt(opacity))?Math.max(0,Math.min(100,parseInt(opacity)))/100:.7,blendMode:blend==='2'?'hard-light':'screen',seed:Number.isFinite(numericSeed)?remixSeed(numericSeed):1};
 }).filter(Boolean);
}
export async function restoreReferenceExtras(project,params,request,mode='jcard',cached=[],options={}){
 let restored=0,missing=0;const surfaces=mode==='label'?['labelA','labelB']:project.layout.double?['outer','inner']:['outer'];
 const overlays=parseReferenceOverlays(params.get('ol'),mode);
 for(const overlay of overlays){
  const key='overlay:'+overlay.id+':'+(overlay.id==='custom'?params.get('col')||'':overlay.seed);
  const candidates=cached.filter(l=>l.referenceAssetKey===key||l.referenceAssetKey?.startsWith(key+':'));
  let src=candidates.find(l=>l.src&&!l.referenceRemix)?.src;
  try{
   const prepared=[];
   if(overlay.id==='wild-america-remix'&&!src){
    const pool=normalizeRemixParts(candidates.flatMap(layer=>layer.referenceRemix?.parts||[]));
    let metadata=candidates.find(layer=>layer.referenceRemix)?.referenceRemix;
    for(const surface of surfaces){
     const geometry=remixGeometry(project,surface),exact=candidates.find(layer=>layer.src&&layer.referenceRemix?.geometrySignature===geometry.signature&&layer.referenceRemix?.seed===overlay.seed&&layer.referenceRemix?.sourceBlendMode===overlay.blendMode);
     let image;
     if(exact)image={src:exact.src,signature:exact.referenceRemix.signature,kitMetadata:exact.referenceRemix,blendMode:'normal'};
     else image=await (options.prepare||prepareRemix)(project,surface,request,overlay.seed,{cachedParts:[...pool.values()],kitMetadata:metadata,blendMode:overlay.blendMode,renderer:options.renderer});
     for(const [id,part]of normalizeRemixParts(image.kitMetadata?.parts))pool.set(id,part);
     metadata=image.kitMetadata;
     prepared.push({surface,src:image.src,blendMode:'normal',referenceRemix:image.kitMetadata,referenceAssetKey:key+':'+image.signature});
    }
   }else{
    if(!src)src=(await request(overlay.id==='custom'?'/api/image?url='+encodeURIComponent(params.get('col')||''):'/api/decal?'+new URLSearchParams({category:'overlays',id:overlay.id}))).src;
    if(!src)throw Error('Нет изображения');
    for(const surface of surfaces)prepared.push({surface,src,blendMode:overlay.blendMode,referenceAssetKey:key});
   }
   for(const item of prepared){const {surface,...props}=item;if(!props.src)throw Error('Нет изображения');const d=dimensions(project,surface),list=project.surfaces[surface],at=list.findIndex(l=>l.referenceDecalLayer==='over'||['referenceText','referenceCode'].includes(l.category));list.splice(at<0?list.length:at,0,makeLayer('image',{name:'Наложение из ссылки',category:'overlay',referenceSeed:overlay.seed,...props,x:0,y:0,w:d.w,h:d.h,fit:'stretch',opacity:overlay.opacity}))}
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
