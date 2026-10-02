import {parseMusicLink} from '../music-links.mjs';
export function playerEmbed(raw){
 let link;try{link=parseMusicLink(raw)}catch{return null}
 if(link.provider==='spotify')return {service:'Spotify',url:`https://open.spotify.com/embed/${link.type}/${link.id}`};
 if(link.provider==='youtube')return {service:'YouTube',url:link.type==='playlist'?'https://www.youtube-nocookie.com/embed/videoseries?list='+link.id:'https://www.youtube-nocookie.com/embed/'+link.id};
 if(link.provider==='apple'&&link.type==='playlist')return {service:'Apple Music',url:`https://embed.music.apple.com/${link.country.toLowerCase()}/playlist/${link.id}`};
 let u;try{u=new URL(raw)}catch{return null}
 if(u.protocol!=='https:')return null;
 if(u.hostname==='open.spotify.com'){
  const match=u.pathname.match(/^\/(album|playlist|track)\/([A-Za-z0-9]{22})\/?$/);
  if(match)return {service:'Spotify',url:`https://open.spotify.com/embed/${match[1]}/${match[2]}`};
 }
 if(u.hostname==='music.apple.com'){
  if(/^\/[a-z]{2}\/album\//i.test(u.pathname))return {service:'Apple Music',url:'https://embed.music.apple.com'+u.pathname};
 }
 if(['www.youtube.com','youtube.com','music.youtube.com','youtu.be'].includes(u.hostname)){
  const video=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v');
  const playlist=u.searchParams.get('list');
  if(playlist&&/^[A-Za-z0-9_-]{10,80}$/.test(playlist))return {service:'YouTube',url:'https://www.youtube-nocookie.com/embed/videoseries?list='+playlist};
  if(video&&/^[A-Za-z0-9_-]{11}$/.test(video))return {service:'YouTube',url:'https://www.youtube-nocookie.com/embed/'+video};
 }
 return null;
}
