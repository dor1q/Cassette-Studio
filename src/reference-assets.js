import {clamp,makeLayer,referencePosition,clone,uid} from './model.js';
import {referenceSurface,decodedText} from './reference-format.js';
import {loadReferenceImage,referenceImageSource,MAX_REFERENCE_IMAGE_LENGTH} from './reference-image-source.js';

export function parseReferenceCustomDecals(raw){
 if(!raw||raw.length>MAX_REFERENCE_IMAGE_LENGTH)return [];
 let items;try{items=JSON.parse(raw)}catch{return []}if(!Array.isArray(items))return [];
 const seen=new Set();
 return items.slice(0,60).map(item=>{
  if(!item||typeof item!=='object'||!/^custom-[A-Za-z0-9.-]{1,180}$/.test(item.id||'')||typeof item.src!=='string'||seen.has(item.id))return null;
  seen.add(item.id);const layer=['under','background'].includes(item.layer)?item.layer:'over',side=item.side==='back'?'back':'front',value=(key,fallback)=>Number.isFinite(Number(item[key]))&&item[key]!==null?Number(item[key]):fallback;
  const [placement]=parseReferenceDecals(`${item.id}_${value('x',50)}_${value('y',50)}_${value('rotation',0)}_${value('scale',100)}_${{under:'u',background:'b',over:'o'}[layer]}_${side==='back'?'b':'f'}`);
  if(!placement)return null;
  placement.tintMode=['tint','solid'].includes(item.colorizeMode)?item.colorizeMode:'none';placement.tintColor=/^#?[a-f0-9]{6}$/i.test(item.colorOverride||'')?'#'+item.colorOverride.replace(/^#/,''):null;
  return {...placement,src:item.src,name:String(item.label||'Декаль из ссылки').slice(0,200)};
 }).filter(Boolean);
}

export function parseReferenceDecals(value){
 return String(value||'').slice(0,20000).split('|').slice(0,60).map(part=>{
  const fields=part.split('_'),id=decodedText(fields[0]);
  if(fields.length<5||!id||id.length>200)return null;
  const [x,y,rotation,scale]=fields.slice(1,5).map(Number);
  if(![x,y,rotation,scale].every(Number.isFinite)||Math.abs(x)>125||y < -100||y>200||Math.abs(rotation)>360||scale<=0||scale>900)return null;
  const extras=fields.slice(7),stretch=extras.find(x=>/^r\d+(?:\.\d+)?$/.test(x)),tint=extras.find(x=>/^x[a-f0-9]{6}$/i.test(x));
  return {id,x,y,rotation,scale,under:['u','b'].includes(fields[5]),layer:{u:'under',b:'background',o:'over'}[fields[5]]||'over',side:fields[6]==='b'?'back':'front',tintMode:fields[7]==='c'?'tint':fields[7]==='s'?'solid':'none',tintColor:tint?'#'+tint.slice(1):null,stretch:stretch?clamp(Number(stretch.slice(1)),10,1000):100,xAnchored:extras.includes('a')};
 }).filter(Boolean);
}
export function referenceDecalLayer(project,decal,item,src,naturalWidth,naturalHeight,surface='outer'){
 const base=surface.startsWith('label')?130*project.layout.labelW/251.16:800/(600/25.4),width=clamp(base*decal.scale/100,.5,500),w=width*(decal.stretch||100)/100,h=width*naturalHeight/naturalWidth;
 return makeLayer('image',{category:'decals',referenceId:decal.id,referenceDecalLayer:decal.layer,name:item.name,src,...referencePosition(project,decal.x,decal.y,w,h,decal.rotation,surface),w,h,rotation:decal.rotation,fit:decal.stretch&&decal.stretch!==100?'stretch':'meet',tintMode:decal.tintMode||'none',tintColor:decal.tintColor||project.settings.fg});
}

async function imageDimensions(src){const image=new Image();image.src=src;await image.decode();return [image.naturalWidth,image.naturalHeight]}

export async function restoreReferenceDecals(project,params,request,getDimensions=imageDimensions,surface='outer',cached=[]){
 const custom=parseReferenceCustomDecals(params.get('cd')),decals=parseReferenceDecals(params.get('d'));
 for(const item of custom)if(!decals.some(d=>d.id===item.id))decals.push(item);
 if(!decals.length)return {restored:0,missing:0};
 let catalog;
 try{catalog=decals.some(d=>!d.id.startsWith('custom-'))?await request('/api/decals'):[]}catch{catalog=[]}
 const items=catalog.flatMap(category=>category.items.map(item=>({...item,category:category.id}))),layers=[];
 let missing=0,restored=0,placeholders=0;
 for(const decal of decals){
  const target=referenceSurface(project,surface.startsWith('label')?'label':'jcard',decal.side);
  const embedded=cached.find(layer=>layer.referenceId===decal.id&&/^data:image\//.test(layer.src||''));
  if(embedded){try{const [w,h]=await getDimensions(embedded.src);if(!w||!h)throw Error('Размер');const layer=referenceDecalLayer(project,decal,{name:embedded.name},embedded.src,w,h,target);if(embedded.referenceAssetKey)layer.referenceAssetKey=embedded.referenceAssetKey;layers.push({layer,target,under:decal.under});restored++;continue}catch{}}
  const upload=custom.find(item=>item.id===decal.id);
  if(upload){try{const data=await loadReferenceImage(upload.src,request,getDimensions,cached),layer=referenceDecalLayer(project,decal,upload,data.src,data.w,data.h,target);layer.referenceAssetKey=data.key;layers.push({layer,target,under:decal.under});restored++;continue}catch{}}
  const item=items.find(item=>item.id===decal.id);
  if(!item){missing++;if(decal.id.startsWith('custom-')){const layer=referenceDecalLayer(project,decal,{name:'Недоступное изображение — замените файл'},'',800,600,target);layer.missingReference=true;const key=upload&&referenceImageSource(upload.src);if(key)layer.referenceAssetKey=key;layers.push({layer,target,under:decal.under});placeholders++}continue}
  try{
   const data=await request('/api/decal?'+new URLSearchParams({category:item.category,id:item.id}));
   if(!data.src){missing++;continue}
   const [w,h]=await getDimensions(data.src);
   if(!w||!h)throw Error('Некорректные размеры');
   layers.push({layer:referenceDecalLayer(project,decal,item,data.src,w,h,target),target,under:decal.under});restored++;
  }catch{missing++}
 }
 for(const target of ['outer','inner','labelA','labelB']){const placed=layers.filter(x=>x.target===target||(target.startsWith('label')&&project.layout.sync&&x.target.startsWith('label'))).map(x=>({...x,layer:x.target===target?x.layer:{...clone(x.layer),id:uid()}}));const background=placed.filter(x=>x.layer.referenceDecalLayer==='background'),graphics=placed.filter(x=>x.under&&x.layer.referenceDecalLayer!=='background'),current=project.surfaces[target],firstText=current.findIndex(l=>l.type==='text'),at=firstText<0?current.length:firstText;const base=current.filter(l=>l.referenceBackground),rest=current.slice(0,at).filter(l=>!l.referenceBackground);project.surfaces[target]=[...base,...background.map(x=>x.layer),...rest,...graphics.map(x=>x.layer),...current.slice(at),...placed.filter(x=>!x.under).map(x=>x.layer)]}
 return {restored,missing,placeholders};
}

export async function restoreReferenceFonts(project,request){
 const system=new Set(['Arial','Georgia','Courier New','Impact','Verdana','Trebuchet MS','Times New Roman','Tahoma']);
 const needed=new Map();
 for(const layer of Object.values(project.surfaces).flat())if(layer.type==='text')for(const text of [layer,...(layer.albumStyle?[{...layer,...layer.albumStyle}]:[])]){
  if(!text.font||system.has(text.font))continue;
  const weight=text.fontWeight||(text.bold?700:400),style=text.italic?'italic':'normal',key=text.font+'|'+weight+'|'+style;
  if(!project.fonts.some(f=>f.name===text.font&&(f.weight||400)===weight&&(f.style||'normal')===style))needed.set(key,{name:text.font,weight,style});
 }
 if(!needed.size)return {restored:0,missing:[]};
 let catalog;try{catalog=await request('/api/fonts')}catch{return {restored:0,missing:[...new Set([...needed.values()].map(f=>f.name))]}}
 let restored=0;const missing=new Set();
 for(const font of needed.values()){
  const family=catalog.find(f=>f.name===font.name);if(!family||project.fonts.length>=80){missing.add(font.name);continue}
  const requested=String(font.weight)+(font.style==='italic'?'i':''),variant=family.variants.includes(requested)?requested:String(font.weight);
  if(!family.variants.includes(variant)){missing.add(font.name);continue}
  if(project.fonts.some(f=>f.name===font.name&&String(f.weight)+(f.style==='italic'?'i':'')===variant))continue;
  try{const result=await request('/api/font?'+new URLSearchParams({name:font.name,variant}));if(!result.data)throw Error('Нет файла шрифта');project.fonts.push(result);restored++}catch{missing.add(font.name)}
 }
 return {restored,missing:[...missing]};
}
