import {writePrintPages} from './print-pdf.js';
import {printLayout} from './print-layout.js';
import {jsPDF} from 'jspdf';
import {renderSvg} from './render.js';
import {isProductionSheet,productionPages,PRODUCTION_BLEED} from './production-print.js';
import {printShopLetter} from './print-shop-letter.js';
import {normalizeEditorMode,isCDMode,modeSurfaces,modeDefaultSurface} from './media-formats.js';

export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)}
export async function raster(svg,w,h,dpi=300){await document.fonts.ready;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();await new Promise((yes,no)=>{img.onload=yes;img.onerror=()=>no(Error('Не удалось отрисовать изображение'));img.src=url});const c=document.createElement('canvas');c.width=Math.round(w/25.4*dpi);c.height=Math.round(h/25.4*dpi);if(c.width*c.height>75000000)throw Error('Слишком большой макет. Уменьшите dpi.');c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c}finally{URL.revokeObjectURL(url)}}
export function surfaceSet(p,mode=p.editorMode??p.mode,surface,selection='all'){
 mode=normalizeEditorMode(mode);const allowed=modeSurfaces(p,mode);
 if(selection==='current'){
  const chosen=surface||modeDefaultSurface(mode);if(!allowed.includes(chosen))throw Error('Выбранная сторона не относится к этому макету.');return [chosen];
 }
 if(mode==='jcard'&&!p.layout.double)return ['outer'];
 if(mode==='cd-insert'&&p.layout.cdInsertDouble!==true)return ['cdFront'];
 if(mode==='cd-tray'&&p.layout.cdTrayDouble!==true)return ['cdTray'];
 return allowed;
}
function exportOptions(p,options){
 const mode=normalizeEditorMode(options.mode??p.editorMode??p.mode);
 const opts={format:'pdf',surface:modeDefaultSurface(mode),selection:'all',blank:false,bleed:0,dpi:isCDMode(mode)?600:300,paper:'a4',copies:1,guides:false,sheet:'auto',offsetX:0,offsetY:0,duplexFlip:'long',...options,mode};
 if(opts.cdPrintReady){
  if(mode!=='cd-label')throw Error('PNG для печати CD доступен только для наклейки CD Label.');
  Object.assign(opts,{format:'png',surface:'cdLabel',selection:'current',blank:false,bleed:0,dpi:600,copies:1,guides:false,sheet:'auto',offsetX:0,offsetY:0});
 }
 if(isCDMode(mode)&&isProductionSheet(opts.sheet))throw Error('Производственные шаблоны кассет не подходят для CD. Выберите обычную раскладку CD.');
 if(['12up','12up-trim'].includes(opts.sheet)&&mode!=='label')throw Error('Раскладка на 12 наклеек предназначена для кассет.');
 if(['cd-2up','cd-letter-2up'].includes(opts.sheet)&&mode!=='cd-label')throw Error('Раскладка на два диска предназначена для CD Label.');
 if(opts.sheet==='cd-letter-2up'){opts.paper='letter';opts.bleed=0;opts.dpi=600;if(Number(opts.offsetX)||Number(opts.offsetY))throw Error('В шаблоне OL1200 / Avery 8692 позиции фиксированы. Уберите сдвиг печати.')}
 return opts;
}

// PDF and image sheet exports use the same millimetre positions and clipping.
export function composePrintSheetSvg(items,page,w,h){
 let body='<rect width="100%" height="100%" fill="white"/>';
 for(const [index,pos]of page.entries()){
  const item=items[pos.item],nested=item.svg.replace(/^\s*<svg\b[^>]*>/,opening=>opening.replace(/\s(?:width|height|x|y)="[^"]*"/g,'').replace(/>$/,` x="${pos.x}" y="${pos.y}" width="${item.w}" height="${item.h}">`));
  let artwork=pos.rotation?`<g transform="rotate(${pos.rotation} ${pos.x+item.w/2} ${pos.y+item.h/2})">${nested}</g>`:nested;
  if(pos.clip){const id='print-sheet-cell-'+index;body+=`<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${pos.clip.x}" y="${pos.clip.y}" width="${pos.clip.w}" height="${pos.clip.h}"/></clipPath></defs>`;artwork=`<g clip-path="url(#${id})">${artwork}</g>`}
  body+=artwork;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
export function orientedPageSvg(page){
 if(!page.rotation)return page.svg;
 const match=page.svg.match(/^\s*(<svg\b[^>]*>)([\s\S]*)<\/svg>\s*$/);if(!match)return page.svg;
 const box=match[1].match(/\bviewBox="([^"]+)"/);if(!box)return page.svg;
 const viewBox=box[1].trim().split(/\s+/).map(Number);
 return `${match[1]}<g transform="rotate(${page.rotation} ${viewBox[0]+viewBox[2]/2} ${viewBox[1]+viewBox[3]/2})">${match[2]}</g></svg>`;
}
export function prepareExport(p,options={}){
 const opts=exportOptions(p,options);
 const production=isProductionSheet(opts.sheet),trimmed=opts.sheet==='12up-trim';
 if(trimmed){opts.sheet='12up';opts.bleed=0}
 if(opts.mode==='label'&&['body','full'].includes(p.layout.printArea))opts.bleed=0;
 if(production){opts.bleed=opts.mode==='jcard'?PRODUCTION_BLEED:0;opts.guides=false;if(Number(opts.offsetX)||Number(opts.offsetY))throw Error('В производственном шаблоне позиции фиксированы. Уберите сдвиг печати.')}
 const surfaces=opts.sheet==='chalkpit-jcard-8up'?['outer']:surfaceSet(p,opts.mode,opts.surface,opts.selection);
 let items=surfaces.map(s=>{const item={s,...renderSvg(p,s,opts)};if(item.warnings.length&&!opts.blank)throw Error(item.warnings.join('\n'));return item});
 if(production)items=productionPages(p,items,opts);
 return {items,options:opts,production,trimmed};
}
export function exportImagePages(p,options={}){
 const {items,options:opts,production}=prepareExport(p,options);
 if(production)return items.map(item=>({...item,svg:orientedPageSvg(item),rotation:0}));
 if(opts.sheet==='auto')return items.map(item=>({...item,dpi:opts.dpi}));
 const plan=printLayout(items,opts);
 return plan.pages.map((page,index)=>({s:'sheet-'+(index+1),svg:composePrintSheetSvg(items,page,plan.w,plan.h),w:plan.w,h:plan.h,dpi:opts.dpi,warnings:[]}));
}

// Canvas PNGs normally say 96 dpi. Store the chosen resolution in the PNG too.
export async function pngWithDpi(blob,dpi){
 const source=new Uint8Array(await blob.arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
 if(!signature.every((byte,i)=>source[i]===byte))throw Error('Не удалось сохранить PNG.');
 const chunks=[];let at=8;
 while(at+12<=source.length){const length=new DataView(source.buffer,source.byteOffset+at,4).getUint32(0),end=at+12+length;if(end>source.length)throw Error('Повреждённый PNG.');const type=String.fromCharCode(...source.subarray(at+4,at+8));if(type!=='pHYs')chunks.push(source.subarray(at,end));at=end;if(type==='IEND')break}
 if(at!==source.length||!chunks.length||String.fromCharCode(...chunks.at(-1).subarray(4,8))!=='IEND')throw Error('Повреждённый PNG.');
 const physical=new Uint8Array(21),view=new DataView(physical.buffer),pixelsPerMetre=Math.round(Number(dpi)/.0254);
 if(!Number.isFinite(pixelsPerMetre)||pixelsPerMetre<=0||pixelsPerMetre>0xffffffff)throw Error('Некорректное разрешение PNG.');
 view.setUint32(0,9);physical.set([112,72,89,115],4);view.setUint32(8,pixelsPerMetre);view.setUint32(12,pixelsPerMetre);physical[16]=1;
 let crc=0xffffffff;for(const byte of physical.subarray(4,17)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}view.setUint32(17,(crc^0xffffffff)>>>0);
 return new Blob([source.subarray(0,8),chunks[0],physical,...chunks.slice(1)],{type:'image/png'});
}
async function canvasPng(canvas,dpi){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Не удалось сохранить PNG.');return pngWithDpi(blob,dpi)}

export async function exportProject(p,options={}){
 const opts=exportOptions(p,{shareUrl:'',includeQr:true,...options}),name=(p.title||p.data.album||'cassette').replace(/[<>:"/\\|?*]/g,'-');
 if(opts.format==='printshop'){
  const r=printShopLetter(p,opts),canvas=await raster(r.svg,r.w,r.h,150),doc=new jsPDF({unit:'mm',format:[r.w,r.h],orientation:'portrait',compress:true});doc.addImage(canvas.toDataURL('image/png'),'PNG',0,0,r.w,r.h,undefined,'FAST');doc.setProperties({title:p.title,subject:'Cassette Studio — print specifications'});download(doc.output('blob'),`${name}-print-specs.pdf`);return;
 }
 if(['svg','png','clipboard'].includes(opts.format)){
  const pages=exportImagePages(p,opts);
  if(opts.format==='clipboard'){
   if(typeof ClipboardItem==='undefined'||!navigator.clipboard?.write)throw Error('Копирование изображения недоступно. Сохраните PNG.');
   const page=pages[0],canvas=await raster(page.svg,page.w,page.h,page.dpi),blob=await canvasPng(canvas,page.dpi);await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);return {copiedPages:1,totalPages:pages.length};
  }
  for(const [index,page]of pages.entries()){
   const suffix=(pages.length>1&&opts.sheet!=='auto'?`page-${String(index+1).padStart(2,'0')}-${page.s}`:page.s)+(opts.cdPrintReady?'-print-ready':'');
   if(opts.format==='svg')download(new Blob([page.svg],{type:'image/svg+xml'}),`${name}-${suffix}.svg`);
   else{const canvas=await raster(page.svg,page.w,page.h,page.dpi);download(await canvasPng(canvas,page.dpi),`${name}-${suffix}-${page.dpi}dpi.png`)}
  }
  return;
 }
 const {items,options:preparedOptions,production}=prepareExport(p,opts),canvases=new Map();
 for(const item of items){if(production&&canvases.has(item.svg))item.canvas=canvases.get(item.svg);else{item.canvas=await raster(item.svg,item.w,item.h,production?item.dpi:opts.dpi);if(production)canvases.set(item.svg,item.canvas)}}
 const plan=production?{w:items[0].w,h:items[0].h,pages:items.map((r,item)=>[{item,x:0,y:0,rotation:r.rotation||0}])}:printLayout(items,preparedOptions);
 if(opts.format==='print'){
  const host=document.getElementById('printarea');host.innerHTML='';
  let style=document.getElementById('print-page-style');if(!style){style=document.createElement('style');style.id='print-page-style';document.head.append(style)}
  style.textContent=`@media print{@page{size:${plan.w}mm ${plan.h}mm;margin:0}html,body{margin:0!important;padding:0!important}#printarea .print-page{position:relative;width:${plan.w}mm;height:${plan.h}mm;break-after:page;overflow:hidden}#printarea .print-page:last-child{break-after:auto}#printarea img{position:absolute;margin:0!important;max-width:none!important}}`;
  for(const page of plan.pages){const section=document.createElement('section');section.className='print-page';host.append(section);for(const pos of page){const r=items[pos.item],img=new Image();img.src=r.canvas.toDataURL('image/png');Object.assign(img.style,{left:pos.x+'mm',top:pos.y+'mm',width:r.w+'mm',height:r.h+'mm',transform:`rotate(${pos.rotation}deg)`});if(pos.clip){const cell=document.createElement('div');Object.assign(cell.style,{position:'absolute',left:pos.clip.x+'mm',top:pos.clip.y+'mm',width:pos.clip.w+'mm',height:pos.clip.h+'mm',overflow:'hidden'});img.style.left=(pos.x-pos.clip.x)+'mm';img.style.top=(pos.y-pos.clip.y)+'mm';cell.append(img);section.append(cell)}else section.append(img);await img.decode()}}
  window.print();return;
 }
 const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],orientation:plan.w>plan.h?'landscape':'portrait',compress:true});writePrintPages(doc,items,plan);doc.setProperties({title:p.title,subject:'Cassette Studio — print at 100%'});download(doc.output('blob'),`${name}.pdf`);
}
