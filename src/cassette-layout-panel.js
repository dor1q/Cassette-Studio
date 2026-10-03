import {dimensions} from './model.js';
import {cassettePrintArea} from './cassette-shell.js';
export function cassetteLayoutPanel(p,{field,select,check,btn}){
 const area=cassettePrintArea(p.layout.printArea),size=dimensions(p,'labelA');
 let html=select('Область печати','printArea',area,[['label','Наклейка · Label'],['body','На корпусе · On Body'],['full','Весь корпус · Full Body']],'layout');
 html+=`<p class="hint">${area==='label'?'Наклейка с прозрачным центральным окном.':'Корпус '+size.w.toFixed(2)+' × '+size.h.toFixed(2)+' мм. Отверстия остаются прозрачными; размер корпуса фиксирован.'}</p><div class="row">`+check('Синхронизировать дизайн A / B','sync',p.layout.sync,'layout')+'</div>';
 if(area==='label')html+='<div class="row">'+check('Вырез под окно','hole',p.layout.hole,'layout')+'</div><div class="two">'+field('Ширина, мм','labelW',p.layout.labelW,'number','min="70" max="110" step="0.1"','layout')+field('Высота, мм','labelH',p.layout.labelH,'number','min="30" max="65" step="0.1"','layout')+field('Окно: ширина','holeW',p.layout.holeW,'number','min="10" max="90" step="0.1"','layout')+field('Окно: высота','holeH',p.layout.holeH,'number','min="5" max="30" step="0.1"','layout')+field('Окно: сдвиг X','holeOffsetX',p.layout.holeOffsetX||0,'number','min="-40" max="40" step="0.1"','layout')+field('Окно: отступ сверху','holeY',p.layout.holeY,'number','min="5" max="35" step="0.1"','layout')+'</div>';
 html+=btn('Вернуться к стандартной наклейке','standard-label','class="wide"')+'<div class="section">'+check('Линии реза','cutGuides',p.settings.cutGuides!==false)+select('Единицы на линейке','units',p.settings.units,[['mm','Миллиметры'],['in','Дюймы']]);
 if(area==='label')html+=field('Вылет под обрез, мм','bleed',p.settings.bleed,'number','min="0" max="5" step="0.5"','settings');
 html+='<p class="hint">Для проверки посадки сначала распечатайте чистый шаблон. Производственные раскладки находятся в «Экспорт / печать».</p></div>';
 return html;
}
