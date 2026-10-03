import {referenceFlowLayers} from './reference-flow.js';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const luminance=channels=>channels.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
export function colorContrast(a,b){const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

export function albumColorsFromPixels(pixels){
 if(!pixels?.length||pixels.length%4)throw Error('Не удалось прочитать цвета обложки');
 const colors=new Map(),fallback=new Map();
 const add=(map,r,g,b,weight)=>{const key=((r>>4)<<8)|((g>>4)<<4)|(b>>4),bucket=map.get(key)||{weight:0,r:0,g:0,b:0};bucket.weight+=weight;bucket.r+=r*weight;bucket.g+=g*weight;bucket.b+=b*weight;map.set(key,bucket)};
 for(let i=0;i<pixels.length;i+=4){const [r,g,b,a]=pixels.slice(i,i+4);if(a<125)continue;const weight=a/255,mean=(r+g+b)/3;add(fallback,r,g,b,weight);if(mean>=30&&mean<=225)add(colors,r,g,b,weight*(1+(Math.max(r,g,b)-Math.min(r,g,b))/100))}
 const buckets=colors.size?colors:fallback;let best;
 for(const bucket of buckets.values())if(!best||bucket.weight>best.weight)best=bucket;
 if(!best)throw Error('Обложка полностью прозрачная');
 const bg='#'+['r','g','b'].map(c=>Math.round(best[c]/best.weight).toString(16).padStart(2,'0')).join('');
 const fg=colorContrast(bg,'#ffffff')>=colorContrast(bg,'#000000')?'#ffffff':'#000000';
 return {bg,fg};
}

export async function extractAlbumColors(src){
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(src||''))throw Error('Для подбора цвета нужна загруженная обложка');
 const image=new Image();image.src=src;await image.decode();
 const ratio=Math.min(1,96/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
 const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Подбор цвета недоступен');
 context.drawImage(image,0,0,canvas.width,canvas.height);
 return albumColorsFromPixels(context.getImageData(0,0,canvas.width,canvas.height).data);
}

export function applyAlbumColors(project,palette,{force=false}={}){
 if(!palette||!force&&project.settings.autoAlbumColors===false)return false;
 if(!/^#[a-f0-9]{6}$/i.test(palette.bg)||!/^#[a-f0-9]{6}$/i.test(palette.fg))throw Error('Неверные цвета обложки');
 const oldForeground=project.settings.fg.toLowerCase();
 const foreground=oldForeground==='rainbow'?'rainbow':palette.fg;
 Object.assign(project.settings,{bg:palette.bg,bgB:palette.bg,bgInside:palette.bg,fg:foreground,referenceTransparentBackground:false});
 for(const layer of new Set([...Object.values(project.surfaces).flat(),...referenceFlowLayers(project)])){
  const inherited=String(layer.color).toLowerCase()===oldForeground;
  if(layer.type==='text'&&!layer.referenceOwnColor&&(layer.source||inherited))layer.color=foreground;if(layer.albumStyle&&!layer.referenceAlbumOwnColor&&String(layer.albumStyle.color).toLowerCase()===oldForeground)layer.albumStyle.color=foreground;
  if(['qr','barcode'].includes(layer.type)&&!layer.referenceOwnColor&&layer.referenceColorInherited!==false&&(inherited||layer.referenceColorInherited===true))layer.color=foreground;
  if(layer.type==='image'&&layer.tintMode!=='none'&&String(layer.tintColor).toLowerCase()===oldForeground)layer.tintColor=palette.fg;
 }
 return true;
}
