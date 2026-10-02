import {esc,clamp,boundText} from './model.js';
import {svgPaint} from './color-paint.js';

const compact=text=>String(text).replace(/\s/g,'');
export function spineTextRuns(line,lines,index,layer,project){
 const style=layer.albumStyle,album=project.data.album;
 if(!layer.referenceSpine||layer.hideAlbum||!album||!style)return [{text:line}];
 const source=boundText(project,layer,'outer');
 const normalized=compact(layer.uppercase?source.toUpperCase():source);
 const title=compact(layer.uppercase?album.toUpperCase():album);
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
