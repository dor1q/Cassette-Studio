import {esc} from './model.js';
import {productionChoices,isProductionSheet} from './production-print.js';

export function exportControlState(p,{mode='jcard',sheet='auto',selection='all'}={}){
 const production=isProductionSheet(sheet),sheet12=sheet==='12up'||sheet==='12up-trim',shell=mode==='label'&&['body','full'].includes(p.layout.printArea);
 return {production,sheet12,shell,fixedPaper:production||sheet12,paper:production?'template':sheet12?'letter':null,fixedBleed:production||shell||sheet==='12up-trim',bleed:shell||sheet==='12up-trim'?0:production?3.175:null,fixedOffset:production,dpi:production?(sheet==='chalkpit-jcard-8up'?300:600):null,copies:sheet12?(selection==='all'?6:12):null,quantityLabel:production?'Количество листов каждой стороны':'Количество комплектов'};
}
export function exportDialogHtml(p,{mode='jcard',blank=false}={}){
 const options=productionChoices(p,mode),shell=mode==='label'&&['body','full'].includes(p.layout.printArea);
 const sheetOptions=mode==='label'?(shell?'':'<option value="12up">12 наклеек · Letter · с вылетами</option><option value="12up-trim">12 наклеек · Letter · без вылетов</option>'):'<option value="2up">2 вкладыша на страницу</option>';
 const btn=(label,format,primary=false)=>`<button type="button" data-action="run-export" data-format="${format}"${primary?' class="primary"':''}>${label}</button>`;
 return `<div class="two"><label class="field">Стороны<select id="exportSelection"><option value="all">${mode==='label'?'Обе стороны':'Лицевая'+(p.layout.double?' и оборот':'')}</option><option value="current">Только текущая</option></select></label><label class="field">Раскладка<select id="exportSheet"><option value="auto">Обычная</option>${sheetOptions}${options.map(option=>`<option value="${option.value}">${esc(option.label)}</option>`).join('')}</select></label><label class="field">Лист PDF<select id="exportPaper"><option value="a4">A4</option><option value="letter">Letter</option><option value="a3">A3</option><option value="legal">Legal</option><option value="tabloid">Tabloid</option><option value="custom">По размеру макета</option><option value="template" hidden>Размер производственного шаблона</option></select></label><label class="field"><span id="exportQuantityLabel">Количество комплектов</span><input id="exportCopies" type="number" min="1" max="30" value="1"></label><label class="field">Разрешение PNG<select id="exportDpi"><option>300</option><option>150</option><option>600</option></select></label></div><p id="exportLayoutHint" class="hint">PDF печатается при 100%. Для большого разворота выберите лист по размеру макета.</p><details class="inspector-section"><summary>Настройки печати</summary><div class="inspector-section-body"><div class="two"><label class="field">Переворот листа<select id="exportDuplex"><option value="long">По длинному краю</option><option value="short">По короткому краю</option></select></label><label class="field">Вылет, мм<input id="exportBleed" type="number" min="0" max="5" step=".5" value="${blank?0:p.settings.bleed}"></label><label class="field">Сдвиг печати X, мм<input id="exportOffsetX" type="number" value="0" min="-20" max="20" step="0.1"></label><label class="field">Сдвиг печати Y, мм<input id="exportOffsetY" type="number" value="0" min="-20" max="20" step="0.1"></label></div><label class="inlinecheck"><input id="exportGuides" type="checkbox" checked> Линии реза и сгиба</label></div></details><details class="inspector-section"><summary>Письмо для типографии</summary><div class="inspector-section-body"><p class="hint">PDF с размерами, раскладкой, количеством, вылетами и местом для подписи. Укажите ссылку, которую нужно поместить в QR.</p><label class="field">Лист письма<select id="printShopPaper"><option value="a4">A4</option><option value="letter">Letter</option></select></label><label class="inlinecheck"><input id="printShopQr" type="checkbox" ${p.data.url?'checked':''}> Добавить QR-ссылку</label><label class="field">Ссылка для QR<input id="printShopUrl" type="url" maxlength="2000" placeholder="Ссылка на альбом или опубликованный макет" value="${esc(p.data.url||'')}"></label>${btn('Скачать письмо PDF','printshop')}</div></details><input id="exportBlank" type="hidden" value="${blank?'1':'0'}"><div class="row export-dialog-actions">${btn('Скачать PDF','pdf',true)}${btn('PNG','png')}${btn('SVG','svg')}${btn('Копировать картинку','clipboard')}${btn('Печать','print')}</div><p id="exportStatus" role="status"></p>`;
}
export function bindExportDialog(p,{mode='jcard',get=id=>document.getElementById(id)}={}){
 let lastSheet='auto',previous={};
 function sync({resetCopies=false}={}){
  const sheet=get('exportSheet').value,state=exportControlState(p,{mode,sheet,selection:get('exportSelection').value});
  if(sheet!==lastSheet){
   if(lastSheet==='auto'||lastSheet==='2up')previous={paper:get('exportPaper').value,bleed:get('exportBleed').value,dpi:get('exportDpi').value};
   if(sheet==='auto'||sheet==='2up')for(const [key,value] of Object.entries(previous))get({paper:'exportPaper',bleed:'exportBleed',dpi:'exportDpi'}[key]).value=value;
   lastSheet=sheet;
  }
  get('exportPaper').disabled=state.fixedPaper;if(state.paper)get('exportPaper').value=state.paper;
  get('exportBleed').disabled=state.fixedBleed;if(state.bleed!==null)get('exportBleed').value=String(state.bleed);
  for(const key of ['exportOffsetX','exportOffsetY']){get(key).disabled=state.fixedOffset;if(state.fixedOffset)get(key).value='0'}
  get('exportDpi').disabled=state.production;if(state.dpi)get('exportDpi').value=String(state.dpi);
  get('exportGuides').disabled=state.production;if(state.production)get('exportGuides').checked=false;
  get('exportDuplex').disabled=mode==='label'||!p.layout.double||sheet==='chalkpit-jcard-8up';
  get('exportQuantityLabel').textContent=state.quantityLabel;
  if(resetCopies)get('exportCopies').value=String(state.copies||1);
  get('exportLayoutHint').textContent=sheet==='chalkpit-jcard-8up'?'8 лицевых J-card на SRA3. Оборот в этой раскладке не печатается; размеры и позиции задаёт шаблон.':sheet==='chalkpit-cassette-4up'?'4 корпуса на листе для каждой выбранной стороны. Позиции фиксированы шаблоном Chalkpit.':state.production?'Размеры, вылеты и линии реза задаёт шаблон Chalkpit. Перед тиражом проверьте посадку.':state.sheet12?'Letter · 88,6 × 41,8 мм. 6 комплектов A/B заполняют лист. Проверьте посадку на пробном листе.':'PDF печатается при 100%. PNG и SVG при обычной раскладке сохраняют отдельные стороны; при выборе раскладки сохраняется весь лист.';
 }
 get('exportSheet').onchange=()=>sync({resetCopies:true});get('exportSelection').onchange=()=>sync({resetCopies:true});sync();
}
