import {panelRects} from './model.js';

// Measured coordinates published by the original production template picker.
// Artwork is rendered by Cassette Studio; no template image or third-party code is bundled.
export const PRODUCTION_SOURCE='https://vhs.texs.org/_next/static/chunks/3xv46-0fe6c3o.js';
export const PRODUCTION_BLEED=3.175;
const MM_PER_POINT=25.4/72;
const cards={
 3:{width:2565,height:2494,trim:{x:45,y:41,w:2472,h:2411},edges:[0,637.5,937.5,2472]},
 4:{width:4076,height:2562,trim:{x:62.5,y:61.5,w:3951,h:2439},edges:[0,623,922,2468,3951]},
 5:{width:5530,height:2562,trim:{x:61.5,y:62.5,w:5407,h:2439},edges:[0,621,920,2465.5,3944,5407]},
 6:{width:6951,height:2562,trim:{x:61.5,y:62.5,w:6828,h:2439},edges:[0,621,920,2465,3943.5,5407,6828]},
 7:{width:8343,height:2562,trim:{x:61.5,y:61.5,w:8220,h:2439},edges:[0,619,918,2469,3933.5,5394,6819,8220]},
 8:{width:9727,height:2562,trim:{x:61.5,y:61.5,w:9604,h:2439},edges:[0,619,918,2469,3933.5,5393.5,6819,8220,9604]}
};
const cardSeats=[
 [623,154,1239,1209],[1929,157,1238,1208],
 [620,1418,1239,1209],[1926,1421,1238,1208],
 [620,2687,1239,1208],[1926,2689,1238,1209],
 [620,3954,1239,1208],[1926,3956,1238,1209]
].map(([x,y,w,h])=>({x,y,w,h,bleed:22}));
const shell={width:4942,height:3411,pageWidthPts:592.982,pageHeightPts:409.358,tile:{w:2376,h:1517},centres:[[1230.2,884.4],[3753.8,884.4],[1230.2,2653.3],[3753.8,2653.3]]};
export const PRODUCTION_SHEETS=['chalkpit-jcard','chalkpit-jcard-8up','chalkpit-cassette-4up'];
export const isProductionSheet=sheet=>PRODUCTION_SHEETS.includes(sheet);
const near=(a,b)=>Math.abs(Number(a)-b)<.08;
export function productionChoices(p,mode='jcard'){
 if(!['jcard','label'].includes(mode))return [];
 if(mode==='label')return ['body','full'].includes(p.layout.printArea)?[{value:'chalkpit-cassette-4up',label:'Chalkpit · 4 кассеты на листе'}]:[];
 if(!cards[p.layout.panels]||!['standard','tapered'].includes(p.layout.flapShape)||!near(p.layout.flap,25.4)||!near(p.layout.spine,12.7))return [];
 const choices=[{value:'chalkpit-jcard',label:'Chalkpit · J-card'}];
 if(p.layout.panels===3)choices.push({value:'chalkpit-jcard-8up',label:'Chalkpit · 8 J-card · SRA3'});
 return choices;
}
export function productionTemplate(count){
 const value=cards[count];if(!value)throw Error('Производственный шаблон поддерживает от 3 до 8 панелей.');
 return structuredClone(value);
}
const svgBody=svg=>svg.replace(/^\s*<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
const nested=(body,{x,y,w,h},{x:sx,y:sy,w:sw,h:sh})=>`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh}" preserveAspectRatio="none">${body}</svg>`;
function documentSvg(body,width,height,dpi,points){
 const w=points?points.w*MM_PER_POINT:width*25.4/dpi,h=points?points.h*MM_PER_POINT:height*25.4/dpi;
 return {w,h,dpi,pixelWidth:width,pixelHeight:height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`,warnings:[]};
}

export function productionPanelMap(p,surface='outer'){
 const t=productionTemplate(p.layout.panels),reverse=surface==='inner';
 const trim={...t.trim,x:reverse?t.width-t.trim.x-t.trim.w:t.trim.x};
 const panels=panelRects(p,surface).map(r=>{
  const start=t.edges[r.index],end=t.edges[r.index+1];
  return {index:r.index,source:{x:r.x,y:0,w:r.w,h:p.layout.height},target:{x:trim.x+(reverse?trim.w-end:start),y:trim.y,w:end-start,h:trim.h}};
 });
 return {template:t,trim,panels,reverse};
}
function trimMarks(t,trim){
 const margin={left:trim.x,right:t.width-trim.x-trim.w,top:trim.y,bottom:t.height-trim.y-trim.h};
 const length=n=>Math.max(0,n-Math.max(12,n*.3));
 const rect=(x,y,w,h)=>w>0&&h>0?`<rect x="${x-2}" y="${y-2}" width="${w+4}" height="${h+4}" fill="white"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`:'';
 const edges=t.edges.map(x=>trim.x+x);
 let marks='';for(const x of edges)marks+=rect(x-1.5,0,3,length(margin.top))+rect(x-1.5,t.height-length(margin.bottom),3,length(margin.bottom));
 for(const y of [trim.y,trim.y+trim.h])marks+=rect(0,y-1.5,length(margin.left),3)+rect(t.width-length(margin.right),y-1.5,length(margin.right),3);
 return marks;
}
function cardTile(p,item){
 const map=productionPanelMap(p,item.s),t=map.template,source=svgBody(item.svg);
 const left=map.trim.x,right=t.width-map.trim.x-map.trim.w,top=map.trim.y,bottom=t.height-map.trim.y-map.trim.h;
 let body='';for(const panel of map.panels){
  const a={...panel.source},b={...panel.target},sx=b.w/a.w,sy=b.h/a.h;
  const dl=near(b.x,map.trim.x)?Math.min(PRODUCTION_BLEED*sx,left):0;
  const dr=near(b.x+b.w,map.trim.x+map.trim.w)?Math.min(PRODUCTION_BLEED*sx,right):0;
  const dt=Math.min(PRODUCTION_BLEED*sy,top),db=Math.min(PRODUCTION_BLEED*sy,bottom);
  a.x-=dl/sx;a.y-=dt/sy;a.w+=(dl+dr)/sx;a.h+=(dt+db)/sy;
  b.x-=dl;b.y-=dt;b.w+=dl+dr+.5;b.h+=dt+db;
  body+=nested(source,b,a);
 }
 const markTemplate=map.reverse?{...t,edges:[...t.edges].reverse().map(x=>map.trim.w-x)}:t;
 body+=trimMarks(markTemplate,map.trim);
 return {body,...map};
}
function seatTile(tile,seat,id){
 const sx=seat.w/tile.trim.w,sy=seat.h/tile.trim.h,b=seat.bleed||0;
 const bounds={x:seat.x-tile.trim.x*sx,y:seat.y-tile.trim.y*sy,w:tile.template.width*sx,h:tile.template.height*sy};
 return `<defs><clipPath id="${id}"><rect x="${seat.x-b}" y="${seat.y-b}" width="${seat.w+2*b}" height="${seat.h+2*b}"/></clipPath></defs><g clip-path="url(#${id})">${nested(tile.body,bounds,{x:0,y:0,w:tile.template.width,h:tile.template.height})}</g>`;
}
export function productionPages(p,items,{sheet='chalkpit-jcard',copies=1,duplexFlip='long'}={}){
 if(!items.length)throw Error('Нет сторон для экспорта.');
 const mode=sheet==='chalkpit-cassette-4up'?'label':'jcard';
 if(!productionChoices(p,mode).some(c=>c.value===sheet))throw Error(mode==='label'?'Для печати на корпусе выберите «На корпусе» или «Весь корпус».':'Для этого шаблона нужен стандартный клапан 25,4 мм и корешок 12,7 мм; раскладка на 8 вкладышей доступна для 3 панелей.');
 // The public SRA3 jig contains the front only, even for a two-sided project.
 if(sheet==='chalkpit-jcard-8up')items=items.filter(item=>item.s==='outer');
 if(!items.length)throw Error('Шаблон на 8 J-card печатает только внешнюю сторону.');
 const pages=[];copies=Math.max(1,Math.min(30,Math.floor(Number(copies)||1)));
 for(const item of items){
  if(mode==='label'?!['labelA','labelB'].includes(item.s):!['outer','inner'].includes(item.s))throw Error('Сторона макета не соответствует производственному шаблону.');
  const reverse=item.s==='inner';let page;
  if(mode==='label'){
   const expected={w:shell.tile.w*25.4/600,h:shell.tile.h*25.4/600};
   if(!near(item.w,expected.w)||!near(item.h,expected.h))throw Error('Макет корпуса должен иметь размер 100,6 × 64,2 мм без вылета.');
   const body=shell.centres.map(([x,y])=>nested(svgBody(item.svg),{x:x-shell.tile.w/2,y:y-shell.tile.h/2,w:shell.tile.w,h:shell.tile.h},{x:0,y:0,w:item.w,h:item.h})).join('');
   page=documentSvg(body,shell.width,shell.height,600,{w:shell.pageWidthPts,h:shell.pageHeightPts});page.seats=shell.centres.map(([x,y])=>({x:x-shell.tile.w/2,y:y-shell.tile.h/2,...shell.tile}));
  }else{
   const tile=cardTile(p,item);
   if(sheet==='chalkpit-jcard-8up'){
    const seats=cardSeats.map(s=>({...s,x:reverse?3780-s.x-s.w:s.x}));
    page=documentSvg(seats.map((s,i)=>seatTile(tile,s,'production-seat-'+i)).join(''),3780,5315,300,{w:907.2,h:1275.6});page.seats=seats;
   }else page=documentSvg(tile.body,tile.template.width,tile.template.height,600);
   page.trim=tile.trim;page.panels=tile.panels;
  }
  page.s=item.s;page.rotation=reverse&&((page.w>page.h&&duplexFlip==='long')||(page.w<=page.h&&duplexFlip==='short'))?180:0;pages.push(page);
 }
 // Reuse the artwork strings across copies instead of rebuilding large image sheets.
 return Array.from({length:copies},()=>pages.map(page=>({...page}))).flat();
}
