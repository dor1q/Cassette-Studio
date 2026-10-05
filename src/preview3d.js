import {renderSvg} from './render.js';
import {raster} from './export.js';
import {clamp} from './model.js';
import {isCDMode} from './media-formats.js';
import {cdLabelGeometry} from './cd-layout.js';
import {previewGeometry,previewCrop,previewFitScale,MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE} from './preview-geometry.js';
import {cassetteFaceSvg,svgImageUrl} from './preview-cassette.js';

function cropFace(canvas,face){
 const crop=previewCrop(canvas,face);
 const output=document.createElement('canvas');
 output.width=crop.width;
 output.height=crop.height;
 output.getContext('2d').drawImage(canvas,crop.sourceX,0,crop.sourceWidth,canvas.height,0,0,output.width,output.height);
 return output.toDataURL('image/png');
}

export async function show3DPreview(project,mode,modal){
 const geometry=previewGeometry(project,mode);
 const cd=isCDMode(mode),disc=mode==='cd-label';
 const surfaces=cd?(disc?['cdLabel','cdLabel']:mode==='cd-insert'?['cdFront','cdInside']:['cdTray','cdTrayInside']):mode==='label'?['labelA','labelB']:['outer','inner'];
 const images=[];
 for(const side of surfaces){const image=renderSvg(project,side,{guides:false});images.push(await raster(image.svg,image.w,image.h,100))}
 let front=images[0].toDataURL('image/png'),back=images[1].toDataURL('image/png'),spine='';
 const discGeometry=disc?cdLabelGeometry(project):null,discHole=disc?discGeometry.holeDiameter/discGeometry.frame*50:0;
 if(disc)back=svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#ddd"/><stop offset=".3" stop-color="#818a93"/><stop offset=".48" stop-color="#f0f0ea"/><stop offset=".65" stop-color="#b1b8bd"/><stop offset="1" stop-color="#eee"/></linearGradient></defs><circle cx="60" cy="60" r="59.3" fill="url(#metal)"/><circle cx="60" cy="60" r="22" fill="none" stroke="#777" stroke-opacity=".4"/><circle cx="60" cy="60" r="8" fill="none" stroke="#777"/></svg>');
 if(mode==='label'){
  front=svgImageUrl(cassetteFaceSvg(project,'labelA',front));
  back=svgImageUrl(cassetteFaceSvg(project,'labelB',back));
 }
 if(mode==='jcard'||cd&&!disc){
  front=cropFace(images[0],geometry.faces.front);
  back=cropFace(images[1],geometry.faces.back);
  if(geometry.faces.spine)spine=cropFace(images[0],geometry.faces.spine);
 }
 modal('3D · предварительный вид',`<div class="three-d" id="threeDStage" data-background="gradient" aria-label="Повернуть макет перетаскиванием"><div id="model3d" class="model3d ${mode==='label'?'cassette':disc?'cd-disc':cd?'cd-case':'norelco'}" style="--cd-hole:${discHole}%;--model-width:${geometry.width}px;--model-height:${geometry.height}px;--model-depth:${geometry.depth}px"><div class="face front"><img src="${front}" alt="Лицевая сторона">${mode==='jcard'?'<i class="case-lens" aria-hidden="true"></i>':''}</div><div class="face back"><img src="${back}" alt="Обратная сторона">${mode==='jcard'?'<i class="case-lens" aria-hidden="true"></i>':''}</div><div class="face spine">${spine?`<img src="${spine}" alt="Корешок">`:''}</div><div class="face top"></div><div class="face bottom"></div><div class="face edge"></div>${mode==='jcard'?'<i class="case-hinge upper" aria-hidden="true"></i><i class="case-hinge lower" aria-hidden="true"></i><i class="case-latch" aria-hidden="true"></i>':''}</div></div><div class="row preview-actions"><button id="previewFront">Лицевая</button><button id="previewBack">Обратная</button><button id="previewReset">Сбросить вид</button><label class="inlinecheck"><input id="previewSpin" type="checkbox" checked>Автовращение</label><label class="inlinecheck"><input id="previewFullscreen" type="checkbox">Полный экран</label></div><fieldset class="preview-background"><legend>Фон предпросмотра</legend>${[['light','Светлый'],['dark','Тёмный'],['green','Хромакей'],['gradient','Градиент']].map(([value,name])=>`<label class="inlinecheck"><input type="radio" name="previewBackground" value="${value}" ${value==='gradient'?'checked':''}>${name}</label>`).join('')}</fieldset><div class="two"><label class="field">Поворот<input id="rotate3d" type="range" min="-180" max="180" value="-28"></label><label class="field">Масштаб<input id="scale3d" type="range" min="${MIN_PREVIEW_SCALE}" max="${MAX_PREVIEW_SCALE}" value="${geometry.initialScale}"></label></div><p class="hint">Перетащите макет для поворота. Колесо мыши или жест двумя пальцами меняет масштаб. Корпус и коробка показаны приблизительно; для печати используются плоские развёртки с точными размерами.</p>`);
 const $=id=>document.getElementById(id),stage=$('threeDStage'),model=$('model3d'),rotation=$('rotate3d'),zoom=$('scale3d'),dialog=$('modal'),spin=$('previewSpin');
 dialog.classList.add('preview-dialog');$('modalBody').scrollTop=0;
 const fitScale=()=>previewFitScale(geometry,stage.clientWidth,stage.clientHeight);
 let yaw=-28,pitch=-12,scale=fitScale(),last=null,pinchDistance=0,frame=0,lastTime=0;
 const pointers=new Map();
 const update=()=>{model.style.transform=`rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${scale/100})`;rotation.value=String(((yaw+180)%360+360)%360-180);zoom.value=String(scale)};
 rotation.oninput=()=>{spin.checked=false;yaw=Number(rotation.value);update()};
 zoom.oninput=()=>{scale=Number(zoom.value);update()};
 $('previewFront').onclick=()=>{spin.checked=false;yaw=0;pitch=-12;update()};
 $('previewBack').onclick=()=>{spin.checked=false;yaw=180;pitch=-12;update()};
 $('previewReset').onclick=()=>{yaw=-28;pitch=-12;scale=fitScale();update()};
 $('previewFullscreen').onchange=e=>dialog.classList.toggle('preview-fullscreen',e.target.checked);
 document.querySelectorAll('[name="previewBackground"]').forEach(input=>input.onchange=()=>stage.dataset.background=input.value);
 stage.addEventListener('wheel',event=>{event.preventDefault();scale=clamp(scale*Math.exp(-event.deltaY*.001),MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);update()},{passive:false});
 const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
 stage.onpointerdown=event=>{if(event.button!==0)return;last={x:event.clientX,y:event.clientY};pointers.set(event.pointerId,last);if(pointers.size===2)pinchDistance=distance();stage.setPointerCapture(event.pointerId);stage.classList.add('dragging')};
 stage.onpointermove=event=>{if(!pointers.has(event.pointerId))return;const next={x:event.clientX,y:event.clientY};pointers.set(event.pointerId,next);if(pointers.size>=2){const d=distance();if(pinchDistance>0)scale=clamp(scale*d/pinchDistance,MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);pinchDistance=d}else if(last){yaw+=(next.x-last.x)*.7;pitch=clamp(pitch-(next.y-last.y)*.45,-75,75)}last=next;update()};
 const stop=event=>{pointers.delete(event.pointerId);last=pointers.size?[...pointers.values()][0]:null;pinchDistance=0;if(!last)stage.classList.remove('dragging')};
 stage.onpointerup=stop;stage.onpointercancel=stop;
 const cleanup=()=>{cancelAnimationFrame(frame);dialog.classList.remove('preview-fullscreen','preview-dialog');pointers.clear()};
 dialog.addEventListener('close',cleanup,{once:true});
 const tick=now=>{if(!dialog.open||!stage.isConnected){cleanup();dialog.removeEventListener('close',cleanup);return}if(spin.checked&&!pointers.size){yaw+=Math.min(50,now-(lastTime||now))*.015;update()}lastTime=now;frame=requestAnimationFrame(tick)};
 update();frame=requestAnimationFrame(tick);
}
