import {download} from './export.js';

export function imageAssetCanvas(image,createCanvas=()=>document.createElement('canvas')){
 const width=Number(image.naturalWidth),height=Number(image.naturalHeight);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Не удалось прочитать размер картинки.');
 if(width*height>65000000)throw Error('Картинка слишком большая для экспорта.');
 const canvas=createCanvas();canvas.width=width;canvas.height=height;
 canvas.getContext('2d').drawImage(image,0,0,width,height);return canvas;
}
export async function exportImageAsset({src,name='decal'},copy=false){
 if(!/^data:image\//.test(src||''))throw Error('Сначала загрузите изображение.');
 const image=new Image();image.src=src;await image.decode();
 const canvas=imageAssetCanvas(image),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw Error('Не удалось подготовить PNG.');
 if(copy)await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
 else download(blob,String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,100)+'.png');
 return {width:canvas.width,height:canvas.height};
}
