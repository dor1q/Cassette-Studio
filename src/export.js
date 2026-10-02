import {writePrintPages} from './print-pdf.js';
import {printLayout} from './print-layout.js';
import {jsPDF} from 'jspdf';
import {renderSvg} from './render.js';
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)}
export async function raster(svg,w,h,dpi=300){await document.fonts.ready;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();await new Promise((yes,no)=>{img.onload=yes;img.onerror=()=>no(Error('Не удалось отрисовать изображение'));img.src=url});const c=document.createElement('canvas');c.width=Math.round(w/25.4*dpi);c.height=Math.round(h/25.4*dpi);if(c.width*c.height>65000000)throw Error('Слишком большой макет. Уменьшите dpi.');c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c}finally{URL.revokeObjectURL(url)}}
export function surfaceSet(p,mode,surface,selection){if(selection==='current')return [surface];return mode==='label'?['labelA','labelB']:p.layout.double?['outer','inner']:['outer']}
export async function exportProject(p,{format='pdf',mode='jcard',surface='outer',selection='all',blank=false,bleed=0,dpi=300,paper='a4',copies=1,guides=true,sheet='auto',offsetX=0,offsetY=0,duplexFlip='long'}){const surfaces=surfaceSet(p,mode,surface,selection),items=[];for(const s of surfaces){const r=renderSvg(p,s,{blank,bleed,guides});if(r.warnings.length&&!blank)throw Error(r.warnings.join('\n'));items.push({s,...r})}const name=(p.title||p.data.album||'cassette').replace(/[<>:"/\\|?*]/g,'-');
if(format==='svg'){for(const r of items)download(new Blob([r.svg],{type:'image/svg+xml'}),`${name}-${r.s}.svg`);return}
for(const r of items)r.canvas=await raster(r.svg,r.w,r.h,dpi);
if(format==='png'){for(const r of items){const b=await new Promise(resolve=>r.canvas.toBlob(resolve,'image/png'));download(b,`${name}-${r.s}-${dpi}dpi.png`)}return}
const plan=printLayout(items,{mode,paper,copies,bleed,sheet,offsetX,offsetY,duplexFlip});
if(format==='print'){
 const host=document.getElementById('printarea');host.innerHTML='';
 let style=document.getElementById('print-page-style');if(!style){style=document.createElement('style');style.id='print-page-style';document.head.append(style)}
 style.textContent=`@media print{@page{size:${plan.w}mm ${plan.h}mm;margin:0}html,body{margin:0!important;padding:0!important}#printarea .print-page{position:relative;width:${plan.w}mm;height:${plan.h}mm;break-after:page;overflow:hidden}#printarea .print-page:last-child{break-after:auto}#printarea img{position:absolute;margin:0!important;max-width:none!important}}`;
 for(const page of plan.pages){const section=document.createElement('section');section.className='print-page';host.append(section);for(const pos of page){const r=items[pos.item],img=new Image();img.src=r.canvas.toDataURL('image/png');Object.assign(img.style,{left:pos.x+'mm',top:pos.y+'mm',width:r.w+'mm',height:r.h+'mm',transform:`rotate(${pos.rotation}deg)`});if(pos.clip){const cell=document.createElement('div');Object.assign(cell.style,{position:'absolute',left:pos.clip.x+'mm',top:pos.clip.y+'mm',width:pos.clip.w+'mm',height:pos.clip.h+'mm',overflow:'hidden'});img.style.left=(pos.x-pos.clip.x)+'mm';img.style.top=(pos.y-pos.clip.y)+'mm';cell.append(img);section.append(cell)}else section.append(img);await img.decode()}}
 window.print();return;
}
const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],orientation:plan.w>plan.h?'landscape':'portrait',compress:true});
writePrintPages(doc,items,plan);
doc.setProperties({title:p.title,subject:'Cassette Studio — print at 100%'});download(doc.output('blob'),`${name}.pdf`)}
