import {WILD_REMIX_KIT,REMIX_LEGACY_PART_IDS,REMIX_MAX_SOURCE_BYTES,REMIX_MAX_KIT_BYTES,REMIX_FETCH_CONCURRENCY,remixPart} from './overlay-remix-kit.js';
import {REMIX_RENDER_VERSION,remixGeometry,remixRectangle,remixSeed,remixHash,planRemix} from './overlay-remix-plan.js';

export function normalizeRemixParts(input){
 const raw=Array.isArray(input)?input:input?.parts||[];
 const parts=new Map();let bytes=0;
 for(const [index,item]of raw.entries()){
  const id=typeof item==='string'?REMIX_LEGACY_PART_IDS[index]:item?.id,src=typeof item==='string'?item:item?.src,known=remixPart(id);
  if(!known||typeof src!=='string'||!/^data:image\/(?:png|jpe?g|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(src))continue;
  const size=Math.ceil(src.length*.75);if(size>REMIX_MAX_SOURCE_BYTES)throw Error('Часть Remix больше 15 МБ');
  if(parts.has(id))continue;bytes+=size;if(bytes>REMIX_MAX_KIT_BYTES)throw Error('Набор Remix слишком большой');
  parts.set(id,{...known,src});
 }
 return parts;
}
async function mapLimited(values,limit,callback){
 const result=Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{while(next<values.length){const index=next++;result[index]=await callback(values[index],index)}}));
 return result;
}
function decodePart(part){
 return new Promise((resolve,reject)=>{
  const image=new Image(),timer=setTimeout(()=>finish(Error('Загрузка части Remix заняла слишком много времени')),12000);
  const finish=error=>{clearTimeout(timer);image.onload=image.onerror=null;if(error){image.src='';reject(error)}else resolve(image)};
  image.onload=()=>{const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h||w>8192||h>8192||w*h>20_000_000)finish(Error('Часть Remix имеет неподдерживаемый размер'));else finish()};
  image.onerror=()=>finish(Error('Не удалось открыть часть Remix: '+part.id));image.src=part.src;
 });
}
function fade(context,width,height,horizontal,amount,startOnly=false){
 const size=horizontal?width:height,f=Math.min(.5,Math.max(0,amount/size));if(!f)return;
 const gradient=context.createLinearGradient(0,0,horizontal?width:0,horizontal?0:height);
 gradient.addColorStop(0,'rgba(255,255,255,0)');gradient.addColorStop(f,'rgba(255,255,255,1)');
 if(!startOnly){gradient.addColorStop(1-f,'rgba(255,255,255,1)');gradient.addColorStop(1,'rgba(255,255,255,0)')}else gradient.addColorStop(1,'rgba(255,255,255,1)');
 context.globalCompositeOperation='destination-in';context.fillStyle=gradient;context.fillRect(0,0,width,height);context.globalCompositeOperation='source-over';
}
export function remixPixelsToAlpha(pixels,blendMode='screen'){
 if(!pixels||pixels.length%4)throw Error('Некорректные пиксели Remix');
 for(let i=0;i<pixels.length;i+=4){
  const opacity=pixels[i+3];if(!opacity)continue;
  const light=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255;
  const hard=blendMode==='hard-light',coverage=hard?Math.abs(light*2-1):light,color=hard&&light<.5?0:255;
  pixels[i]=pixels[i+1]=pixels[i+2]=color;pixels[i+3]=Math.round(opacity*coverage);
 }
 return pixels;
}
export async function renderRemixPlan(plan,parts,{createCanvas=()=>document.createElement('canvas'),loadImage=decodePart,path=outline=>new Path2D(outline),blendMode='screen'}={}){
 const records=plan.usedParts.map(id=>parts.get(id));if(records.some(part=>!part))throw Error('Не хватает частей Remix для этого рисунка');
 const loaded=await mapLimited(records,REMIX_FETCH_CONCURRENCY,async part=>[part.id,await loadImage(part)]),images=new Map(loaded);
 const canvas=createCanvas();canvas.width=plan.width;canvas.height=plan.height;const c=canvas.getContext('2d');if(!c)throw Error('Не удалось открыть холст Remix');
 const buffer=createCanvas();c.save();c.scale(plan.scale*600/25.4,plan.scale*600/25.4);c.clip(path(plan.geometry.outline),'evenodd');c.scale(25.4/600,25.4/600);
 c.fillStyle='#000';c.fillRect(0,0,plan.logicalWidth,plan.logicalHeight);c.globalCompositeOperation='screen';c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 if(plan.grain){
  const image=images.get(plan.grain),tile=remixPart(plan.grain).width;c.globalAlpha=plan.grainAlpha;
  for(let y=0;y<plan.logicalHeight;y+=tile)for(let x=0;x<plan.logicalWidth;x+=tile){c.save();c.translate(x+tile/2,y+tile/2);c.scale(Math.floor(x/tile)%2?-1:1,Math.floor(y/tile)%2?-1:1);c.drawImage(image,-tile/2,-tile/2,tile,tile);c.restore()}
 }
 for(const op of plan.ops){
  const image=images.get(op.id),part=parts.get(op.id),source=op.source;
  const factor=Math.min(plan.scale,2048/op.w,2048/op.h,Math.sqrt(4_000_000/(op.w*op.h)));
  buffer.width=Math.max(1,Math.ceil(op.w*factor));buffer.height=Math.max(1,Math.ceil(op.h*factor));
  const b=buffer.getContext('2d');b.imageSmoothingEnabled=true;b.imageSmoothingQuality='high';
  const sx=(image.naturalWidth||image.width)/part.width,sy=(image.naturalHeight||image.height)/part.height;
  b.drawImage(image,source.x*sx,source.y*sy,source.w*sx,source.h*sy,0,0,buffer.width,buffer.height);
  fade(b,buffer.width,buffer.height,true,op.featherX*factor);fade(b,buffer.width,buffer.height,false,op.featherY*factor);
  c.save();c.translate(op.x,op.y);c.rotate(op.rotation);c.scale(op.flipX?-1:1,op.flipY?-1:1);c.globalAlpha=op.alpha;c.drawImage(buffer,-op.w/2,-op.h/2,op.w,op.h);c.restore();
 }
 c.restore();const pixels=c.getImageData(0,0,plan.width,plan.height);remixPixelsToAlpha(pixels.data,blendMode);c.putImageData(pixels,0,0);
 const src=canvas.toDataURL('image/png');buffer.width=buffer.height=1;if(!src.startsWith('data:image/png;base64,'))throw Error('Не удалось сохранить Remix');return src;
}
async function assemble(geometry,request,seed,options={}){
 seed=remixSeed(seed);const cached=normalizeRemixParts(options.cachedParts),metadata=options.kitMetadata||options.cachedParts?.metadata;
 const knownMetadata=metadata?.kitId==='wild'&&metadata.rendererVersion===REMIX_RENDER_VERSION;
 const sourceBlendMode=(options.blendMode??(knownMetadata?metadata.sourceBlendMode:undefined))==='hard-light'?'hard-light':'screen';
 let availability=knownMetadata&&Array.isArray(metadata.availability)?metadata.availability:WILD_REMIX_KIT.parts.map(part=>part.id);
 const maxSide=options.maxSide??(knownMetadata?metadata.maxSide:undefined);
 let plan=planRemix(geometry,seed,{availability,maxSide});
 const missing=plan.usedParts.filter(id=>!cached.has(id));
 if(missing.length){
  try{
   if(typeof request!=='function')throw Error('Нет сохранённых частей для этого Remix');
   const response=await request('/api/decal?'+new URLSearchParams({category:'overlays',id:'wild-america-remix',parts:missing.join(',')}));
   for(const [id,part]of normalizeRemixParts(response.parts))cached.set(id,part);
   normalizeRemixParts([...cached.values()]);
   if(plan.usedParts.some(id=>!cached.has(id)))throw Error('Не все части Remix загрузились');
  }catch(error){
   if(!cached.size)throw error;
   // An offline shuffle can use the saved real kit pieces. Persist this narrower
   // availability so reopening the seed reproduces this exact choice of pieces.
   availability=[...cached.keys()];plan=planRemix(geometry,seed,{availability,maxSide});
  }
 }
 const selected=plan.usedParts.map(id=>cached.get(id));
 const signature=plan.signature+'-'+remixHash(sourceBlendMode+'|'+selected.map(part=>part.id+':'+remixHash(part.src)).join('|'));
 const src=await renderRemixPlan(plan,cached,{...options.renderer,blendMode:sourceBlendMode});
 const kitMetadata={kitId:'wild',version:WILD_REMIX_KIT.version,rendererVersion:REMIX_RENDER_VERSION,seed,signature,planSignature:plan.signature,geometrySignature:geometry.signature,availability:plan.availability,maxSide:plan.maxSide,sourceBlendMode,parts:selected};
 return {src,name:WILD_REMIX_KIT.name,seed,signature,usedParts:plan.usedParts,kitMetadata,blendMode:'normal',sourceBlendMode};
}
export async function prepareRemix(project,surface,request,seed=1,options={}){return assemble(remixGeometry(project,surface),request,seed,options)}
export async function prepareRemixFromParts(parts,ratio,seed=1,options={}){
 const normalized=normalizeRemixParts(parts),metadata={kitId:'wild',rendererVersion:REMIX_RENDER_VERSION,availability:[...normalized.keys()]};
 return assemble(remixRectangle(ratio),null,seed,{...options,cachedParts:[...normalized.values()],kitMetadata:metadata});
}
