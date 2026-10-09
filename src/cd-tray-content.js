import {time,dimensions} from './model.js';
import {cdTrayTrackActive} from './cd-layout.js';
import {referenceCDTrayTrackDuration} from './cd-tray-font.js';
import {referenceTrayCredits} from './cd-tray-credits.js';
import {fittingLineCount} from './text-layout.js';

const UNIT=25.4/600;
const option=(p,l,key)=>l.trackOptions?.[key]??l[key]??p.settings[key];
export function usesReferenceTrayContent(layer,surface){return surface==='cdTray'&&layer.source==='cdTracks'&&layer.referenceCDTrayTrack&&!layer.referenceBlockCopy}

// Keep item layouts intact: column flow must not flatten the smaller credits
// into the main face, nor split an ordinary track between two columns.
export function referenceTrayContent(project,layer,surface,layoutText){
 const peers=(project.surfaces[surface]||[]).filter(peer=>peer.visible&&usesReferenceTrayContent(peer,surface)&&cdTrayTrackActive(project,peer,surface)).sort((a,b)=>(a.cdColumnIndex||0)-(b.cdColumnIndex||0));
 if(!peers.some(peer=>peer.id===layer.id))return {text:'',sections:[],overflow:false};
 const first=peers[0],items=option(project,first,'hideTracks')?[]:[...(!first.hideA?project.data.A:[]),...(!first.hideB?project.data.B:[])].slice(0,Number.isFinite(first.maxTracks)?Math.max(0,first.maxTracks):4000);
 const twoColumns=project.layout.columns===2,results=new Map(peers.map(peer=>[peer.id,{text:'',sections:[],overflow:false,trackHeight:0}]));
 const itemText=(track,peer)=>{let text=String(track.title||'');if(option(project,peer,'artists')&&track.artist)text+=' - '+track.artist;const duration=referenceCDTrayTrackDuration(track)||(track.seconds?time(track.seconds):'');return text+(option(project,peer,'durations')&&duration?' ('+duration+')':'')};
 const inline=option(project,first,'inlineTracks');let index=0,remaining=inline?items.map((track,i)=>(option(project,first,'numbers')?(i+1)+'. ':'')+itemText(track,first)).join(option(project,first,'bullets')?' · ':'  '):'';
 for(const peer of peers){
  const result=results.get(peer.id),texts=[];let top=0;
  if(inline){
   const face={...peer,literalText:true,autoFit:false},all=layoutText(remaining,face),cap=twoColumns?fittingLineCount(all,peer.h):all.lines.length;
   const height=all.lineHeights.slice(0,cap).reduce((sum,h)=>sum+h,0),layout={...all,lines:all.lines.slice(0,cap),lineRuns:all.lineRuns.slice(0,cap),widths:all.widths.slice(0,cap),baselines:all.baselines.slice(0,cap),lineHeights:all.lineHeights.slice(0,cap),height};
   if(remaining)result.sections.push({kind:'track',text:layout.lines.join('\n'),layer:face,layout,x:0,y:0,opacity:1});
   result.text=layout.lines.join('\n');result.trackHeight=height;remaining=all.lines.slice(cap).join('\n');result.overflow=height>peer.h+.1||peer===peers.at(-1)&&!!remaining;continue;
  }
  while(index<items.length){
   const track=items[index],number=option(project,peer,'numbers'),bullet=!number&&!twoColumns&&option(project,peer,'bullets'),prefix=number?(index+1)+'.':bullet?'-':'';
   const indent=number?peer.size*2.5:bullet?peer.size*5/6:0;
   const text=itemText(track,peer);
   const style={...peer,w:Math.max(.1,peer.w-indent),literalText:true,autoFit:false},layout=layoutText(text,style),bottom=top+layout.height;
   if(twoColumns&&bottom>peer.h+1e-9&&top>0)break;
   result.sections.push({kind:'track',text,layer:style,layout,x:indent,y:top,opacity:1});
   if(prefix){const face={...peer,w:Math.max(.1,indent-peer.size*5/9),literalText:true,autoFit:false,align:'left'};result.sections.push({kind:'number',text:prefix,layer:face,layout:layoutText(prefix,face),x:0,y:top,opacity:1})}
   texts.push((prefix?prefix+' ':'')+layout.lines.join('\n'));index++;result.trackHeight=bottom;top=bottom+8*UNIT;
   if(bottom>peer.h+1e-9){result.overflow=true;if(twoColumns)break}
  }
  result.text=texts.join('\n');
 }
 if(!inline&&index<items.length)results.get(peers.at(-1).id).overflow=true;
 const credits=option(project,first,'showProduction')?String(project.data.production||'').trim():'';
 if(credits){
  const result=results.get(first.id),columns=(project.surfaces[surface]||[]).filter(peer=>usesReferenceTrayContent(peer,surface)&&cdTrayTrackActive(project,peer,surface)).sort((a,b)=>(a.cdColumnIndex||0)-(b.cdColumnIndex||0)),owner=columns[0]||first,fullWidth=owner.w*(twoColumns?2:1),size=Math.max(.1,Math.round(first.size/UNIT*.85)*UNIT);
  const heightPercent=Math.max(.2,Math.min(1,(Number(project.layout.columnHeight)||100)/100));
  const top=items.length?(twoColumns?owner.h/heightPercent+20*UNIT:result.trackHeight+40*UNIT):0;
  const face={...first,size,w:fullWidth*.6,lineHeight:1.4,align:project.settings.referenceTrackAlign||'center',literalText:false,markdownHeadings:false,autoFit:false};
  const production=referenceTrayCredits(credits,face,{layoutText,headingSize:Math.round(first.size/UNIT*1.4)*UNIT,x:twoColumns?owner.x-first.x:0,y:top,leadingMargin:items.length?(twoColumns?20:40)*UNIT:0});
  result.sections.push(...production.sections);
  result.text=[result.text,credits].filter(Boolean).join('\n\n');
  const {h}=dimensions(project,surface);if(first.y+top+production.height>h-40*UNIT+.1)result.overflow=true;
 }
 return results.get(layer.id);
}
