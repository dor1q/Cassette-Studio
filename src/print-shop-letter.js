import QRCode from 'qrcode';
import {dimensions,esc} from './model.js';
import {printLayout} from './print-layout.js';
import {isProductionSheet,productionPages,productionTemplate} from './production-print.js';
import {normalizeEditorMode,isCDMode,modeSurfaces,modeDefaultSurface,modeTitle} from './media-formats.js';
import {cdLabelGeometry,cdPanelRects} from './cd-layout.js';

const formatNumber=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
const sizes={a4:'A4',letter:'Letter',a3:'A3',legal:'Legal',tabloid:'Tabloid',custom:'По размеру макета'};
const sheets={auto:'Обычная', '2up':'Два вкладыша на листе','cd-2up':'Два CD Label на листе','cd-letter-2up':'OL1200 / Avery 8692 · 2 CD Label · Letter','12up':'12 наклеек на листе','12up-trim':'12 наклеек без вылетов','chalkpit-jcard':'Chalkpit · J-card','chalkpit-jcard-8up':'Chalkpit · 8 J-card · SRA3','chalkpit-cassette-4up':'Chalkpit · 4 кассеты'};
const maxText=(s,n=200)=>String(s||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
function wrap(text,limit=75){
 // Wide capitals and narrow URL punctuation must fit within the same margins.
 const units=value=>Array.from(value).reduce((n,char)=>n+(/[MWШЩЖЮ@%&]/.test(char)?1.65:/[ilI1 .,:;!'|]/.test(char)?.5:/[A-ZА-Я]/.test(char)?1.2:1),0);
 const lines=[];let line='';for(const word of String(text).split(/\s+/)){
  if(units((line+' '+word).trim())>limit&&line){lines.push(line);line=''}
  let rest='';for(const char of word){if(units(rest+char)>limit&&rest){if(line){lines.push(line);line=''}lines.push(rest);rest=''}rest+=char}
  if(rest)line+=(line?' ':'')+rest;
 }if(line)lines.push(line);return lines;
}
function qrLink(p,shareUrl){
 const value=String(shareUrl||p.data.url||'').trim();if(!value)return '';
 try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();if(value.length>2000)throw Error();return url.href}catch{throw Error('Для QR в письме нужна обычная ссылка http/https длиной до 2000 символов.')}
}
export function printShopSpecs(p,{mode=p.editorMode??p.mode,surface,selection='all',paper='a4',sheet='auto',bleed=0,copies=1,dpi,duplexFlip='long',shareUrl='',includeQr=true,offsetX=0,offsetY=0}={}){
 mode=normalizeEditorMode(mode);dpi=dpi??(isCDMode(mode)?600:300);const allowed=modeSurfaces(p,mode);surface=surface||modeDefaultSurface(mode);
 if(selection==='current'&&!allowed.includes(surface))throw Error('Выбранная сторона не относится к этому макету.');
 if(isCDMode(mode)&&isProductionSheet(sheet))throw Error('Производственные шаблоны кассет не подходят для CD.');
 if(['12up','12up-trim'].includes(sheet)&&mode!=='label')throw Error('Раскладка на 12 наклеек предназначена для кассет.');
 if(['cd-2up','cd-letter-2up'].includes(sheet)&&mode!=='cd-label')throw Error('Раскладка на два диска предназначена для CD Label.');
 const all=mode==='jcard'&&!p.layout.double?['outer']:mode==='cd-insert'&&p.layout.cdInsertDouble!==true?['cdFront']:mode==='cd-tray'&&p.layout.cdTrayDouble!==true?['cdTray']:allowed;
 const surfaces=sheet==='chalkpit-jcard-8up'?['outer']:selection==='current'?[surface]:all;
 if(sheet==='12up-trim')bleed=0;
 if(sheet==='cd-letter-2up'){paper='letter';bleed=0;dpi=600}
 if(mode==='label'&&['body','full'].includes(p.layout.printArea))bleed=0;
 const frames=surfaces.map(s=>({s,...dimensions(p,s)}));
 const items=frames.map(f=>({...f,w:f.w+2*bleed,h:f.h+2*bleed}));
 let page,finished=frames[0],pageCount;
 if(isProductionSheet(sheet)){
  if(Number(offsetX)||Number(offsetY))throw Error('В производственном шаблоне позиции фиксированы. Уберите сдвиг печати.');
  const pages=productionPages(p,frames.map(f=>({...f,svg:'<svg/>',warnings:[]})),{sheet,copies,duplexFlip});
  page={w:pages[0].w,h:pages[0].h};pageCount=pages.length;dpi=pages[0].dpi;
  if(mode==='jcard'){const t=productionTemplate(p.layout.panels);finished=sheet==='chalkpit-jcard-8up'?{w:pages[0].seats[0].w*page.w/pages[0].pixelWidth,h:pages[0].seats[0].h*page.h/pages[0].pixelHeight}:{w:t.trim.w*25.4/600,h:t.trim.h*25.4/600};bleed=sheet==='chalkpit-jcard-8up'?22*25.4/300:Math.min(t.trim.x,t.trim.y)*25.4/600}else bleed=0;
 }else{
  const plan=printLayout(items,{mode,paper,sheet:sheet==='12up-trim'?'12up':sheet,bleed,copies,duplexFlip,offsetX,offsetY});page={w:plan.w,h:plan.h};pageCount=plan.pages.length;
 }
 const production=isProductionSheet(sheet),copiesPerPage=sheet==='chalkpit-jcard-8up'?8:sheet==='chalkpit-cassette-4up'?4:sheet.startsWith('12up')?12:['2up','cd-2up','cd-letter-2up'].includes(sheet)?2:1;
 const panels=isCDMode(mode)&&mode!=='cd-label'?cdPanelRects(p,mode==='cd-insert'?'cdFront':'cdTray'):[];
 const cd=mode==='cd-label'?{...cdLabelGeometry(p)}:isCDMode(mode)?{panels:panels.map(({w})=>w),folds:panels.slice(1).map(({x})=>x),spines:mode==='cd-tray'?panels.filter(panel=>panel.index!==2).map(({w})=>w):[]}:null;
 return {title:maxText(p.title||p.data.album||'Проект'),artist:maxText(p.data.artist,120),album:maxText(p.data.album,120),mode,cd,printArea:p.layout.printArea||'label',finished:{w:finished.w,h:finished.h},page,pageCount,surfaces,layout:sheets[sheet]||sheets.auto,paper:production?sheets[sheet]:(sizes[paper]||sizes.custom),production,copiesPerPage,copies:Math.max(1,Math.min(30,Math.floor(Number(copies)||1))),bleed:Number(bleed)||0,dpi:Number(dpi)||300,duplex:['jcard','cd-insert','cd-tray'].includes(mode)&&surfaces.length>1,duplexFlip,url:includeQr?qrLink(p,shareUrl):'',linkKind:shareUrl?'Дизайн / ссылка':'Альбом / плейлист'};
}
function qrSvg(url,x,y,w){
 const qr=QRCode.create(url,{errorCorrectionLevel:'M'}),count=qr.modules.size;
 let d='';for(let row=0;row<count;row++)for(let column=0;column<count;column++)if(qr.modules.get(row,column))d+=`M${column+4} ${row+4}h1v1h-1z`;
 return `<svg x="${x}" y="${y}" width="${w}" height="${w}" viewBox="0 0 ${count+8} ${count+8}"><rect width="100%" height="100%" fill="white"/><path d="${d}" fill="black"/></svg>`;
}
export function printShopLetter(p,options={}){
 const details=printShopSpecs(p,options),letter=options.letterPaper==='letter'||(!options.letterPaper&&options.paper==='letter'),w=letter?215.9:210,h=letter?279.4:297;
 const text=(value,x,y,size=3.7,bold=false)=>`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${bold?700:400}" fill="#202020">${esc(value)}</text>`;
 let body=`<rect width="${w}" height="${h}" fill="white"/>`+text('Задание для печати',18,23,7,true)+text('Cassette Studio',18,31,3.4);
 let y=43;for(const line of wrap(details.title,65)){body+=text(line,18,y,4.6,true);y+=6}
 if(details.artist||details.album){for(const line of wrap([details.artist,details.album].filter(Boolean).join(' — '),80)){body+=text(line,18,y);y+=5}}
 y+=7;const rows=[
 ['Макет',isCDMode(details.mode)?modeTitle(details.mode):details.mode==='jcard'?'J-card · кассетный вкладыш':details.printArea==='full'?'Cassette · весь корпус':details.printArea==='body'?'Cassette · печать на корпусе':'Cassette · наклейки'],
 ['Готовый размер',`${formatNumber(details.finished.w)} × ${formatNumber(details.finished.h)} мм`],
 ...(details.mode==='cd-label'?[['Диаметр рисунка',`Ø ${formatNumber(details.cd.outerDiameter)} мм`],['Отверстие',`Ø ${formatNumber(details.cd.holeDiameter)} мм`]]:details.cd?[['Панели',details.cd.panels.map(width=>formatNumber(width)+' мм').join(' + ')],...(details.cd.spines.length?[['Корешки',details.cd.spines.map(width=>formatNumber(width)+' мм').join(' + ')]]:[]),...(details.cd.folds.length?[['Сгибы от левого края',details.cd.folds.map(x=>formatNumber(x)+' мм').join(' / ')]]:[])]:[]),
 ['Лист',`${formatNumber(details.page.w)} × ${formatNumber(details.page.h)} мм`],
 ['Раскладка',details.layout],
 ['Страниц в файле',String(details.pageCount)],
 [details.production&&details.copiesPerPage>1?'Листов на сторону':'Комплектов',String(details.copies)],
 ...(details.copiesPerPage>1?[['Макетов на листе',String(details.copiesPerPage)]]:[]),
 ['Вылет',`${formatNumber(details.bleed)} мм`],
 ['Разрешение растра',`${details.dpi} dpi`],
 ['Стороны',details.duplex?`Двусторонняя · переворот по ${details.duplexFlip==='short'?'короткому':'длинному'} краю`:details.mode==='label'&&details.surfaces.length>1?'A и B · отдельные наклейки':'Односторонняя']
 ];
 for(const [label,value]of rows){body+=text(label,18,y,3.5,true);const lines=wrap(value,46);for(let i=0;i<lines.length;i++)body+=text(lines[i],73,y+i*4.7,3.5);y+=Math.max(7,lines.length*4.7+2)}
 y+=6;for(const line of wrap('Печатайте PDF при масштабе 100%. Отключите «Подогнать под страницу». Не изменяйте размеры изображения в файле. Сначала проверьте размер на пробном листе.',83)){body+=text(line,18,y,3.7);y+=5.5}
 y+=10;
 if(details.url){body+=qrSvg(details.url,18,y,31)+text(details.linkKind,54,y+5,3.6,true);for(const [i,line]of wrap(details.url,58).slice(0,4).entries())body+=text(line,54,y+11+i*4.2,2.9);y+=39}
 body+=text('Заказчик / подпись: ______________________________________',18,Math.min(y+10,h-28),3.7)+text('Дата: ______________________',18,Math.min(y+19,h-19),3.7);
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`,w,h,warnings:[],details};
}
