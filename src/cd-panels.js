import {esc,time,total} from './model.js';
import {cdDimensions} from './cd-layout.js';

export function cdTextPanel(project,mode,surface,{field,btn}){
 const focus=(source,label)=>btn(label,'cd-focus-text',`data-source="${source}"`);
 let html='<fieldset class="cd-text-group"><legend>Название</legend>'+field('Исполнитель','artist',project.data.artist)+field('Альбом','album',project.data.album)+'<div class="row">'+focus('artist','Блок исполнителя')+focus('album','Блок альбома')+'</div></fieldset>';
 html+='<fieldset class="cd-text-group"><legend>Содержание '+(mode==='cd-insert'?'вкладыша':'CD')+'</legend>'+focus('cdTracks',mode==='cd-insert'?'Выбрать содержание на макете':'Выбрать треклист')+'<p class="hint">Список треков редактируется во вкладке «Треки». В правой панели выбранного блока можно скрыть отдельные части и настроить оформление.</p>';
 html+=field('Тексты песен · Markdown','lyrics',project.data.lyrics,'textarea');
 if(mode!=='cd-insert')html+=focus('lyrics','Блок текстов песен');
 html+=field('Выходные данные · Markdown','production',project.data.production,'textarea');
 if(mode!=='cd-insert')html+=focus('production','Блок выходных данных');
 html+='</fieldset>';
 if(mode==='cd-tray')html+='<fieldset class="cd-text-group"><legend>Корешки</legend><div class="row">'+(project.surfaces[surface]||[]).filter(layer=>layer.source==='cdSpine').map(layer=>btn(esc(layer.name),'select-layer',`data-id="${esc(layer.id)}"`)).join('')+'</div></fieldset>';
 html+='<fieldset class="cd-text-group"><legend>Дополнительный текст</legend>'+field('Подпись / лейбл','note',project.data.note)+focus('note','Блок подписи')+btn('＋ Добавить свой текст','add-text','class="wide"')+'</fieldset>';
 return html;
}

export function cdTracksPanel(project,{select,check,btn}){
 const tracks=[...project.data.A,...project.data.B],capacity=Number(project.settings.cdCapacity)||80;
 let html='<div class="row">'+btn('Текстом','cd-bulk')+btn('Открыть M3U','cd-m3u')+'</div>';
 html+=select('Вместимость CD','cdCapacity',capacity,[[74,'74 минуты'],[80,'80 минут']]);
 html+=`<div class="capacity ${total(tracks)>capacity*60?'over':''}"><b>Треки CD</b><span>${time(total(tracks))} / ${capacity}:00</span></div>`;
 html+=tracks.map((track,index)=>`<div class="trackrow" draggable="true" data-track="${index}"><span class="tracknum">${index+1}</span><input data-cd-track-field="title" data-i="${index}" value="${esc(track.title)}" aria-label="Трек ${index+1}"><input data-cd-track-field="seconds" data-i="${index}" value="${time(track.seconds)}" aria-label="Длительность ${index+1}"><input data-cd-track-field="artist" data-i="${index}" value="${esc(track.artist)}" placeholder="Исполнитель" aria-label="Исполнитель трека ${index+1}" style="grid-column:2/4"><div class="trackactions">${btn('↑','cd-track-up',`data-i="${index}"`)}${btn('↓','cd-track-down',`data-i="${index}"`)}${btn('✕','cd-track-delete',`data-i="${index}"`)}</div></div>`).join('');
 html+=btn('＋ Добавить трек','cd-add-track','class="wide"')+'<div class="section row">'+check('Номера','numbers',project.settings.numbers)+check('Длительность','durations',project.settings.durations)+check('Исполнители','artists',project.settings.artists)+check('Разделители','bullets',project.settings.bullets)+'</div>';
 return html+btn('Скачать M3U','export-m3u','class="wide"');
}

export function cdLayoutPanel(project,mode,{field,select,check,btn}){
 const layout=project.layout;let html='';
 if(mode==='cd-label'){
  html=select('Печать диска','cdLabelHub',layout.cdLabelHub?'1':'0',[['0','Standard · отверстие 36,9 мм'],['1','Hub · отверстие 15 мм']],'layout');
  html+='<div class="two">'+field('Диаметр наклейки, мм','cdLabelDiameter',layout.cdLabelDiameter,'number','min="80" max="120" step="0.1"','layout')+field('Отверстие, мм','cdLabelHole',layout.cdLabelHole,'number',`min="0" max="60" step="0.1" ${layout.cdLabelHub?'disabled':''}`,'layout')+'</div>';
  html+=select('Расположение треков','cdTrackLayout',layout.cdTrackLayout,[['bottom','Внизу'],['right','Справа'],['circular','По кругу']],'layout');
  html+='<p class="hint">Центр и область вокруг диска прозрачные. Контуры видны в редакторе и добавляются в файл только по выбранной настройке экспорта.</p>';
 }else if(mode==='cd-insert'){
  html=select('Панели вкладыша','cdInsertPanels',layout.cdInsertPanels,[[1,'1 · передняя обложка'],[2,'2 · складной вкладыш'],[3,'3 · складной вкладыш']],'layout')+check('Двусторонний вкладыш','cdInsertDouble',layout.cdInsertDouble,'layout');
  html+=field('Высота, мм','cdInsertHeight',layout.cdInsertHeight,'number','min="100" max="130" step="0.1"','layout');
  const noContents=Number(layout.cdInsertPanels)===1&&!layout.cdInsertDouble;
  html+=`<fieldset class="cd-content-options" ${noContents?'disabled':''}><legend>Содержание вкладыша</legend><div class="two">`+select('Колонки содержания','columns',layout.columns,[[1,'Одна'],[2,'Две']],'layout')+field('Высота колонок, %','columnHeight',layout.columnHeight,'number','min="20" max="100" step="1"','layout')+'</div></fieldset>';
  if(noContents)html+='<p class="hint">В односторонней обложке нет панелей содержания. Включите оборот или добавьте панель для треков и текстов.</p>';
  html+='<p class="hint">Панель обложки — 120,65 мм. У вкладыша на три панели внутренний клапан чуть уже, чтобы он складывался свободно.</p>';
 }else{
  html='<div class="row">'+check('Левый корешок','cdTrayLeftSpine',layout.cdTrayLeftSpine,'layout')+check('Правый корешок','cdTrayRightSpine',layout.cdTrayRightSpine,'layout')+check('Печатать внутреннюю сторону','cdTrayDouble',layout.cdTrayDouble,'layout')+'</div>';
  html+='<div class="two">'+field('Полная ширина, мм','cdTrayWidth',layout.cdTrayWidth,'number','min="130" max="170" step="0.1"','layout')+field('Высота, мм','cdTrayHeight',layout.cdTrayHeight,'number','min="100" max="130" step="0.1"','layout')+field('Ширина корешка, мм','cdSpine',layout.cdSpine,'number','min="3" max="10" step="0.1"','layout')+'</div>';
  html+='<p class="hint">Полная ширина включает оба корешка. Отключённый корешок исключается из области печати; размер центральной панели сохраняется.</p>';
 }
 const size=cdDimensions(project,mode==='cd-label'?'cdLabel':mode==='cd-insert'?'cdFront':'cdTray');
 html+=`<p class="hint">Размер макета: ${size.w.toFixed(2)} × ${size.h.toFixed(2)} мм.</p>`+btn('Вернуть стандартные размеры','cd-standard','class="wide"')+btn('Переразместить стандартные блоки','cd-reset-blocks','class="wide"');
 return html+'<div class="section">'+check('Линии реза','cutGuides',project.settings.cutGuides!==false)+check('Линии сгиба','foldGuides',project.settings.foldGuides!==false)+select('Единицы на линейке','units',project.settings.units,[['mm','Миллиметры'],['in','Дюймы']])+field('Вылет под обрез, мм','bleed',project.settings.bleed,'number','min="0" max="5" step="0.5"','settings')+'<p class="hint">Для печати используйте масштаб 100%. Сначала проверьте посадку чистым шаблоном.</p></div>';
}
