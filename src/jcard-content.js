import {time} from './model.js';
import {REFERENCE_UNIT as UNIT} from './reference-format.js';
import {parseJCardMarkdown} from './jcard-markdown.js';

const option=(project,layer,key,fallback)=>layer.trackOptions?.[key]??project.settings?.[key]??fallback;
const textOf=glyphs=>glyphs.map(glyph=>glyph.text).join('');
const hardLines=value=>String(value||'').replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()?line:'\u00a0').join('  \n');
let lastDocument=null;

// The public J-card feeds the complete generated document to Markdown. Album
// metadata is deliberately not escaped; cassette labels have a separate rule.
export function composeJCardContents(project,layer){
 const data=project.data,hiddenBoth=layer.hideA&&layer.hideB;
 const artist=layer.hideArtist||hiddenBoth?'':String(data.artist||'').trim(),album=layer.hideAlbum||hiddenBoth?'':String(data.album||'').trim();
 const separator=project.settings.referenceSeparator??'-',heading=[artist,album].filter(Boolean).join(separator==='\u2002'?separator:' '+separator+' '),tracks=[];
 if(!option(project,layer,'hideTracks',false))for(const side of ['A','B']){
  const items=data[side]||[];if(layer['hide'+side]||!items.length)continue;
  if(tracks.length)tracks.push('');
  if(option(project,layer,'showSide',true))tracks.push('### '+(option(project,layer,'sideText','Side')||'Side')+' '+(option(project,layer,'side'+side,side)||side));
  items.forEach((track,index)=>{
   const prefix=option(project,layer,'numbers',true)?(index+1)+'. ':option(project,layer,'bullets',true)?'- ':'';
   const artist=option(project,layer,'artists',true)&&track.artist?' - '+track.artist:'';
   const duration=option(project,layer,'durations',true)&&track.seconds?' ('+time(track.seconds)+')':'';
   tracks.push(prefix+String(track.title||'')+artist+duration);
  });
 }
 return [heading?'## '+heading:'',tracks.join('  \n'),data.lyrics?hardLines(data.lyrics):'',option(project,layer,'showProduction',true)&&data.production?hardLines(data.production):''].filter(Boolean).join('\n\n');
}

export function usesJCardContents(project,layer,surface){return !!(project.layout.referenceTemplate&&['outer','inner'].includes(surface)&&layer.type==='text'&&layer.source==='referenceContents'&&layer.referenceFlow)}

// Flatten structural blocks while retaining glyph styles and list identities.
// Margins are expressed in physical units, whereas list indents use the
// receiving frame's body face, so an independently styled copy stays editable.
function documentBlocks(ast){
 const blocks=[];
 const visit=(items,{depth=0,tight=false,marker=null}={})=>{
  let pendingMarker=marker;
  for(const block of items){
   if(block.kind==='list'){
    if(pendingMarker!==null){blocks.push({kind:'paragraph',glyphs:[],depth,marker:pendingMarker,before:0,after:0});pendingMarker=null}
    block.children.forEach((item,index)=>{
     const start=blocks.length;visit(item.children,{depth:depth+1,tight:block.tight,marker:block.ordered?(index+1)+'.':'•'});
     if(blocks.length===start)blocks.push({kind:'paragraph',glyphs:[],depth:depth+1,marker:block.ordered?(index+1)+'.':'•',before:0,after:0});
     blocks.at(-1).after=Math.max(blocks.at(-1).after,4*UNIT);
    });
    if(blocks.length)blocks.at(-1).after=Math.max(blocks.at(-1).after,12*UNIT);
   }else if(block.children.length){visit(block.children,{depth,tight,marker:pendingMarker});pendingMarker=null}
   else{
    let before=0,after=0;
    if(block.kind==='heading'){
     if(block.level===1)after=16*UNIT;
     else if(block.level===2){before=16*UNIT;after=12*UNIT}
     else if(block.level===3){before=24*UNIT;after=8*UNIT}
    }else if(block.kind==='paragraph'&&!tight)after=20*UNIT;
    const glyphs=block.kind==='code'&&block.glyphs.at(-1)?.text==='\n'?block.glyphs.slice(0,-1):block.glyphs;
    blocks.push({kind:block.kind,level:block.level,glyphs,depth,marker:pendingMarker,before,after,images:block.images});pendingMarker=null;
   }
  }
 };
 visit(ast.blocks);return blocks;
}

function blockFace(block,layer){
 const face={...layer,autoFit:false,literalText:false,markdownHeadings:false,nowrap:false,singleLine:false,clipText:false};
 if(block.kind==='heading'&&block.level<=3){
  const ratio=block.level===1?1.5:block.level===2?58/48:1;
  face.size=Math.max(.1,Math.round(layer.size/UNIT*ratio)*UNIT);face.fontWeight=block.level===1?700:600;face.bold=false;
 }
 if(block.kind==='code'){face.font='Courier New';face.nowrap=true;face.allowTextOverflow=true}
 face.w=Math.max(.1,layer.w-(block.depth||0)*2.35*layer.size);
 return face;
}

function blockLayout(block,glyphs,layer,layoutText){const face=blockFace(block,layer);return {face,layout:layoutText(textOf(glyphs),face,{preparedGlyphs:glyphs,markdownHeadings:false})}}
function slicedLayout(layout,count){return {...layout,lines:layout.lines.slice(0,count),lineRuns:layout.lineRuns.slice(0,count),widths:layout.widths.slice(0,count),availableWidths:layout.availableWidths?.slice(0,count),lineHeights:layout.lineHeights.slice(0,count),baselines:layout.baselines.slice(0,count),height:layout.lineHeights.slice(0,count).reduce((sum,value)=>sum+value,0),overflow:false}}
const readable=layout=>layout.lineRuns.map(runs=>runs.map(run=>run.text).join('')).join('\n');
const emptyLayout=()=>({lines:[],lineRuns:[],widths:[],availableWidths:[],lineHeights:[],baselines:[],height:0,overflow:false});

// Fragments contain source glyphs, never frame-specific geometry or raster data.
// A copied viewport receives these same fragments and lays them with its own
// font, size, width, alignment and transform, without consuming another slot.
function fragmentsAtSize(fragments,layer,layoutText){
 const sections=[];let top=0;
 for(const fragment of fragments){
  top+=fragment.spaceBefore||0;
  const x=(fragment.depth||0)*2.35*layer.size;
  if(fragment.kind==='thematic-break'){
   const face=blockFace(fragment,layer),height=UNIT;
   sections.push({kind:'rule',text:'',layer:face,layout:emptyLayout(),x,y:top+height/2,width:face.w,height:UNIT,opacity:1});top+=height;
  }else{
   const {face,layout}=blockLayout(fragment,fragment.glyphs,layer,layoutText);
   sections.push({kind:fragment.kind,text:readable(layout),layer:face,layout,x,y:top,opacity:1});
   if(fragment.marker){
    const markerFace={...layer,w:Math.max(layer.size*2,layer.w),align:'right',autoFit:false,literalText:true,markdownHeadings:false,nowrap:true,singleLine:true},glyphs=Array.from(fragment.marker,text=>({text}));
    const markerLayout=layoutText(fragment.marker,markerFace,{preparedGlyphs:glyphs,markdownHeadings:false});
    sections.push({kind:'marker',text:fragment.marker,layer:markerFace,layout:markerLayout,x:x-layer.size*.6-markerFace.w,y:top+(layout.baselines[0]||.9*face.size)-(markerLayout.baselines[0]||.9*layer.size),opacity:1});
   }
   top+=layout.height;
  }
  top+=fragment.spaceAfter||0;
 }
 return {sections,height:top,size:layer.size,overflow:top>layer.h+.1||sections.some(section=>section.layout.overflow)};
}

export function layoutJCardFragments(fragments,layer,{layoutText}={}){
 if(typeof layoutText!=='function')throw Error('J-card text layout is required');
 let size=layer.size,result=fragmentsAtSize(fragments,layer,layoutText);
 if(!layer.autoFit)return result;
 // Fit only this viewport's selected fragment. Scaling the receiving face
 // must never consume source text or redistribute any original column. Block
 // margins and rule strokes keep their physical size, as in the reference.
 const fixedHeight=fragments.reduce((sum,fragment)=>sum+(fragment.spaceBefore||0)+(fragment.spaceAfter||0)+(fragment.kind==='thematic-break'?UNIT:0),0);
 const fitState=local=>{
  let widthRatio=1;
  for(const section of local.sections){
   if(section.kind==='marker')continue;
   const available=Math.max(0,layer.w-section.x);
   if(section.kind==='rule'){if(section.width>available+1e-9)widthRatio=Math.min(widthRatio,available/section.width);continue}
   section.layout.widths.forEach((width,index)=>{const limit=Math.min(available,section.layout.availableWidths?.[index]??section.layer.w);if(width>limit+1e-9)widthRatio=Math.min(widthRatio,limit/width)});
  }
  const tooTall=local.height>layer.h+1e-9,variableHeight=local.height-fixedHeight;
  const heightRatio=tooTall&&variableHeight>0?Math.max(0,(layer.h-fixedHeight)/variableHeight):1;
  return {needsFit:tooTall||widthRatio<1,scale:Math.min(.96,widthRatio,heightRatio)};
 };
 let state=fitState(result);
 for(let attempt=0;attempt<80&&state.needsFit&&size>.1;attempt++){
  size=Math.max(.1,size*state.scale);result=fragmentsAtSize(fragments,{...layer,size,autoFit:false},layoutText);state=fitState(result);
 }
 return {...result,overflow:result.overflow||state.needsFit};
}

function printedSlots(project){
 return ['outer','inner'].flatMap(surface=>surface==='inner'&&project.layout.double===false?[]:(project.surfaces[surface]||[]).filter(layer=>layer.type==='text'&&layer.source==='referenceContents'&&layer.referenceFlow&&layer.flowIndex!==undefined).map(layer=>({surface,layer}))).sort((a,b)=>a.layer.flowIndex-b.layer.flowIndex);
}

export function layoutJCardContents(project,layer,surface,{layoutText}={}){
 if(typeof layoutText!=='function')throw Error('J-card text layout is required');
 const slots=printedSlots(project),target=slots.find(slot=>slot.layer.id===layer.id&&slot.surface===surface);
 if(!target)return {text:'',overflow:false,fragments:[],warnings:[]};
 const source=composeJCardContents(project,layer);
 if(lastDocument?.source!==source){const ast=parseJCardMarkdown(source);lastDocument={source,ast,blocks:documentBlocks(ast)}}
 const {ast,blocks}=lastDocument,warnings=[...ast.warnings];
 if(blocks.some(block=>block.images?.length))warnings.push('image-alt-fallback');
 let index=0,offset=0,pendingMargin=0,started=false;
 for(const slot of slots){
  const fragments=[],texts=[];let top=0,localOverflow=false;
  while(index<blocks.length){
   const block=blocks[index],glyphs=block.glyphs.slice(offset),atStart=offset===0;
   if(!glyphs.length&&!block.marker&&block.kind!=='thematic-break'){pendingMargin=Math.max(pendingMargin,block.before,block.after);index++;offset=0;continue}
   let spaceBefore=atStart?Math.max(pendingMargin,block.before):0;
   // A forced column break discards adjoining block margins; the initial
   // document margin is retained. Split paragraphs never acquire a new one.
   if(top===0&&started)spaceBefore=0;
   const height=slot.layer.h-spaceBefore-top;
   if(block.kind==='thematic-break'){
    const needed=UNIT;if(top>0&&needed>height+1e-9)break;
    fragments.push({...block,glyphs:[],spaceBefore,spaceAfter:0,blockIndex:index,sourceStart:0,sourceEnd:0});texts.push('');top+=spaceBefore+needed;localOverflow||=top>slot.layer.h+.1;pendingMargin=block.after;index++;offset=0;started=true;continue;
   }
   const {layout,face}=blockLayout(block,glyphs,slot.layer,layoutText);
   // Keep an unsplit heading with at least the first following line, unless
   // the heading alone is taller than an empty receiving column.
   if(atStart&&block.kind==='heading'&&top>0&&layout.height<=slot.layer.h){
    const next=blocks[index+1];
    if(next){const nextLayout=next.kind==='thematic-break'?null:blockLayout(next,next.glyphs,slot.layer,layoutText).layout,firstHeight=nextLayout?.lineHeights[0]??UNIT;
     if(layout.height+Math.max(block.after,next.before)+firstHeight>height+1e-9)break;
    }
   }
   let count=0,used=0;
   for(const lineHeight of layout.lineHeights){if(used+lineHeight>height+1e-9)break;used+=lineHeight;count++}
   if(!count){if(top>0)break;count=Math.min(1,layout.lineHeights.length);used=layout.lineHeights[0]||0;localOverflow||=used>height+.1}
   if(!face.allowTextOverflow)localOverflow||=layout.widths.slice(0,count).some((width,line)=>width>(layout.availableWidths?.[line]??face.w)+.1);
   const complete=count>=layout.lineHeights.length;
   let consumed=complete?glyphs.length:layout.lineSourceEnds?.[count-1];
   if(!Number.isInteger(consumed)||consumed<=0){
    // The production layout adapter supplies exact source ends. This bounded
    // fallback keeps a custom adapter from looping on an oversized glyph.
    consumed=Math.min(glyphs.length,Math.max(1,layout.lineRuns.slice(0,count).flat().reduce((sum,run)=>sum+Array.from(run.text).length,0)));
   }
   const displayed=glyphs.slice(0,consumed);if(!complete&&displayed.at(-1)?.text==='\n')displayed.pop();
   const fragment={...block,glyphs:displayed,marker:atStart?block.marker:null,spaceBefore,spaceAfter:0,blockIndex:index,sourceStart:offset,sourceEnd:offset+consumed};
   fragments.push(fragment);texts.push(readable(slicedLayout(layout,count)));top+=spaceBefore+used;pendingMargin=0;started=true;
   if(complete){pendingMargin=block.after;index++;offset=0}else{offset+=consumed;break}
  }
  if(slot===target)return {text:texts.join('\n'),overflow:localOverflow||slot===slots.at(-1)&&index<blocks.length,fragments,warnings};
 }
 return {text:'',overflow:false,fragments:[],warnings};
}
