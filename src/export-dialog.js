import {esc,dimensions,clamp} from './model.js';
import {productionChoices,isProductionSheet} from './production-print.js';
import {normalizeEditorMode,isCDMode,modeTitle,modeDefaultSurface} from './media-formats.js';
import {printLayout} from './print-layout.js';

// Use the printing plan itself so early paper advice has the same margins,
// rotation, bleed and copy spacing as the file that will be downloaded.
export function cdPrintPaperState(p,{mode=p.editorMode,paper='a4',sheet='auto',copies=1,bleed=0,offsetX=0,offsetY=0}={}){
 mode=normalizeEditorMode(mode);if(!isCDMode(mode))return null;
 const size=dimensions(p,modeDefaultSurface(mode)),amount=clamp(bleed,0,5),items=[{...size,w:size.w+2*amount,h:size.h+2*amount}];
 const options={mode,sheet,copies:clamp(copies,1,30),bleed:amount,offsetX:clamp(offsetX,-20,20),offsetY:clamp(offsetY,-20,20)};
 const fit=chosen=>{try{return {fits:true,plan:printLayout(items,{...options,paper:chosen})}}catch(error){return {fits:false,error:error.message}}};
 const current=fit(paper);if(current.fits)return {...current,paper,suggestedPaper:paper};
 const suggestedPaper=['a4','letter','a3','legal','tabloid','custom'].find(chosen=>chosen!==paper&&fit(chosen).fits)||null;
 return {...current,paper,suggestedPaper};
}

export function exportControlState(p,{mode=p.editorMode,sheet='auto',selection='all'}={}){
 mode=normalizeEditorMode(mode);const production=!isCDMode(mode)&&isProductionSheet(sheet),sheet12=mode==='label'&&(sheet==='12up'||sheet==='12up-trim'),shell=mode==='label'&&['body','full'].includes(p.layout.printArea),cdLetter=mode==='cd-label'&&sheet==='cd-letter-2up';
 return {production,sheet12,shell,cdLetter,frontOnly:sheet==='chalkpit-jcard-8up',fixedPaper:production||sheet12||cdLetter,paper:production?'template':sheet12||cdLetter?'letter':null,fixedBleed:production||shell||sheet==='12up-trim'||cdLetter,bleed:shell||sheet==='12up-trim'||cdLetter?0:production?3.175:null,fixedOffset:production||cdLetter,dpi:cdLetter?600:production?(sheet==='chalkpit-jcard-8up'?300:600):null,copies:cdLetter||sheet==='cd-2up'||(isCDMode(mode)&&sheet==='2up')?2:sheet12?(selection==='all'?6:12):null,quantityLabel:production?'Количество листов каждой стороны':mode==='cd-label'?'Количество дисков':'Количество комплектов'};
}
export function exportDialogHtml(p,{mode=p.editorMode,blank=false}={}){
 mode=normalizeEditorMode(mode);const cd=isCDMode(mode),options=cd?[]:productionChoices(p,mode),shell=mode==='label'&&['body','full'].includes(p.layout.printArea);
 const sheetOptions=mode==='cd-label'?'<option value="cd-2up">2 диска на страницу · A4 / Letter</option><option value="cd-letter-2up">OL1200 / Avery 8692 · 2 диска · Letter</option>':mode==='label'?(shell?'':'<option value="12up">12 наклеек · Letter · с вылетами</option><option value="12up-trim">12 наклеек · Letter · без вылетов</option>'):'<option value="2up">2 вкладыша на страницу</option>';
 const double=mode==='cd-insert'?p.layout.cdInsertDouble===true:mode==='cd-tray'?p.layout.cdTrayDouble===true:p.layout.double;
 const allLabel=mode==='label'?'Обе стороны':mode==='cd-label'?modeTitle(mode):'Лицевая'+(double?' и оборот':'');
 const dpiOptions=(cd?[600,300,150]:[300,150,600]).map(dpi=>`<option>${dpi}</option>`).join('');
 const btn=(label,format,primary=false)=>`<button type="button" data-action="run-export" data-format="${format}"${primary?' class="primary"':''}>${label}</button>`;
 return `<div class="two"><label class="field">Стороны<select id="exportSelection"><option value="all">${esc(allLabel)}</option><option value="current">Только текущая</option></select></label><label class="field">Раскладка<select id="exportSheet"><option value="auto">Обычная</option>${sheetOptions}${options.map(option=>`<option value="${option.value}">${esc(option.label)}</option>`).join('')}</select></label><label class="field">Лист PDF<select id="exportPaper"><option value="a4">A4</option><option value="letter">Letter</option><option value="a3">A3</option><option value="legal">Legal</option><option value="tabloid">Tabloid</option><option value="custom">По размеру макета</option><option value="template" hidden>Размер производственного шаблона</option></select></label><label class="field"><span id="exportQuantityLabel">Количество комплектов</span><input id="exportCopies" type="number" min="1" max="30" value="1"></label><label class="field">Разрешение PNG<select id="exportDpi">${dpiOptions}</select></label></div><p id="exportLayoutHint" class="hint">PDF печатается при 100%. Для большого разворота выберите лист по размеру макета.</p><label class="inlinecheck"><input id="exportGuides" type="checkbox" ${blank?'checked disabled':''}> Добавить линии реза и сгиба в файл</label><p class="hint">${blank?'Чистый шаблон содержит контуры для вырезания и линии сгиба.':'Для экспорта без серой обводки оставьте выключенными. Производственные раскладки содержат метки шаблона.'}</p><details class="inspector-section"><summary>Настройки печати</summary><div class="inspector-section-body"><div class="two"><label class="field">Переворот листа<select id="exportDuplex"><option value="long">По длинному краю</option><option value="short">По короткому краю</option></select></label><label class="field">Вылет, мм<input id="exportBleed" type="number" min="0" max="5" step=".5" value="${blank?0:p.settings.bleed}"></label><label class="field">Сдвиг печати X, мм<input id="exportOffsetX" type="number" value="0" min="-20" max="20" step="0.1"></label><label class="field">Сдвиг печати Y, мм<input id="exportOffsetY" type="number" value="0" min="-20" max="20" step="0.1"></label></div></div></details><details class="inspector-section"><summary>Письмо для типографии</summary><div class="inspector-section-body"><p class="hint">PDF с размерами, раскладкой, количеством, вылетами и местом для подписи. Укажите ссылку, которую нужно поместить в QR.</p><label class="field">Лист письма<select id="printShopPaper"><option value="a4">A4</option><option value="letter">Letter</option></select></label><label class="inlinecheck"><input id="printShopQr" type="checkbox" ${p.data.url?'checked':''}> Добавить QR-ссылку</label><label class="field">Ссылка для QR<input id="printShopUrl" type="url" maxlength="2000" placeholder="Ссылка на альбом или опубликованный макет" value="${esc(p.data.url||'')}"></label>${btn('Скачать письмо PDF','printshop')}</div></details><input id="exportBlank" type="hidden" value="${blank?'1':'0'}"><div class="row export-dialog-actions">${btn('Скачать PDF','pdf',true)}${btn('PNG','png')}${mode==='cd-label'?btn('PNG для печати CD','cd-print-ready'):''}${btn('SVG','svg')}${btn('Копировать картинку','clipboard')}${btn('Печать','print')}</div><p id="exportStatus" role="status"></p>`;
}
export function bindExportDialog(p,{mode=p.editorMode,blank=false,get=id=>document.getElementById(id)}={}){
 mode=normalizeEditorMode(mode);const ordinary=sheet=>['auto','2up','cd-2up'].includes(sheet);
 let lastSheet='auto',previous={},manualPaper=false;
 const sides=get('exportSelection'),allLabel=sides.options?.[0]?.textContent;let previousSelection=sides.value;
 function sync({resetCopies=false,choosePaper=false}={}){
  const sheet=get('exportSheet').value;let state=exportControlState(p,{mode,sheet,selection:sides.value}),restoringOrdinary=false;
  if(sheet!==lastSheet){
   if(ordinary(lastSheet))previous={paper:get('exportPaper').value,bleed:get('exportBleed').value,dpi:get('exportDpi').value,offsetX:get('exportOffsetX').value,offsetY:get('exportOffsetY').value,guides:get('exportGuides').checked};
   restoringOrdinary=ordinary(sheet)&&!ordinary(lastSheet);
   if(restoringOrdinary)for(const [key,value] of Object.entries(previous)){const field=get({paper:'exportPaper',bleed:'exportBleed',dpi:'exportDpi',offsetX:'exportOffsetX',offsetY:'exportOffsetY',guides:'exportGuides'}[key]);if(key==='guides')field.checked=value;else field.value=value}
   if(state.frontOnly){previousSelection=sides.value;sides.value='all'}else if(lastSheet==='chalkpit-jcard-8up')sides.value=previousSelection;
   lastSheet=sheet;
  }
  state=exportControlState(p,{mode,sheet,selection:sides.value});
  sides.disabled=state.frontOnly;if(sides.options?.[0])sides.options[0].textContent=state.frontOnly?'Только лицевая':allLabel;
  get('exportPaper').disabled=state.fixedPaper;if(state.paper)get('exportPaper').value=state.paper;
  get('exportBleed').disabled=state.fixedBleed;if(state.bleed!==null)get('exportBleed').value=String(state.bleed);
  for(const key of ['exportOffsetX','exportOffsetY']){get(key).disabled=state.fixedOffset;if(state.fixedOffset)get(key).value='0'}
  get('exportDpi').disabled=state.production||state.cdLetter;if(state.dpi)get('exportDpi').value=String(state.dpi);
  get('exportGuides').disabled=state.production||blank;if(blank)get('exportGuides').checked=true;else if(state.production)get('exportGuides').checked=false;
  const double=mode==='cd-insert'?p.layout.cdInsertDouble===true:mode==='cd-tray'?p.layout.cdTrayDouble===true:mode==='jcard'&&p.layout.double===true;
  get('exportDuplex').disabled=!double||sheet==='chalkpit-jcard-8up';
  get('exportQuantityLabel').textContent=state.quantityLabel;
  if(resetCopies)get('exportCopies').value=String(state.copies||1);
  const paperState=()=>cdPrintPaperState(p,{mode,sheet,paper:get('exportPaper').value,copies:get('exportCopies').value,bleed:get('exportBleed').value,offsetX:get('exportOffsetX').value,offsetY:get('exportOffsetY').value});
  let fit=paperState();
  if(choosePaper&&!manualPaper&&!restoringOrdinary&&!state.fixedPaper&&fit&&!fit.fits&&fit.suggestedPaper){get('exportPaper').value=fit.suggestedPaper;fit=paperState()}
  get('exportLayoutHint').textContent=state.cdLetter?'OL1200 / Avery 8692 · Letter · два CD Label стандартного размера. Печатайте при 100%, без подгонки страницы.':sheet==='cd-2up'?'Два диска располагаются по центру листа. Для готовых наклеек OL1200 / Avery 8692 выберите их шаблон Letter.':mode==='cd-insert'&&p.layout.cdInsertPanels===3?'Три панели CD Insert. Печатайте при 100%, без подгонки страницы.'+(double?' Лицевая и оборот печатаются на отдельных страницах с одинаковыми позициями.':''):sheet==='chalkpit-jcard-8up'?'8 лицевых J-card на SRA3. Оборот в этой раскладке не печатается; размеры и позиции задаёт шаблон.':sheet==='chalkpit-cassette-4up'?'4 корпуса на листе для каждой выбранной стороны. Позиции фиксированы шаблоном Chalkpit.':state.production?'Размеры, вылеты и линии реза задаёт шаблон Chalkpit. Перед тиражом проверьте посадку.':state.sheet12?'Letter · 88,6 × 41,8 мм. 6 комплектов A/B заполняют лист. Проверьте посадку на пробном листе.':'PDF печатается при 100%. PNG и SVG при обычной раскладке сохраняют отдельные стороны; при выборе раскладки сохраняется весь лист.';
  if(fit&&!fit.fits){const names={a4:'A4',letter:'Letter',a3:'A3',legal:'Legal',tabloid:'Tabloid',custom:'лист по размеру макета'},advice=fit.suggestedPaper&&!state.fixedPaper?` Выберите ${names[fit.suggestedPaper]}.`:'';get('exportLayoutHint').textContent=`${fit.error}${advice} ${get('exportLayoutHint').textContent}`}
  else if(fit){const mm=value=>Number(value.toFixed(2));get('exportLayoutHint').textContent+=` Лист: ${mm(fit.plan.w)} × ${mm(fit.plan.h)} мм. Размер макета сохраняется.`}
 }
 get('exportSheet').onchange=()=>sync({resetCopies:true,choosePaper:true});get('exportSelection').onchange=()=>sync({resetCopies:true});
 get('exportPaper').onchange=()=>{manualPaper=true;sync()};
 for(const key of ['exportBleed','exportCopies','exportOffsetX','exportOffsetY']){get(key).oninput=()=>sync();get(key).onchange=()=>sync()}
 sync({choosePaper:true});
}
