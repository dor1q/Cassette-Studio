const UNIT=25.4/600;
const indentOf=line=>line.match(/^[ \t]*/)[0].replace(/\t/g,'    ').length;
const stripIndent=(line,count)=>line.replace(/^[ \t]*/,prefix=>' '.repeat(Math.max(0,prefix.replace(/\t/g,'    ').length-count)));

function listMarker(line){
 const match=/^([ \t]*)(?:(\d{1,9})([.)])|([-+*]))(?:([ \t]+)(.*)|$)/.exec(line);
 if(!match)return null;
 const indent=indentOf(line),ordered=match[2]!==undefined,token=ordered?match[2]+match[3]:match[4],space=(match[5]||' ').replace(/\t/g,'    ').length;
 return {indent,ordered,start:ordered?Number(match[2]):null,delimiter:ordered?match[3]:match[4],contentIndent:indent+token.length+(space<=4?space:1),value:(space>4?' '.repeat(space-1):'')+(match[6]||'')};
}

function heading(line){
 const match=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
 return match?{kind:'heading',level:match[1].length,value:(match[2]||'').replace(/[ \t]+#+[ \t]*$/,'').trim(),source:line}:null;
}

// The reference turns every source newline into a hard break and substitutes
// NBSP for an empty physical line before parsing Markdown. Those lines remain
// in the paragraph or tight list item, rather than starting a loose list.
export function referenceTrayCreditsBlocks(value){
 const lines=String(value||'').trim().replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()?line:'\u00a0');
 const parse=source=>{
  const blocks=[];let plain=[];
  const flush=()=>{if(plain.length){blocks.push({kind:'paragraph',value:plain.join('\n')});plain=[]}};
  for(let index=0;index<source.length;){
   const title=heading(source[index]),marker=listMarker(source[index]);
   if(title){flush();blocks.push(title);index++;continue}
   const interrupts=marker&&marker.indent<=3&&(!plain.length||(!marker.ordered||marker.start===1)&&marker.value.trim());
   if(!interrupts){plain.push(source[index++]);continue}
   flush();const items=[],base=marker.indent;
   while(index<source.length){
    const first=listMarker(source[index]);
    if(!first||first.indent>base+3||first.ordered!==marker.ordered||first.delimiter!==marker.delimiter)break;
    const item=[first.value];index++;
    while(index<source.length){
     const next=listMarker(source[index]),indent=indentOf(source[index]);
     if(next&&next.indent<first.contentIndent)break;
     if(indent<first.contentIndent&&heading(source[index]))break;
     item.push(indent>=first.contentIndent?stripIndent(source[index],first.contentIndent):source[index]);index++;
    }
    items.push(parse(item));
   }
   blocks.push({kind:'list',ordered:marker.ordered,items});
  }
  flush();return blocks;
 };
 return parse(lines);
}

// Keep Markdown block geometry local to imported Tray credits. The original
// stylesheet resets both list kinds to zero padding; only ordered lists restore
// an inside decimal marker. Its ol component drops the source start attribute.
export function referenceTrayCredits(value,face,{layoutText,headingSize,x=0,y=0,leadingMargin=0}={}){
 const sections=[];let pen=y,pendingMargin=0,first=true;
 const append=(text,style,{topMargin=0,bottomMargin=0,block='paragraph',source=text,depth=0,marker=''}={})=>{
  if(!text){pendingMargin=Math.max(pendingMargin,topMargin,bottomMargin);return}
  pen+=first?Math.max(0,Math.max(pendingMargin,topMargin)-leadingMargin):Math.max(pendingMargin,topMargin);
  const layout=layoutText(text,style);
  sections.push({kind:'credits',text:source,layer:style,layout,x,y:pen,opacity:.8,creditsBlock:block,listDepth:depth,...(marker?{marker}:{})});
  pen+=layout.height;pendingMargin=bottomMargin;first=false;
 };
 const render=(blocks,{inItem=false,marker='',depth=0}={})=>{
  let prefix=marker;
  for(const block of blocks){
   if(block.kind==='list'){
    if(prefix){append(prefix,face,{block:'list-marker',depth,marker:prefix});prefix=''}
    block.items.forEach((item,index)=>{render(item,{inItem:true,marker:block.ordered?(index+1)+'.':'',depth:depth+1});pendingMargin=Math.max(pendingMargin,8*UNIT)});
   }else if(block.kind==='heading'){
    if(prefix){append(prefix,face,{block:'list-marker',depth,marker:prefix});prefix=''}
    const style={...face};let topMargin=0,bottomMargin=0;
    if(block.level<=2){style.size=headingSize*(block.level===1?1.2:1);style.fontWeight=block.level===1?700:600;style.bold=false;topMargin=block.level===2?24*UNIT:0;bottomMargin=(block.level===1?20:16)*UNIT}
    append(block.value,style,{topMargin,bottomMargin,block:'heading',source:block.source,depth});
   }else{
    append((prefix?prefix+' ':'')+block.value,face,{bottomMargin:inItem?0:16*UNIT,block:inItem?'list-item':'paragraph',depth,marker:prefix});prefix='';
   }
  }
  if(prefix)append(prefix,face,{block:'list-marker',depth,marker:prefix});
 };
 render(referenceTrayCreditsBlocks(value));
 return {sections,height:pen-y,marginBottom:pendingMargin};
}
