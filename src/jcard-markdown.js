import {Parser} from 'commonmark';

const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const graphemes=value=>segmenter?segmenter.segment(value):Array.from(value,text=>({segment:text}));
const codeStyle=Object.freeze({font:'Courier New'});
const blockKinds={paragraph:'paragraph',heading:'heading',list:'list',item:'item',block_quote:'quote',code_block:'code',html_block:'html',thematic_break:'thematic-break'};
const limit=(value,fallback,maximum)=>Math.max(1,Math.min(maximum,Math.floor(Number(value)||fallback)));

// This adapter produces data for our SVG text renderer, never browser HTML.
// Links and image destinations remain metadata; parsing cannot fetch a URL.
export function parseJCardMarkdown(value,{maxSourceLength=250000,maxNodes=100000,maxGlyphs=250000,maxDepth=256}={}){
 const limits={source:limit(maxSourceLength,250000,1000000),nodes:limit(maxNodes,100000,500000),glyphs:limit(maxGlyphs,250000,1000000),depth:limit(maxDepth,256,2048)};
 const warnings=[],warn=code=>{if(!warnings.includes(code))warnings.push(code)};
 let source=String(value??'').replace(/\r\n?/g,'\n');
 if(source.length>limits.source){source=source.slice(0,limits.source);if(/[\uD800-\uDBFF]$/.test(source))source=source.slice(0,-1);warn('source-limit')}
 const ast=new Parser({smart:false}).parse(source),blocks=[],stack=[],converted=new WeakMap();
 let nodeCount=0,glyphCount=0,stopped=false;
 const visit=()=>{if(++nodeCount>limits.nodes){warn('node-limit');stopped=true;return false}return true};
 const append=(target,text,emphasis={},style=null)=>{
  for(const part of graphemes(String(text??''))){
   if(glyphCount>=limits.glyphs){warn('glyph-limit');stopped=true;return false}
   target.push({text:part.segment,...(emphasis.bold?{bold:true}:{}),...(emphasis.italic?{italic:true}:{}),...(style?{style}:{})});glyphCount++;
  }
  return true;
 };
 const inline=(node,block)=>{
  const walker=node.walker(),contexts=[];let event;
  let bold=0,italic=0,depth=0;
  while(!stopped&&(event=walker.next())){
   const current=event.node,type=current.type;
   if(current===node)continue;
   if(event.entering){
    if(!visit())break;
    if(current.isContainer){
     if(depth>=limits.depth){warn('depth-limit');walker.resumeAt(current,false);continue}
     depth++;
     const context={node:current,type,index:block.glyphs.length};contexts.push(context);
     if(type==='strong')bold++;else if(type==='emph')italic++;
    }
    if(type==='text'||type==='html_inline')append(block.glyphs,current.literal,{bold:bold>0,italic:italic>0});
    else if(type==='code')append(block.glyphs,current.literal,{bold:bold>0,italic:italic>0},codeStyle);
    else if(type==='softbreak'||type==='linebreak')append(block.glyphs,'\n');
   }else{
    const context=contexts.at(-1);
    if(context?.node!==current)continue;
    contexts.pop();depth--;
    if(type==='strong')bold--;else if(type==='emph')italic--;
    if(type==='image'||type==='link'){
     const entry={destination:String(current.destination??''),title:String(current.title??''),index:context.index,end:block.glyphs.length};
     const text=block.glyphs.slice(entry.index,entry.end).map(glyph=>glyph.text).join('');
     if(type==='image')block.images.push({...entry,alt:text});else block.links.push({...entry,text});
    }
   }
  }
 };
 const finish=block=>{
  block.plainText=block.children.length?block.children.map(child=>child.plainText).join('\n'):block.glyphs.map(glyph=>glyph.text).join('');
  block.value=block.plainText;
 };
 const walker=ast.walker();let event;
 while(!stopped&&(event=walker.next())){
  const node=event.node;
  if(node===ast)continue;
  if(event.entering){
   if(!visit())break;
   const kind=blockKinds[node.type];if(!kind)continue;
   if(stack.length>=limits.depth){warn('depth-limit');walker.resumeAt(node,false);continue}
   const block={kind,value:'',plainText:'',glyphs:[],children:[],images:[],links:[],sourcepos:node.sourcepos?.map(position=>[...position])??null};
   if(kind==='heading')block.level=node.level;
   if(kind==='list')Object.assign(block,{ordered:node.listType==='ordered',listKind:node.listType,start:node.listStart??null,delimiter:node.listDelimiter??null,tight:!!node.listTight});
   if(kind==='code')block.info=String(node.info??'');
   (stack.at(-1)?.children??blocks).push(block);converted.set(node,block);stack.push(block);
   if(kind==='paragraph'||kind==='heading'){inline(node,block);walker.resumeAt(node,false)}
   else if(kind==='code'||kind==='html')append(block.glyphs,node.literal,{},kind==='code'?codeStyle:null);
   if(!node.isContainer){finish(block);stack.pop()}
  }else{
   const block=converted.get(node);
   if(block){finish(block);if(stack.at(-1)===block)stack.pop()}
  }
 }
 // Limits may stop in the middle of a container. Complete that partial tree
 // iteratively as well, so a deeply nested input never recurses in our code.
 for(let index=stack.length-1;index>=0;index--)finish(stack[index]);
 return {source,blocks,plainText:blocks.map(block=>block.plainText).join('\n'),warnings,truncated:warnings.length>0};
}
