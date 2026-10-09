import {cdLabelSectionState} from './cd-label-text.js';
import {cdTrayPosterState} from './cd-tray-poster.js';
import {cdTrayFontState,cdTrayFontHint} from './cd-tray-font-ui.js';

// Update existing controls in place, retaining focus and a range drag in progress.
export function syncCDTools(project,mode,surface,panel,activeElement){
 if(!panel)return;
 if(mode==='cd-label')for(const control of panel.querySelectorAll('[data-cd-section]')){
  const state=cdLabelSectionState(project,control.dataset.cdSection);control.checked=state.visible;control.disabled=state.locked;
  const hint=panel.querySelector('[data-cd-section-lock="'+control.dataset.cdSection+'"]');if(hint)hint.hidden=!state.locked;
 }
 if(mode!=='cd-tray')return;
 const font=cdTrayFontState(project,surface),fontHint=panel.querySelector('[data-cd-tray-font-hint]'),fontButton=panel.querySelector('[data-cd-tray-auto-font]');
 if(fontHint)fontHint.textContent=cdTrayFontHint(font);if(fontButton)fontButton.disabled=!font||font.locked;
 const state=cdTrayPosterState(project,surface),fields=panel.querySelector('[data-cd-poster-controls]');if(fields)fields.disabled=!state||state.locked;
 const hint=panel.querySelector('[data-cd-poster-hint]');if(hint)hint.textContent=!state?'Добавьте обложку CD Tray.':state.locked?'Обложка закреплена. Снимите закрепление в «Слоях».':'Параметры меняют обложку только на открытой стороне. Обычная загрузка вписывает картинку целиком; пресет немного увеличивает её.';
 if(!state)return;
 for(const control of panel.querySelectorAll('[data-cd-poster]')){
  const key=control.dataset.cdPoster,value=Math.round(state[key]*100)/100;
  if(!Number.isFinite(value))continue;
  if(control!==activeElement)control.value=String(value);
  const output=panel.querySelector('[data-cd-poster-value="'+key+'"]');if(output)output.textContent=value;
 }
}
