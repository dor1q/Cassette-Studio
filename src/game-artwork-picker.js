import {coverGalleryPicker} from './cover-gallery-picker.js';

export async function gameArtworkPicker({project,modal,request,esc,activeProject,onChoose,onConnections}){
 modal('Поиск картинок для фона',`<p class="hint">Иллюстрации игр из IGDB и SteamGridDB. Для поиска настройте выбранный каталог в «Подключениях». Картинка добавится отдельным фоновым слоем.</p><form id="gameArtworkForm"><div class="two"><label class="field">Каталог<select id="gameArtworkProvider"><option value="igdb">IGDB</option><option value="steamgriddb">SteamGridDB</option></select></label><label class="field">Название игры<input id="gameArtworkQuery" minlength="2" maxlength="100" required placeholder="Название игры"></label></div><button id="gameArtworkSearch" class="primary" type="submit">Найти</button><button id="gameArtworkConnections" type="button">Настроить каталог</button></form><div id="gameArtworkResults"></div><p id="gameArtworkStatus" role="status"></p>`);
 const $=id=>document.getElementById(id),form=$('gameArtworkForm'),provider=$('gameArtworkProvider'),query=$('gameArtworkQuery'),button=$('gameArtworkSearch'),host=$('gameArtworkResults'),status=$('gameArtworkStatus');
 const active=()=>activeProject()&&document.getElementById('gameArtworkForm')===form&&$('modal').open;
 let revision=0,busy=false;
 $('gameArtworkConnections').onclick=onConnections;
 provider.onchange=()=>{revision++;host.innerHTML='';status.textContent=''};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!active())return;
  const q=query.value.trim(),catalog=provider.value,stamp=++revision;if(!q)return;
  busy=true;button.disabled=true;host.innerHTML='';status.textContent='Ищем изображения…';
  try{
   const games=await request('/api/artwork/search?'+new URLSearchParams({provider:catalog,q}));
   if(!active()||revision!==stamp)return;
   if(!games.length){status.textContent='По этому названию ничего не найдено';return}
   host.innerHTML=games.map((game,index)=>`<button type="button" data-game-artwork="${index}" class="wide">${esc(game.title)}${game.year?' · '+esc(game.year):''}</button>`).join('');
   status.textContent='Выберите игру';
   for(const choice of host.querySelectorAll('[data-game-artwork]'))choice.onclick=async()=>{
    if(busy||!active()||revision!==stamp)return;
    const game=games[Number(choice.dataset.gameArtwork)];busy=true;button.disabled=true;status.textContent='Загружаем коллекцию…';
    try{
     const images=await request('/api/artwork/images?'+new URLSearchParams({provider:catalog,id:game.id}));
     if(!active()||revision!==stamp)return;
     if(!images.length){status.textContent='У этой игры нет доступных изображений';return}
     await coverGalleryPicker({project,choices:images.map((image,index)=>({...image,index})),kind:'background',title:'Фон · '+game.title,modal,request,esc,activeProject,onChoose});
    }catch(error){if(active()&&revision===stamp)status.textContent=error.message}
    finally{busy=false;if(active())button.disabled=false}
   };
  }catch(error){if(active()&&revision===stamp)status.textContent=error.message}
  finally{busy=false;if(active())button.disabled=false}
 };
}
