const uid=()=>globalThis.crypto?.randomUUID?.()||'m'+Date.now()+Math.random().toString(36).slice(2);
const oneLine=value=>String(value??'').replace(/[\r\n]+/g,' ').trim();

function metadataTrack(duration,label){
 const parts=label.match(/^(.+?)\s+[—–-]\s+(.+)$/);
 return {id:uid(),title:parts?parts[2]:label,artist:parts?parts[1]:'',seconds:Number.isFinite(duration)?Math.max(0,Math.round(duration)):0};
}

export function parseM3U(text){
 let pending=null,label='',artist=null;const tracks=[];
 const finish=sourcePath=>{
  const track=pending||{id:uid(),title:sourcePath.split(/[\\/]/).pop().replace(/\.[^.]+$/,''),artist:'',seconds:0};
  if(artist!==null){
   track.artist=artist;
   const prefix=artist+' - ';
   track.title=artist&&label.startsWith(prefix)?label.slice(prefix.length):label||track.title;
  }
  if(sourcePath)track.sourcePath=sourcePath;
  tracks.push(track);pending=null;label='';artist=null;
 };
 for(const raw of String(text).replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();
  if(line.startsWith('#EXTINF:')){
   if(pending)finish('');
   const match=line.match(/^#EXTINF:([-\d.]+)[^,]*,(.*)$/);
   if(match){label=match[2].trim();pending=metadataTrack(Number(match[1]),label);artist=null}
  }else if(line.startsWith('#EXTART:'))artist=line.slice(8).trim();
  else if(line&&!line.startsWith('#'))finish(line);
 }
 if(pending)finish('');
 return tracks;
}

export function serializeM3U(tracks){
 return '#EXTM3U\n'+tracks.map(track=>{
  const title=oneLine(track.title),artist=oneLine(track.artist),seconds=Number(track.seconds);
  const duration=Number.isFinite(seconds)&&seconds>0?Math.round(seconds):-1;
  const path=oneLine(track.sourcePath)||((title.replace(/[<>:"\\/|?*]/g,'_')||'track')+'.mp3');
  // EXTART removes the ambiguity of titles or artist names containing a dash.
  return `#EXTINF:${duration},${artist?artist+' - ':''}${title}\n#EXTART:${artist}\n${path}`;
 }).join('\n')+'\n';
}
