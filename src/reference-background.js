import {makeLayer,dimensions,panelRects} from './model.js';
import {embeddedReferenceImage,referenceImageSource,referenceImageDimensions,MAX_REFERENCE_IMAGE_LENGTH} from './reference-image-source.js';
import {REFERENCE_UNIT} from './reference-format.js';

// Public URL values describe image placement, rather than a generated gradient.
export const REFERENCE_BACKGROUND_PATTERNS=Object.freeze([
 '00-brick.jpg','01-marble.jpg','02-marbe-bg-2.avif','03-stars-bg.avif',
 '04-pattern.png','05-marbled-pattern.avif','06-marble-bg.avif','07-matrix.avif',
]);
const fitCodes=Object.freeze({__proto__:null,f:'meet',l:'slice',s:'stretch'}),blendModes=new Set(['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity']);
const finite=(value,fallback)=>Number.isFinite(Number(value))&&value!==''&&value!==null&&value!==undefined?Number(value):fallback;
const bounded=(value,min,max,fallback)=>Math.min(max,Math.max(min,finite(value,fallback)));
const integer=(value,fallback)=>Number.isFinite(parseInt(value,10))?parseInt(value,10):fallback;
const rotation=value=>{let n=finite(value,0)%360;if(n<=-180)n+=360;if(n>180)n-=360;return n};
const color=value=>value==='clear'||value==='transparent'?'transparent':value==='rainbow'?'rainbow':/^#?[a-f0-9]{6}$/i.test(value||'')?'#'+value.replace(/^#/,'').toLowerCase():/^#?[a-f0-9]{3}$/i.test(value||'')?'#'+value.replace(/^#/,'').split('').map(c=>c+c).join('').toLowerCase():null;
const blend=value=>blendModes.has(value)?value:'normal';
const sourceToken=(value,extra=false)=>{
 if(!value)return null;
 if(!extra&&/^c$/i.test(value))return {type:'upload',index:0};
 const match=String(value).match(extra?/^([pct])(.+)$/:/^(t)?(.+)$/i);if(!match)return null;
 const prefix=extra?match[1].toLowerCase():match[1]?'t':'p',token=extra?match[2]:match[2];
 if(prefix==='t'&&!/^\d+$/.test(token))return {type:'provider',token:extra?token.replace(/-/g,'_'):token};
 if(!/^\d+$/.test(token))return null;
 const index=Number(token);if(!Number.isSafeInteger(index)||index<0||index>10000)return null;
 return {type:prefix==='c'?'upload':prefix==='t'?'providerIndex':'pattern',index};
};
export function decodeBackgroundPanelMask(value,count){
 if(!value)return null;if(value==='0')return [];
 if(!/^[a-z0-9]+$/i.test(value))return null;
 const bits=parseInt(value,36);if(!Number.isSafeInteger(bits)||bits<=0||bits>0x3fffffff)return null;
 const selected=Array.from({length:Math.min(30,count)},(_,i)=>i).filter(i=>(bits&(1<<i))!==0);
 return selected.length&&selected.length!==count?selected:null;
}
export function decodeReferenceBackground(params,panelCount=16){
 const raw=String(params.get('bg')||'').slice(0,2000),fields=raw.split('.'),compound=fields.length>1;
 let x=finite(fields[4],50),y=finite(fields[5],50),scale=bounded(integer(fields[6],100),25,400,100);
 if(fields[7]==='3'){x/=10;y/=10}else if(fields[7]!=='2'&&scale>=100&&(x>100||y>100||x<0||y<0)){
  const factor=scale/100;x=50*factor+x*(1-factor);y=50*factor+y*(1-factor);
 }
 let tile=compound?bounded(integer(fields[3],100),0,100,100)>0:false;
 let zoom=tile?bounded(integer(fields[3],100),1,100,100):scale;
 let opacity=compound?bounded(integer(fields[2],100),0,100,100):100;
 let source=compound?sourceToken(fields[1]):null;
 const custom=referenceImageSource(params.get('cb'));
 if(custom)source={type:'custom',value:custom};
 if(!compound){
  if(params.has('bgpattern'))source=sourceToken(params.get('bgpattern'));
  if(params.has('bgtile'))tile=/^(1|true|on|yes)$/i.test(params.get('bgtile'));
  if(params.has('bgzoom'))zoom=bounded(params.get('bgzoom'),1,400,100);
  if(params.has('bgopacity'))opacity=bounded(params.get('bgopacity'),0,100,100);
  else if(custom&&params.has('opacity')){const n=finite(params.get('opacity'),1);opacity=bounded(n<=1?n*100:n,0,100,100)}
 }
 const main={source,color:color(fields[0]),scale:zoom,offset:{x:bounded(x,-1000,1000,50),y:bounded(y,-1000,1000,50)},opacity,fit:fitCodes[params.get('bf')]||null,blendMode:blend(params.get('bm')),blur:bounded(integer(params.get('bb'),0),0,200,0),tile,rotation:rotation(integer(params.get('bgr'),0)),panels:decodeBackgroundPanelMask(params.get('bgp'),panelCount)};
 const uploads=String(params.get('cbl')||'').slice(0,MAX_REFERENCE_IMAGE_LENGTH).split('|').slice(0,30).map(referenceImageSource);
 const extras=String(params.get('bgl')||'').slice(0,50000).split('|').filter(Boolean).slice(0,20).map(raw=>{
  const f=raw.split('_');return {source:sourceToken(f[1],true),panels:decodeBackgroundPanelMask(f[0],panelCount),fit:fitCodes[f[2]]||null,scale:bounded(integer(f[3],100),1,400,100),offset:{x:bounded(integer(f[4],500)/10,-1000,1000,50),y:bounded(integer(f[5],500)/10,-1000,1000,50)},opacity:bounded(integer(f[6],100),0,100,100),blendMode:blend(f[7]),blur:bounded(integer(f[8],0),0,200,0),tile:f[9]==='1',rotation:rotation(integer(f[10],0))};
 });
 return {main,extras,uploads};
}
function providerPath(token){
 if(!/^[a-zA-Z0-9_-]{1,300}$/.test(token||''))return null;
 if(token.startsWith('g_')){const [,id,...size]=token.split('_');return id&&/^[a-zA-Z0-9]+$/.test(id)?`https://images.igdb.com/igdb/image/upload/t_${size.join('_')||'original'}/${id}.jpg`:null}
 if(token.startsWith('s_')){const [,kind,hash,ext,...rest]=token.split('_');return !rest.length&&/^[a-z]+$/i.test(kind||'')&&/^[a-f0-9]+$/i.test(hash||'')&&/^(png|jpe?g|webp)$/i.test(ext||'')?`https://cdn2.steamgriddb.com/${kind.toLowerCase()}/${hash.toLowerCase()}.${ext.toLowerCase()}`:null}
 return '/'+token+'.jpg';
}
function resolveSource(entry,decoded,params,cached,backgroundChoices){
 const source=entry.source;if(!source)return null;
 if(source.type==='custom')return source.value;
 if(source.type==='pattern')return REFERENCE_BACKGROUND_PATTERNS[source.index]?referenceImageSource('/_patterns/'+REFERENCE_BACKGROUND_PATTERNS[source.index]):null;
 if(source.type==='provider')return referenceImageSource(providerPath(source.token));
 if(source.type==='upload')return decoded.uploads[source.index]||(source.index===0?referenceImageSource(params.get('cb')):null);
 if(source.type==='providerIndex'){
  if(Array.isArray(backgroundChoices))return referenceImageSource(backgroundChoices[source.index]?.file_path)||null;
  if(source.index===0)return referenceImageSource(params.get('cp'))||cached.find(l=>l.category==='albumCover'&&embeddedReferenceImage(l.src))?.src||null;
 }
 return null;
}
export async function normalizeBackgroundImage(src){
 if(embeddedReferenceImage(src))return src;
 if(typeof src!=='string'||src.length>MAX_REFERENCE_IMAGE_LENGTH||!/^data:image\/avif;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))throw Error('Неподдерживаемый формат фонового изображения');
 const image=new Image();image.src=src;await image.decode();
 if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>10000||image.naturalHeight>10000||image.naturalWidth*image.naturalHeight>40_000_000)throw Error('Фоновое изображение слишком большое');
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png');
}
async function loadBackground(source,request,cached,getDimensions,normalize){
 const key=referenceImageSource(source);if(!key)throw Error('Нет доступного фонового изображения');
 let src=cached.find(l=>l.referenceAssetKey===key&&embeddedReferenceImage(l.src))?.src||embeddedReferenceImage(key);
 if(!src){if(key.startsWith('storage:'))throw Error('Фон находится в закрытом хранилище');const response=await request('/api/image?url='+encodeURIComponent(key));src=response?.src;
  if(!embeddedReferenceImage(src)){
   if(typeof src!=='string'||src.length>MAX_REFERENCE_IMAGE_LENGTH||!/^data:image\/avif;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))throw Error('Не удалось загрузить фон');
   src=await normalize(src);
  }
 }
 if(!embeddedReferenceImage(src))throw Error('Не удалось сохранить фон');
 const [w,h]=await getDimensions(src);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Неверные размеры фона');
 return {key,src,w,h};
}
function backgroundRegion(project,surface,mode,mask){
 const {w:W,h:H}=dimensions(project,surface);
 if(mask===null)return {x:0,y:0,w:W,h:H,targets:[],hidden:false};
 if(mode==='label')return {x:0,y:0,w:W,h:H,targets:[],hidden:!mask.includes(surface==='labelA'?0:1)};
 const count=project.layout.panels,rects=panelRects(project,surface),selected=rects.map((r,i)=>({r,i,bit:surface==='inner'?count+count-1-r.index:r.index})).filter(v=>mask.includes(v.bit));
 if(!selected.length)return {x:0,y:0,w:W,h:H,targets:[],hidden:true};
 const left=Math.min(...selected.map(v=>v.r.x)),right=Math.max(...selected.map(v=>v.r.x+v.r.w));
 return {x:left,y:0,w:right-left,h:H,targets:selected.map(v=>v.i),hidden:false};
}
export function referenceBackgroundGeometry(region,image,entry,mode='jcard'){
 const W=region.w,H=region.h,ratio=image.w/image.h,factor=bounded(entry.scale,1,400,100)/100;
 if(entry.tile){
  const tileHeight=mode==='label'?W*factor/ratio:H*.4*factor,tileWidth=mode==='label'?W*factor:tileHeight*ratio;
  return {x:region.x,y:region.y,w:W,h:H,imageTile:true,tileWidth,tileHeight,fit:'stretch'};
 }
 const fit=entry.fit||(entry.panels!==null?'slice':mode==='label'?'slice':'meet');
 let w=W*factor,h=H*factor;
 if(fit!=='stretch'){const size=(fit==='slice'?Math.max(W/image.w,H/image.h):Math.min(W/image.w,H/image.h))*factor;w=image.w*size;h=image.h*size}
 const cx=region.x+W*entry.offset.x/100,cy=region.y+H*entry.offset.y/100;
 return {x:cx-w/2,y:cy-h/2,w,h,imageTile:false,tileWidth:0,tileHeight:0,fit:'stretch'};
}
function rotateFrame(frame,angle){
 const a=angle*Math.PI/180,cx=frame.x+frame.w/2,cy=frame.y+frame.h/2;
 return {...frame,x:cx-(frame.w*Math.cos(a)-frame.h*Math.sin(a))/2,y:cy-(frame.w*Math.sin(a)+frame.h*Math.cos(a))/2,rotation:angle};
}
function savedBackgroundFrame(region,image,entry,mode){
 const raw=referenceBackgroundGeometry(region,image,entry,mode),length=(value,fallback)=>Math.max(.1,Math.min(1500,Number.isFinite(value)?value:value===Infinity?1500:fallback)),w=length(raw.w,region.w),h=length(raw.h,region.h);
 // Keep the requested center when a pathological image ratio exceeds project limits.
 const cx=region.x+region.w*(entry.tile?.5:entry.offset.x/100),cy=region.y+region.h*(entry.tile?.5:entry.offset.y/100);
 const frame=rotateFrame({...raw,w,h,x:cx-w/2,y:cy-h/2,tileWidth:raw.imageTile?length(raw.tileWidth,w):w,tileHeight:raw.imageTile?length(raw.tileHeight,h):h},entry.rotation);
 return {...frame,x:bounded(frame.x,-2000,2000,0),y:bounded(frame.y,-2000,2000,0),rotation:bounded(frame.rotation,-2000,2000,0)};
}
export async function restoreReferenceBackgrounds(project,params,request,mode='jcard',cached=[],getDimensions=referenceImageDimensions,normalize=normalizeBackgroundImage){
 const surfaces=mode==='label'?['labelA','labelB']:['outer','inner'],decoded=decodeReferenceBackground(params,mode==='label'?2:project.layout.panels*2),entries=[decoded.main,...decoded.extras],result={restored:0,missing:0};
 for(const surface of surfaces)project.surfaces[surface]=project.surfaces[surface].filter(l=>!l.referenceBackground);
 for(const [index,entry]of entries.entries()){
  if(!entry.source)continue;
  const regions=surfaces.map(surface=>({surface,region:backgroundRegion(project,surface,mode,entry.panels)}));
  const source=resolveSource(entry,decoded,params,Object.values(project.surfaces).flat(),project.referenceBackgroundChoices);let data;
  if(regions.some(v=>!v.region.hidden))try{data=await loadBackground(source,request,cached,getDimensions,normalize);result.restored++}catch{result.missing++}
  for(const {surface,region}of regions){
   const image=data||{w:1,h:1},frame=savedBackgroundFrame(region,image,entry,mode),unit=mode==='label'?project.layout.labelW/251.16:REFERENCE_UNIT;
   const layer=makeLayer('image',{...frame,category:'background',source:'referenceBackground',referenceBackground:true,referenceBackgroundIndex:index,name:data?'Фон из ссылки'+(index?' · '+(index+1):''):'Фон из ссылки — замените файл',src:data?.src||'',referenceAssetKey:data?.key||referenceImageSource(source)||'',missingReference:!data&&!region.hidden,opacity:entry.opacity/100,blendMode:entry.blendMode,blur:bounded(entry.blur*unit,0,20,0),visible:!region.hidden,panelTargets:region.targets});
   const list=project.surfaces[surface],at=list.findIndex(l=>!l.referenceBackground);list.splice(at<0?list.length:at,0,layer);
  }
 }
 return result;
}
