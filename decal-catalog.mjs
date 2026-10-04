import {readFile} from 'node:fs/promises';
import {WILD_REMIX_KIT,REMIX_MAX_SOURCE_BYTES,REMIX_MAX_KIT_BYTES,REMIX_FETCH_CONCURRENCY,remixPart,remixPartSelection} from './src/overlay-remix-kit.js';
let cached;
const imageCache=new Map(),pendingImages=new Map();let cachedImageBytes=0;
let imageDownloads=0;const downloadQueue=[];
async function limitedImageFetch(imagePath){
 if(imageDownloads<REMIX_FETCH_CONCURRENCY)imageDownloads++;else await new Promise(resolve=>downloadQueue.push(resolve));
 try{return await fetchPublicImage(imagePath)}finally{const next=downloadQueue.shift();if(next)next();else imageDownloads--}
}
export async function decalCatalog(){
 if(cached)return cached;
 const r=await fetch('https://vhs.texs.org/api/decals',{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Библиотека декалей сейчас недоступна');
 const data=await r.json();
 try{const ratings=await fetch('https://vhs.texs.org/api/content-ratings',{signal:AbortSignal.timeout(12000)});
 if(ratings.ok)data.categories.push(...(await ratings.json()).categories)}catch{}
 const names={bannerGraphics:'Баннеры',cassetteGraphics:'Кассеты, CD и винил',genreTags:'Жанры',holographicDecals:'Голограммы',miscStickers:'Разные наклейки',oldBrands:'Прокатные магазины',oldDistributors:'Классические логотипы',priceTags:'Ценники',shapes:'Фигуры',transparentBanners:'Прозрачные баннеры'};
 cached=data.categories.map(c=>({id:c.id,label:names[c.id]||c.label,items:c.items.filter(i=>/^\/_(decals|content-ratings)\/[\w! .\/-]+\.(webp|png|jpe?g)$/.test(i.fullPath)&&!i.fullPath.includes('..')).map(i=>({id:i.id,name:i.name,path:i.fullPath,thumb:new URL(i.path,'https://vhs.texs.org').href,popular:!!i.isPopular}))}));
 cached.push({id:'patterns',label:'Фоны',items:[['00-brick.jpg','Кирпич'],['01-marble.jpg','Мрамор'],['02-marbe-bg-2.avif','Мрамор 2'],['03-stars-bg.avif','Звёзды'],['04-pattern.png','Узор'],['05-marbled-pattern.avif','Мраморный узор'],['06-marble-bg.avif','Мраморный фон'],['07-matrix.avif','Матрица']].map(([id,name])=>({id,name,path:'/_patterns/'+id,thumb:'https://vhs.texs.org/_patterns/'+id,popular:false}))});
 const logos=JSON.parse(await readFile(new URL('./studio-logos.json',import.meta.url),'utf8'));
 cached.push({id:'studio',label:'Логотипы Studio',items:logos.map(({name,path},index)=>({id:String(index),name,path,thumb:'https://vhs.texs.org'+path,popular:false}))});
 cached.push({id:'overlays',label:'Наложения',items:[{id:'wild-america',name:'Wild America',path:'/_overlays/jcard-wild.webp',thumb:'https://vhs.texs.org/api/thumb/_overlays/jcard-wild.webp',popular:false},{id:'wild-america-remix',name:'Wild America Remix',path:'/_overlays/kits/wild/thumb.webp',thumb:'https://vhs.texs.org/_overlays/kits/wild/thumb.webp',popular:false}]});
 return cached;
}
export async function fetchDecal(category,id,partNames){
 const item=(await decalCatalog()).find(c=>c.id===category)?.items.find(i=>i.id===id);
 if(!item)throw Error('Декаль не найдена');
 if(category==='overlays'&&id==='wild-america-remix'){
  const names=remixPartSelection(partNames),parts=Array(names.length);let next=0;
  await Promise.all(Array.from({length:Math.min(REMIX_FETCH_CONCURRENCY,names.length)},async()=>{while(next<names.length){const index=next++,part=remixPart(names[index]);parts[index]={...part,src:await readPublicImage(WILD_REMIX_KIT.directory+'/'+part.id+'.webp')}}}));
  if(parts.reduce((sum,part)=>sum+Math.ceil(part.src.length*.75),0)>REMIX_MAX_KIT_BYTES)throw Error('Набор Remix слишком большой');
  return {name:item.name,kit:{id:WILD_REMIX_KIT.id,version:WILD_REMIX_KIT.version,parts:WILD_REMIX_KIT.parts,once:WILD_REMIX_KIT.once},parts};
 }
 return {name:item.name,src:await readPublicImage(item.path)};
}
async function readPublicImage(imagePath){
 if(imageCache.has(imagePath)){const entry=imageCache.get(imagePath);imageCache.delete(imagePath);imageCache.set(imagePath,entry);return entry.src}
 if(pendingImages.has(imagePath))return pendingImages.get(imagePath);
 const promise=limitedImageFetch(imagePath).then(src=>{const size=Math.ceil(src.length*.75);while(imageCache.size&&(cachedImageBytes+size>REMIX_MAX_KIT_BYTES||imageCache.size>=40)){const [key,entry]=imageCache.entries().next().value;imageCache.delete(key);cachedImageBytes-=entry.size}imageCache.set(imagePath,{src,size});cachedImageBytes+=size;return src}).finally(()=>pendingImages.delete(imagePath));
 pendingImages.set(imagePath,promise);return promise;
}
async function fetchPublicImage(imagePath){
 const r=await fetch(new URL(imagePath,'https://vhs.texs.org'),{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Изображение недоступно');
 const declared=Number(r.headers.get('content-length'));if(declared>REMIX_MAX_SOURCE_BYTES)throw Error('Изображение больше 15 МБ');
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>REMIX_MAX_SOURCE_BYTES)throw Error('Изображение больше 15 МБ');chunks.push(chunk)}
 const bytes=Buffer.concat(chunks);
 const mime=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'png':bytes[0]===255&&bytes[1]===216?'jpeg':bytes.toString('ascii',4,8)==='ftyp'&&bytes.toString('ascii',8,32).includes('avif')?'avif':null;
 if(!mime)throw Error('Неизвестный формат декали');
 return `data:image/${mime};base64,`+bytes.toString('base64');
}
