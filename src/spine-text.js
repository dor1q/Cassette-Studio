import {esc,clamp,boundText} from './model.js';
import {svgPaint} from './color-paint.js';
import {resolvedRunStyle,runAdvance,measuredRunsWidth} from './text-layout.js';

export function spineAlbumSpan(value,layer,project){
 const album=project?.data.album;
 if(!layer.referenceSpine||layer.hideAlbum||!album||!layer.albumStyle)return null;
 const start=String(value).lastIndexOf(album);
 return start<0?null:{start,end:start+album.length,style:layer.albumStyle};
}

export function renderStyledRuns(runs,layer,size,measureWidth,{backgroundColor='#ffffff'}={}){
 return runs.map(run=>{
  if(!run.style){
   const attributes=[run.bold?'font-weight="bold"':'',run.italic?'font-style="italic"':''].filter(Boolean).join(' ');
   return attributes?`<tspan ${attributes}>${esc(run.text)}</tspan>`:esc(run.text);
  }
  const style=resolvedRunStyle(run,layer,size),stretch=(style.fontStretch||100)/(layer.fontStretch||100);
  const width=runAdvance(run.text,style,style.size,measureWidth);
  return `<tspan font-family="${esc(style.font)}" font-size="${style.size}" font-weight="${style.fontWeight}" font-style="${style.italic?'italic':'normal'}" font-variant="${style.smallcaps?'small-caps':'normal'}" letter-spacing="${style.spacing||0}" stroke="${esc(style.outlineColor)}" stroke-width="${style.outline||0}" fill="${svgPaint(style.color,'',{backgroundColor}).fill}"${width>0&&stretch!==1?` textLength="${width*stretch}" lengthAdjust="spacingAndGlyphs"`:''}>${esc(run.text)}</tspan>`;
 }).join('');
}

export function renderStyledLine(runs,layer,size,measureWidth,{x=0,y=.9*size,anchor='start',width=measuredRunsWidth(runs,layer,size,measureWidth),backgroundColor='#ffffff',lineId='',baseShadowId='',shadowId=''}={}){
 const attributes=(style,position,stretch,alignment='start')=>`x="${position/stretch}" transform="scale(${stretch} 1)" y="${y}" font-size="${style.size}" font-family="${esc(style.font)}" fill="${svgPaint(style.color,'',{backgroundColor}).fill}" font-weight="${style.fontWeight}" font-style="${style.italic?'italic':'normal'}" font-variant="${style.smallcaps?'small-caps':'normal'}" text-anchor="${alignment}" letter-spacing="${style.spacing||0}" stroke="${esc(style.outlineColor)}" stroke-width="${style.outline||0}" paint-order="stroke"`;
 // SVG filters on <tspan> are ignored by the raster exporter. Lines that
 // need shadows use independently positioned <text> runs; their advances
 // and anchors match wrapping, including each face's spacing and stretch.
 if(!runs.some(run=>resolvedRunStyle(run,layer,size).shadow)){
  const style=resolvedRunStyle({heading:runs.some(run=>run.heading)},layer,size);
  return `<text ${attributes(style,x,(layer.fontStretch||100)/100,anchor)}>${renderStyledRuns(runs,layer,size,measureWidth,{backgroundColor})}</text>`;
 }
 let pen=x-(anchor==='middle'?width/2:anchor==='end'?width:0),previousStyle=null;
 const filterPrefix=String(lineId||baseShadowId||shadowId||'text-line').replace(/[^a-z0-9_-]/gi,'')||'text-line';
 return runs.map((run,index)=>{
  const style=resolvedRunStyle(run,layer,size),stretch=(style.fontStretch||100)/100;
  if(previousStyle)pen+=(previousStyle.spacing||0)*(previousStyle.fontStretch||100)/100;
  const advance=runAdvance(run.text,style,style.size,measureWidth);
  let filterId='',defs='';
  if(style.shadow){
   filterId=`${filterPrefix}-run${index}${run.style?.shadow===undefined?'-shadow':'-album-shadow'}`;
   // Percentage filter regions shrink to the ink bbox of a single I or a
   // punctuation mark and can crop its shadow away. Bound the effect in
   // this run's local coordinates instead, including italic overhang,
   // outline, offset and three blur deviations. No full layer bitmap is
   // allocated for each run.
   const shadow=Number(style.shadow),sigma=shadow*.3,effectPadding=shadow+3*sigma+(Number(style.outline)||0);
   const overhang=style.size*.5,left=Math.min(pen/stretch,pen/stretch+advance)-overhang-effectPadding;
   const top=y-style.size*1.5-effectPadding,filterWidth=Math.max(style.size,Math.abs(advance))+2*(overhang+effectPadding),filterHeight=style.size*2+2*effectPadding;
   defs=`<defs><filter id="${esc(filterId)}" filterUnits="userSpaceOnUse" x="${left}" y="${top}" width="${filterWidth}" height="${filterHeight}"><feDropShadow dx="${shadow}" dy="${shadow}" stdDeviation="${sigma}" flood-color="${esc(style.shadowColor||'#000000')}"/></filter></defs>`;
  }
  const result=`${defs}<text ${attributes(style,pen,stretch)}${filterId?` filter="url(#${esc(filterId)})"`:''}>${renderStyledRuns([{...run,style:null}],style,style.size,measureWidth,{backgroundColor})}</text>`;
  pen+=advance*stretch;previousStyle=style;
  return result;
 }).join('');
}

const compact=text=>String(text).replace(/\s/g,'');
export function spineCaseText(value,layer,project){
 const upper=text=>layer.uppercase?text.toUpperCase():text,album=project.data.album;
 if(!layer.referenceSpine||!layer.albumStyle||layer.hideAlbum||!album)return upper(value);
 const start=value.lastIndexOf(album);if(start<0)return upper(value);
 const title=(layer.albumStyle.uppercase??layer.uppercase)?album.toUpperCase():album;
 return upper(value.slice(0,start))+title+upper(value.slice(start+album.length));
}

export function spineTextRuns(line,lines,index,layer,project){
 const style=layer.albumStyle,album=project.data.album;
 if(!layer.referenceSpine||layer.hideAlbum||!album||!style)return [{text:line}];
 const source=boundText(project,layer,'outer');
 const normalized=compact(spineCaseText(source,layer,project));
 const title=compact((style.uppercase??layer.uppercase)?album.toUpperCase():album);
 const start=normalized.lastIndexOf(title);if(start<0)return [{text:line}];
 const end=start+title.length,runs=[];
 let offset=lines.slice(0,index).reduce((n,text)=>n+compact(text).length,0);
 for(const char of line){
  const previous=runs.at(-1);
  const whitespace=/\s/.test(char),albumPart=whitespace?!!previous?.style:offset>=start&&offset<end;
  if(!whitespace)offset+=char.length;
  if(previous&&!!previous.style===albumPart)previous.text+=char;
  else runs.push({text:char,...(albumPart?{style}:{})});
 }
 return runs;
}

export function renderSpineLine(line,lines,index,layer,project,size,styledText,measureWidth,{backgroundColor='#ffffff',shadowId=''}={}){
 return spineTextRuns(line,lines,index,layer,project).map(run=>{
  if(!run.style)return styledText(run.text);
  const style=run.style,text=style.uppercase?run.text.toUpperCase():run.text;
  const fontSize=clamp(Number(style.size)||layer.size,.1,100)*size/layer.size;
  const stretch=(style.fontStretch||100)/(layer.fontStretch||100);
  const width=measureWidth?.(text,style,fontSize);
  return `<tspan font-family="${esc(style.font||layer.font)}" font-size="${fontSize}" font-weight="${style.fontWeight||(style.bold?700:400)}" font-style="${style.italic?'italic':'normal'}" font-variant="${style.smallcaps?'small-caps':'normal'}" letter-spacing="${style.spacing||0}" stroke="${esc(style.outlineColor||layer.outlineColor)}" stroke-width="${style.outline||0}" fill="${svgPaint(style.color||layer.color,'',{backgroundColor}).fill}"${style.shadow&&shadowId?` filter="url(#${shadowId})"`:''}${width>0&&stretch!==1?` textLength="${width*stretch}" lengthAdjust="spacingAndGlyphs"`:''}>${styledText(text)}</tspan>`;
 }).join('');
}
