import {taperedInsets} from './tapered-text.js';

const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const graphemes=text=>segmenter?Array.from(segmenter.segment(text),part=>part.segment):Array.from(text);
const sameRun=(a,b)=>a.style===b.style&&a.bold===b.bold&&a.italic===b.italic&&a.heading===b.heading;

// Keep visible glyphs and their styles together before wrapping. Markdown
// delimiters never enter measurement, and a wrapped span keeps its emphasis.
export function styledGlyphs(value,layer,{albumSpan=null,literalText=false}={}){
 const input=String(value??''),glyphs=[];
 const append=(text,start,emphasis={})=>{
  let offset=start;
  for(const glyph of graphemes(text)){
   const style=albumSpan&&offset>=albumSpan.start&&offset<albumSpan.end?albumSpan.style:null;
   const uppercase=style?.uppercase??layer.uppercase;
   for(const visible of graphemes(uppercase?glyph.toUpperCase():glyph))glyphs.push({text:visible,...emphasis,...(style?{style}:{})});
   offset+=glyph.length;
  }
 };
 if(literalText){append(input,0);return glyphs}
 const pattern=/\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
 let offset=0;
 for(const match of input.matchAll(pattern)){
  append(input.slice(offset,match.index),offset);
  const both=match[1]!==undefined,bold=both||match[2]!==undefined,delimiter=both?3:bold?2:1;
  append(match[1]??match[2]??match[3],match.index+delimiter,{...(bold?{bold:true}:{}),...(!bold||both?{italic:true}:{})});
  offset=match.index+match[0].length;
 }
 append(input.slice(offset),offset);
 return glyphs;
}

export function glyphRuns(glyphs){
 const runs=[];
 for(const glyph of glyphs){const previous=runs.at(-1);if(previous&&sameRun(previous,glyph))previous.text+=glyph.text;else runs.push({...glyph})}
 return runs;
}

export function resolvedRunStyle(run,layer,size){
 const style={...layer,...run.style};
 style.size=Math.min(100,Math.max(.1,Number(style.size)||layer.size))*size/layer.size;
 style.fontWeight=run.bold||run.heading?700:style.fontWeight||(style.bold?700:400);
 style.italic=!!(run.italic||style.italic);
 return style;
}

export function runAdvance(text,style,size,measureText){
 const count=graphemes(text).length;
 return (measureText?measureText(text,style,size):count*size*.55)+Math.max(0,count-1)*(style.spacing||0);
}

export function measuredRunsWidth(runs,layer,size,measureText){
 let width=0,previousStyle=null;
 for(const run of runs){
  const style=resolvedRunStyle(run,layer,size),stretch=(style.fontStretch||100)/100;
  if(previousStyle)width+=(previousStyle.spacing||0)*(previousStyle.fontStretch||100)/100;
  width+=runAdvance(run.text,style,style.size,measureText)*stretch;
  previousStyle=style;
 }
 return width;
}

function markdownLine(runs){
 const heading=runs.some(run=>run.heading);
 return (heading?'# ':'')+runs.map(run=>{const marker=run.bold&&run.italic?'***':run.bold?'**':run.italic?'*':'';return marker+run.text+marker}).join('');
}

function paragraphs(glyphs,literalText=false,markdownHeadings=true){
 const result=[[]];
 for(const glyph of glyphs){if(glyph.text==='\n'||glyph.text==='\r\n')result.push([]);else if(glyph.text!=='\r')result.at(-1).push(glyph)}
 for(let index=0;!literalText&&markdownHeadings&&index<result.length;index++){
  const paragraph=result[index],prefix=paragraph.map(glyph=>glyph.text).join('').match(/^#{1,6}\s*/)?.[0];
  if(!prefix)continue;
  let consumed=0,start=0;while(start<paragraph.length&&consumed<prefix.length)consumed+=paragraph[start++].text.length;
  result[index]=paragraph.slice(start).map(glyph=>({...glyph,heading:true}));
 }
 return result;
}

function paragraphWords(glyphs){
 const words=[];let current=[],space=null;
 for(const glyph of glyphs){
  if(/^\s+$/.test(glyph.text)){if(current.length){words.push({glyphs:current,space});current=[]}space={...glyph,text:' '}}
  else current.push(glyph);
 }
 if(current.length)words.push({glyphs:current,space});
 return words;
}

export function layoutStyledText(value,layer,{measureText,albumSpan=null,literalText=!!layer.literalText,markdownHeadings=layer.markdownHeadings!==false}={}){
 const source=paragraphs(styledGlyphs(value,layer,{albumSpan,literalText}),literalText,markdownHeadings);
 const calculate=size=>{
  const lineRuns=[],widths=[],availableWidths=[],lineHeights=[],baselines=[],insets=[];
  let top=0;
  // A hidden artist or a wrapped album-only line must not retain the
  // artist's larger leading. Empty paragraphs still use the base face.
  const maxRunSize=runs=>runs.length?runs.reduce((maximum,run)=>Math.max(maximum,resolvedRunStyle(run,layer,size).size),0):size;
  const fits=glyphs=>{
   const runs=glyphRuns(glyphs),bounds=layer.flapTapered?taperedInsets(layer,size,lineRuns.length,top+.5*maxRunSize(runs)*layer.lineHeight):null;
   const available=bounds?Math.max(size,layer.w-bounds.left-bounds.right):layer.w;
   return measuredRunsWidth(runs,layer,size,measureText)<=available+1e-9;
  };
  const append=glyphs=>{
   const runs=glyphRuns(glyphs),maxSize=maxRunSize(runs);
   const height=maxSize*layer.lineHeight;
   lineRuns.push(runs);widths.push(measuredRunsWidth(runs,layer,size,measureText));lineHeights.push(height);baselines.push(top+.9*maxSize);
   const bounds=layer.flapTapered?taperedInsets(layer,size,lineRuns.length-1,top+height/2):null;
   if(bounds)insets.push(bounds);
   availableWidths.push(bounds?Math.max(size,layer.w-bounds.left-bounds.right):layer.w);
   top+=height;
  };
  for(const paragraph of source){
   const words=paragraphWords(paragraph);if(!words.length){append([]);continue}
   let current=[];
   for(const word of words){
    const candidate=current.length?[...current,word.space||{text:' '},...word.glyphs]:word.glyphs;
    if(fits(candidate)){current=candidate;continue}
    if(current.length){append(current);current=[]}
    if(fits(word.glyphs)){current=word.glyphs;continue}
    for(const glyph of word.glyphs){if(current.length&&!fits([...current,glyph])){append(current);current=[]}current.push(glyph)}
   }
   if(current.length)append(current);
  }
  return {lines:lineRuns.map(markdownLine),lineRuns,widths,availableWidths,lineHeights,baselines,height:top,...(layer.flapTapered?{insets}:{})};
 };
 let size=layer.size,layout=calculate(size);
 const tooWide=margin=>layout.widths.some((width,index)=>width>layout.availableWidths[index]+margin);
 if(layer.autoFit)for(let attempt=0;attempt<80&&(layout.height>layer.h+1e-9||tooWide(1e-9))&&size>.1;attempt++){
  const widthScale=layout.widths.reduce((minimum,width,index)=>width>layout.availableWidths[index]?Math.min(minimum,layout.availableWidths[index]/width):minimum,1);
  size=Math.max(.1,size*Math.min(.96,layer.h/layout.height,widthScale));layout=calculate(size);
 }
 return {...layout,size,overflow:layout.height>layer.h+.1||tooWide(.1)};
}

export function fittingLineCount(layout,height){
 let count=0,used=0;
 for(const lineHeight of layout.lineHeights){if(count&&used+lineHeight>height+1e-9)break;used+=lineHeight;count++}
 return Math.max(1,count);
}
