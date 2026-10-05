// Public URL format observed in the original editor, 30 September 2026.
const limit=(n,a,b)=>Math.max(a,Math.min(b,n));
export const REFERENCE_PANEL_PIXELS=[638,300,1537,1500,1462,1426,1387,1350];
export const REFERENCE_UNIT=25.4/600;
const families=['Futura','Arial','Times New Roman','Impact','Courier New','Roboto Flex','Bebas Neue','League Gothic','Sofia Sans Extra Condensed','Nunito Sans','Stint Ultra Condensed','EB Garamond','Cinzel','VCR OSD Mono','Chomsky','Montserrat',null,null,'Poppins',null,'Inter',null,null,'Playfair Display',null,null,null,null,null,null,'Permanent Marker',null,null,'Nosifer',null,'Metal Mania',null,null,'Audiowide','Bungee','Londrina Solid','Special Elite','Ultra','Space Mono',null,'Barlow Condensed',null,null,null,'Rubik Mono One','Black Ops One','Teko',null,null,'Bodoni Moda',null,'DM Serif Display',null,'Noto Sans','Noto Serif','IBM Plex Sans','Rubik','Almarai','Noto Sans SC','Noto Sans JP','Noto Sans KR','Heebo','Varela Round','David Libre','Alef',null,'Noto Serif JP','Kosugi Maru','M PLUS Rounded 1c',null,null,'Nanum Gothic','Nanum Myeongjo','Black Han Sans',null,null,'Noto Serif SC',null,null,null,null,'Kanit','Prompt','Sarabun',null,null,'Amiri','Cairo','Tajawal',null,null,null,null,null,null,null,null,null,null,null,'Manufacturing Consent','Dela Gothic One','Play','Rokkitt'];
export function decodedText(value){try{return decodeURIComponent(value||'')}catch{return value||''}}
export function referenceFlags(value){return /^[0-9a-z]+$/i.test(value||'')?parseInt(value,36):0}
export function splitReferenceCaptions(value){return String(value||'').split(/~(?=[^~|]+\|-?\d+(?:\.\d+)?\|-?\d+(?:\.\d+)?\|)/).filter(Boolean)}
export function referenceSectionColors(value){
 const parts=String(value||'').split('.'),colors={};
 for(const [index,key]of ['back','spine','inside','album'].entries())if(/^[a-f0-9]{6}$/i.test(parts[index]||''))colors[key]='#'+parts[index];
 return colors;
}
export function referenceFont(value,baseSize,pixelUnit=REFERENCE_UNIT,defaults={font:'Futura',weight:700}){
 const tokens=String(value||'').split('.'),named=tokens[0]?.startsWith('~'),family=named?decodedText(tokens[0].slice(1).replace(/\+/g,' ')):families[parseInt(tokens[0],36)];
 const number=(i,radix,fallback)=>{const token=tokens[i];if(!token||!(radix===36?/^[0-9a-z]+$/i:/^-?\d+$/).test(token))return fallback;const n=parseInt(token,radix);return Number.isFinite(n)?n:fallback},flags=number(4,10,0),weight=limit(number(2,10,defaults.weight/100)*100,100,900);
 return {font:family||defaults.font,size:baseSize*limit(number(1,36,100),6,1000)/100,fontWeight:weight,bold:weight>=700,fontStretch:limit(number(3,36,100),50,200),spacing:limit(number(5,10,0)/10,-5,10)*pixelUnit,smallcaps:!!(flags&1),uppercase:!!(flags&2),italic:!!(flags&4)||!value&&!!defaults.italic,shadow:flags&8?pixelUnit:0,outline:flags&16?pixelUnit*.6:0};
}
export function referenceLayout(params){
 const match=/^p([3-8])$/.exec(params.get('face')||''),panels=match?Number(match[1]):4,widths=REFERENCE_PANEL_PIXELS.map(n=>n*REFERENCE_UNIT),short=params.get('sb')==='1',extended=params.get('eb')==='1',sw=Number(params.get('sw'));
 widths[0]=(short?378:extended?1537:638)*REFERENCE_UNIT;
 widths[1]=params.has('sw')&&Number.isFinite(sw)?Math.round(limit(sw/1000,.25,1)*600)*REFERENCE_UNIT:300*REFERENCE_UNIT;
 return {panels,panelWidths:widths,flap:widths[0],spine:widths[1],front:widths[2],height:101.6,flapShape:short?'short':extended?'extended':params.get('tb')==='1'?'tapered':'standard',backSlits:extended&&params.get('bsl')==='1',double:params.get('ds')==='1',columns:params.get('dc')==='1'?2:1,columnHeight:limit(Number(params.get('ch'))||100,20,100),referenceTemplate:true,spineTwoLines:params.get('s2l')==='1'};
}
export function referenceCenterX(project,percent,canonical=true){
 const l=project.layout,W=l.panelWidths?l.panelWidths.slice(0,l.panels).reduce((a,b)=>a+b,0):l.flap+l.spine+l.front*(l.panels-2);
 if(!canonical)return W*percent/100;
 let x=9600*REFERENCE_UNIT*percent/100;
 if(l.referenceTemplate){const originalFlap=638*REFERENCE_UNIT,originalSpine=300*REFERENCE_UNIT;
  if(x>originalFlap)x=x>=originalFlap+originalSpine?x+l.spine-originalSpine:originalFlap+(x-originalFlap)*l.spine/originalSpine;
  x+=l.flap-originalFlap;
 }
 return x;
}
export function referenceSynced(params){
 if(params.get('ss')==='1')return true;if(params.get('ss')==='0')return false;
 const backDecal=String(params.get('d')||'').split('|').some(d=>d.split('_')[6]==='b'),backText=splitReferenceCaptions(params.get('cxt')).some(t=>t.split('|').slice(9).includes('b'));
 let backCustom=false;try{const items=JSON.parse(params.get('cd'));backCustom=Array.isArray(items)&&items.some(item=>item?.side==='back')}catch{}
 const backgroundMasks=[...(String(params.get('bg')||'').split('.')[1]||params.get('cb')?[params.get('bgp')]:[]),...String(params.get('bgl')||'').split('|').map(item=>item.split('_')[0])],separateBackground=backgroundMasks.some(mask=>/^[a-z0-9]+$/i.test(mask||'')&&[1,2].includes(parseInt(mask,36)&3));
 return !(backDecal||backText||backCustom||separateBackground||['bp','qr','sc'].some(key=>String(params.get(key)||'').split('|').some(t=>t.startsWith('b~'))));
}
export function referenceSurfaces(project,mode=project.editorMode,{active=false}={}){
 if(mode==='cd-label')return ['cdLabel'];
 if(mode==='cd-insert')return active&&!project.layout.cdInsertDouble?['cdFront']:['cdFront','cdInside'];
 if(mode==='cd-tray')return active&&!project.layout.cdTrayDouble?['cdTray']:['cdTray','cdTrayInside'];
 return mode==='label'?['labelA','labelB']:active&&!project.layout.double?['outer']:['outer','inner'];
}
export function referenceCoverSurfaces(mode){return mode==='cd-label'?['cdLabel']:mode==='cd-insert'?['cdFront']:mode==='cd-tray'?['cdTray']:mode==='label'?['labelA','labelB']:['outer']}
export function referenceSurface(project,mode,side){
 if(mode!=='label'&&!['cd-label','cd-insert','cd-tray'].includes(mode))return project.layout.double&&side==='back'?'inner':'outer';
 const surfaces=referenceSurfaces(project,mode);return surfaces[side==='back'&&surfaces.length>1?1:0];
}
export function referencePixelUnit(mode){return mode==='label'||mode==='cd-label'?25.4/72:REFERENCE_UNIT}
export function referenceCodeUnit(project,mode){return mode==='label'?.13*project.layout.labelW/251.16:mode==='cd-label'?.18*25.4/72:REFERENCE_UNIT}
export function referencePlacement(raw){
 const side=raw?.startsWith('b~')?'back':'front',parts=String(raw||'').replace(/^b~/,'').split('_');
 if(parts.length<4)return null;const [x,y,scale,rotation]=parts.slice(0,4).map(Number);
 if(![x,y,scale,rotation].every(Number.isFinite)||Math.abs(x)>125||y < -100||y>200||scale<=0||scale>1000||Math.abs(rotation)>360)return null;
 return {x,y,scale,rotation,side,url:decodedText(parts.slice(4).join('_'))};
}
