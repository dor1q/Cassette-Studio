import {loadGalleryChoice} from './cover-gallery.js';

export async function coverGalleryPicker({project,choices,kind='cover',title:customTitle='',modal,request,esc,activeProject,onChoose}){
 const title=customTitle||(kind==='background'?'Изображения альбома для фона':'Обложки альбома');
 if(!choices?.length){modal(title,'<p>Сначала импортируйте альбом или плейлист со ссылкой.</p>');return}
 modal(title,'<p class="hint">Изображение применяется к текущей стороне. При синхронизации A/B обе наклейки используют общий дизайн.</p><div class="row"><button id="coverPagePrevious">←</button><span id="coverPageLabel" role="status"></span><button id="coverPageNext">→</button></div><div id="coverGalleryGrid" class="tiles cover-gallery-grid"></div><p id="coverGalleryStatus" role="status"></p>');
 const host=document.getElementById('coverGalleryGrid'),status=document.getElementById('coverGalleryStatus'),label=document.getElementById('coverPageLabel'),previous=document.getElementById('coverPagePrevious'),next=document.getElementById('coverPageNext');
 const active=()=>activeProject()&&document.getElementById('coverGalleryGrid')===host&&document.getElementById('modal').open;
 let page=0,revision=0,busy=false;const pageSize=24,cache=new Map();
 const image=async choice=>{if(cache.has(choice.index))return cache.get(choice.index);const loaded=await loadGalleryChoice(project,choice,request);cache.set(choice.index,loaded);if(cache.size>32)cache.delete(cache.keys().next().value);return loaded};
 function show(){
  const stamp=++revision,batch=choices.slice(page*pageSize,(page+1)*pageSize);previous.disabled=page===0;next.disabled=(page+1)*pageSize>=choices.length;
  label.textContent=`${page+1} / ${Math.ceil(choices.length/pageSize)} · ${choices.length} изображений`;status.textContent='Загрузка изображений…';
  host.innerHTML=batch.map(choice=>`<button data-gallery-index="${choice.index}" ${choice.file_path?'':'disabled'}><span class="gallery-placeholder">${choice.file_path?'Загрузка…':'Недоступно'}</span><span>${esc(choice.index===0&&kind==='cover'?'Основная обложка':choice.label||'Изображение '+choice.index)}</span></button>`).join('');
  const buttons=[...host.querySelectorAll('[data-gallery-index]')];let cursor=0,missing=0;
  for(const button of buttons)button.onclick=async()=>{
   if(busy||!active())return;busy=true;buttons.forEach(b=>b.disabled=true);previous.disabled=true;next.disabled=true;status.textContent='Применение изображения…';
   try{const choice=choices.find(c=>c.index===Number(button.dataset.galleryIndex)),loaded=await image(choice);if(!active())return;await onChoose(choice,loaded);document.getElementById('modal').close()}
   catch(error){if(active()){status.textContent=error.message;buttons.forEach((b,i)=>b.disabled=!batch[i].file_path);previous.disabled=page===0;next.disabled=(page+1)*pageSize>=choices.length}}finally{busy=false}
  };
  Promise.all(Array.from({length:3},async()=>{
   while(cursor<batch.length&&active()&&revision===stamp){const index=cursor++,choice=batch[index];if(!choice.file_path)continue;
    try{const loaded=await image(choice);if(!active()||revision!==stamp)return;const img=new Image();img.src=loaded.src;img.alt=choice.label||'Изображение '+choice.index;buttons[index].firstElementChild.replaceWith(img)}
    catch{missing++;if(active()&&revision===stamp){buttons[index].firstElementChild.textContent='Недоступно';buttons[index].disabled=true}}
   }
  })).then(()=>{if(active()&&revision===stamp&&!busy)status.textContent=missing?'Не удалось загрузить: '+missing+'. Можно выбрать доступное изображение.':'Выберите изображение'});
 }
 previous.onclick=()=>{if(!busy&&page){page--;show()}};next.onclick=()=>{if(!busy&&(page+1)*pageSize<choices.length){page++;show()}};show();
}
