import {referenceJCardFontState} from './jcard-font.js';

export function jcardFontHint(state){
 if(!state)return '';
 const subject=state.album?'альбома':state.kind==='spine'?'корешка':'клапана';
 return (state.automatic?'Размер '+subject+' подобран по оригиналу':state.preset?'Размер '+subject+' задан в исходной ссылке':'Размер '+subject+' задан вручную')+' · '+Number(state.size.toFixed(3))+' мм';
}

export function jcardFontInspectorControls(project,layer,{btn,propCheck,album=false}={}){
 const state=referenceJCardFontState(project,layer,{album});
 if(!state)return album?'':propCheck('Автоподбор размера','autoFit');
 return '<div '+(album?'data-jcard-album-font-inspector':'data-jcard-font-inspector')+'><p class="hint">'+jcardFontHint(state)+'</p>'+btn('Вернуть авторазмер оригинала',album?'jcard-auto-album-font':'jcard-auto-font','class="wide" '+(state.locked?'disabled':''))+'</div>'+
  (album?'':propCheck('Вписывать текст в рамку','autoFit')+'<p class="hint">Размер зависит от длины '+(state.kind==='spine'?'названия и ширины корешка':'списка треков')+'. Введите размер в миллиметрах для ручной настройки.</p>');
}
