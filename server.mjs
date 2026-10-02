import {decalCatalog,fetchDecal} from './decal-catalog.mjs';
import {fontCatalog,fetchGoogleFont} from './google-fonts.mjs';
import {createServiceRequest,serviceJson} from './music-network.mjs';
import {createMusicImporter} from './music-importer.mjs';
import http from 'node:http';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
export async function startStudioServer(options={}){
const configDir=options.configDir||root,config={};
await mkdir(configDir,{recursive:true});
try{for(const line of (await readFile(path.join(configDir,'.env'),'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_]+)\s*=\s*(.*)$/);if(m)config[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}catch{}
for(const key of ['SPOTIFY_CLIENT_ID','YOUTUBE_API_KEY'])if(options.useEnvironment!==false&&process.env[key])config[key]=process.env[key];
let port=Number(options.port??process.env.PORT??8769),origin=`http://127.0.0.1:${port}`,redirect=origin+'/api/spotify/callback';
const allowedOrigins=()=>[origin,`http://localhost:${port}`,...(options.allowedOrigins||[])];
const cache=new Map();let mbLast=0,mbQueue=Promise.resolve();let spotifyToken='',spotifyRefresh='',spotifyExpires=0;const oauthStates=new Map();
const settingsToken=crypto.randomBytes(32).toString('hex');
const request=createServiceRequest({fetchImpl:options.fetchImpl});
let refreshing;
try{const saved=await options.spotifySession?.load();if(saved?.clientId===config.SPOTIFY_CLIENT_ID&&typeof saved.refreshToken==='string')spotifyRefresh=saved.refreshToken}catch{}
const rememberSpotify=async()=>{try{await options.spotifySession?.save({clientId:config.SPOTIFY_CLIENT_ID,refreshToken:spotifyRefresh})}catch{}};
const music=createMusicImporter({request,spotifyToken:token,youtubeKey:()=>config.YOUTUBE_API_KEY||'',musicbrainzAlbum:id=>album('musicbrainz',id),musicbrainzRequest:mb});
async function saveSettings(req){
if(req.headers['x-settings-token']!==settingsToken||!req.headers.origin||!req.headers['content-type']?.startsWith('application/json'))throw Error('Откройте настройки заново');
let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Слишком большой запрос')}
const input=JSON.parse(raw),changes={};
for(const [key,pattern] of [['SPOTIFY_CLIENT_ID',/^[a-f0-9]{32}$/i],['YOUTUBE_API_KEY',/^[A-Za-z0-9_-]{30,100}$/]]){if(Object.hasOwn(input,key)){if(typeof input[key]!=='string')throw Error('Некорректное значение');const value=input[key].trim();if(value&&!pattern.test(value))throw Error('Проверьте формат '+key);changes[key]=value}}
let old='';try{old=await readFile(path.join(configDir,'.env'),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
const lines=old.split(/\r?\n/).filter(line=>!Object.keys(changes).some(key=>new RegExp('^'+key+'\\s*=').test(line)));
for(const [key,value] of Object.entries(changes))lines.push(key+'='+value);
const tmp=path.join(configDir,'.env.tmp');await writeFile(tmp,lines.filter(Boolean).join('\n')+'\n',{mode:0o600});await rename(tmp,path.join(configDir,'.env'));
if(Object.hasOwn(changes,'SPOTIFY_CLIENT_ID')&&changes.SPOTIFY_CLIENT_ID!==config.SPOTIFY_CLIENT_ID){spotifyToken='';spotifyRefresh='';spotifyExpires=0;oauthStates.clear();music.clearCache();try{await options.spotifySession?.clear()}catch{}}
Object.assign(config,changes);music.clearCache();
}
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const json=(url,options)=>serviceJson(request,url,options);
async function mb(url){const next=mbQueue.then(async()=>{const delay=1100-(Date.now()-mbLast);if(delay>0)await new Promise(r=>setTimeout(r,delay));mbLast=Date.now();return json(url)});mbQueue=next.catch(()=>{});return next}
const artist=v=>(v||[]).map(a=>a.name||a.artist?.name||'').join(', ');
async function search(provider,q){
 if(!['apple','musicbrainz','deezer'].includes(provider))throw Error('Выберите музыкальный каталог');
 const key=provider+q,cached=cache.get(key);if(cached&&cached.expires>Date.now())return cached.data;let data;
 if(provider==='musicbrainz'){const r=await mb('https://musicbrainz.org/ws/2/release/?fmt=json&limit=20&query='+encodeURIComponent(q));data=(r.releases||[]).map(x=>({provider,id:x.id,album:x.title,artist:artist(x['artist-credit']),year:x.date||'',cover:''}))}
 else if(provider==='deezer'){const r=await json('https://api.deezer.com/search/album?limit=20&q='+encodeURIComponent(q));if(r.error)throw Error('Deezer временно не отдал результаты поиска');data=(r.data||[]).map(x=>({provider,id:String(x.id),album:x.title,artist:x.artist?.name||'',year:'',cover:x.cover_medium||''}))}
 else{const r=await json('https://itunes.apple.com/search?entity=album&country=US&limit=20&term='+encodeURIComponent(q));data=(r.results||[]).map(x=>({provider:'apple',id:String(x.collectionId),album:x.collectionName,artist:x.artistName,year:x.releaseDate?.slice(0,4),cover:x.artworkUrl100||''}))}
 if(cache.size>100)cache.clear();cache.set(key,{data,expires:Date.now()+300000});return data;
}
async function album(provider,id){if(provider==='musicbrainz'){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Некорректный MusicBrainz ID');const r=await mb(`https://musicbrainz.org/ws/2/release/${id}?fmt=json&inc=recordings+artist-credits+labels`);return {album:r.title,artist:artist(r['artist-credit']),url:'https://musicbrainz.org/release/'+id,note:[r.date,...(r['label-info']||[]).map(l=>l.label?.name)].filter(value=>value&&value!=='[no label]').join(' · '),cover:r['cover-art-archive']?.front?'https://coverartarchive.org/release/'+id+'/front-500':'',tracks:(r.media||[]).flatMap(m=>m.tracks||[]).map(t=>({title:t.title||t.recording?.title,artist:artist(t['artist-credit']||r['artist-credit']),seconds:Math.round((t.length||t.recording?.length||0)/1000)}))}}if(!/^\d+$/.test(id))throw Error('Некорректный ID альбома');if(provider==='deezer')return music.importLink('https://www.deezer.com/album/'+id);if(provider!=='apple')throw Error('Выберите музыкальный каталог');return music.apple({provider:'apple',type:'album',id,country:'US',url:'https://music.apple.com/us/album/'+id})}
async function token(force=false){
 if(!force&&spotifyToken&&spotifyExpires>Date.now()+30000)return spotifyToken;
 if(!spotifyRefresh)throw Error('Подключите Spotify в «Подключениях» для прямого импорта.');
 if(refreshing)return refreshing;
 const clientId=config.SPOTIFY_CLIENT_ID,refreshToken=spotifyRefresh;
 refreshing=(async()=>{
  try{
   const r=await json('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'refresh_token',refresh_token:refreshToken})});
   if(clientId!==config.SPOTIFY_CLIENT_ID)throw Error('Настройки Spotify изменились. Повторите вход.');
   if(!r.access_token)throw Error('Spotify не вернул доступ. Повторите вход.');
   spotifyToken=r.access_token;spotifyRefresh=r.refresh_token||spotifyRefresh;spotifyExpires=Date.now()+Number(r.expires_in||3600)*1000;music.clearCache();await rememberSpotify();return spotifyToken;
  }catch(e){if([400,401].includes(e.status)&&clientId===config.SPOTIFY_CLIENT_ID){spotifyToken='';spotifyRefresh='';spotifyExpires=0;try{await options.spotifySession?.clear()}catch{}throw Error('Сессия Spotify истекла. Повторите вход в «Подключениях».')}throw e}
 })();
 try{return await refreshing}finally{refreshing=undefined}
}
const spotifyPreview=(id,type)=>music.spotifyPreview(id,type);

const artworkHosts=['mzstatic.com','scdn.co','spotifycdn.com','coverartarchive.org','archive.org','ytimg.com','googleusercontent.com','vhs.texs.org','firebasestorage.googleapis.com','storage.googleapis.com','res.cloudinary.com','dzcdn.net'];
async function fetchImage(url){let u=new URL(url);for(let n=0;n<5;n++){const featured=u.hostname==='eizyapzorzvzfyowkmdu.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/featured-assets/');if(u.protocol!=='https:'||u.username||u.password||(!featured&&!artworkHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))))throw Error('Этот источник изображения не поддерживается. Загрузите файл.');const r=await request(u.href,{redirect:'manual'});if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();u=new URL(r.headers.get('location'),u);continue}if(!r.ok)throw Error('Обложка недоступна');const mime=r.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(mime)&&!(mime==='image/avif'&&u.hostname==='vhs.texs.org'&&u.pathname.startsWith('/_patterns/')))throw Error('Неизвестный формат обложки');const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>15000000)throw Error('Обложка слишком большая');chunks.push(chunk)}return {src:`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`}}throw Error('Слишком много переадресаций')}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.map':'application/json','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){send(res,403,{error:'Только локальный доступ'});return}const u=new URL(req.url,origin);if(req.headers.origin&&!allowedOrigins().includes(req.headers.origin)){send(res,403,{error:'Origin rejected'});return}
if(req.method==='POST'&&u.pathname==='/api/settings'){await saveSettings(req);send(res,200,{ok:true});return}
if(req.method!=='GET'){send(res,405,{error:'Method not allowed'});return}
if(u.pathname==='/api/decals'){send(res,200,await decalCatalog());return}
if(u.pathname==='/api/decal'){send(res,200,await fetchDecal(u.searchParams.get('category'),u.searchParams.get('id')));return}
if(u.pathname==='/api/fonts'){send(res,200,await fontCatalog());return}
if(u.pathname==='/api/font'){send(res,200,await fetchGoogleFont(u.searchParams.get('name'),u.searchParams.get('variant')||'400'));return}
if(u.pathname==='/api/status'){send(res,200,{spotify:!!config.SPOTIFY_CLIENT_ID,spotifyClientId:config.SPOTIFY_CLIENT_ID||'',spotifyConnected:!!(spotifyToken||spotifyRefresh),youtube:!!config.YOUTUBE_API_KEY,settingsToken,redirect});return}
if(u.pathname==='/api/search'){const q=u.searchParams.get('q')||'';if(q.length<2||q.length>300)throw Error('Введите от 2 до 300 символов');send(res,200,await search(u.searchParams.get('provider'),q));return}
if(u.pathname==='/api/album'){send(res,200,await album(u.searchParams.get('provider'),u.searchParams.get('id')||''));return}
if(u.pathname==='/api/spotify/preview'){const id=u.searchParams.get('id')||'';if(!/^[A-Za-z0-9]{22}$/.test(id))throw Error('Некорректный альбом Spotify');send(res,200,await spotifyPreview(id,u.searchParams.get('type')||'album'));return}
if(u.pathname==='/api/image'){send(res,200,await fetchImage(u.searchParams.get('url')));return}
if(u.pathname==='/api/import'){send(res,200,await music.importLink(u.searchParams.get('url')));return}
if(u.pathname==='/api/spotify/login'){if(!config.SPOTIFY_CLIENT_ID)throw Error('Нужен SPOTIFY_CLIENT_ID в .env');const state=crypto.randomBytes(20).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');oauthStates.set(state,{verifier,expires:Date.now()+600000});const params=new URLSearchParams({client_id:config.SPOTIFY_CLIENT_ID,response_type:'code',redirect_uri:redirect,scope:'playlist-read-private playlist-read-collaborative',state,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});res.writeHead(302,{Location:'https://accounts.spotify.com/authorize?'+params});res.end();return}
if(u.pathname==='/api/spotify/callback'){const state=u.searchParams.get('state'),flow=oauthStates.get(state);oauthStates.delete(state);if(!flow||flow.expires<Date.now())throw Error('Сессия входа истекла');if(u.searchParams.has('error'))throw Error('Вход отменён');const r=await json('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect,client_id:config.SPOTIFY_CLIENT_ID,code_verifier:flow.verifier})});spotifyToken=r.access_token;spotifyRefresh=r.refresh_token;spotifyExpires=Date.now()+r.expires_in*1000;music.clearCache();await rememberSpotify();if(options.onSpotifyConnected){options.onSpotifyConnected();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset=utf-8><title>Spotify подключён</title><h1>Spotify подключён</h1><p>Вернитесь в Cassette Studio. Эту вкладку можно закрыть.</p>')}else{res.writeHead(302,{Location:'/'});res.end()}return}
if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}const allowed=['/','/index.html','/app.js','/app.js.map','/style.css','/favicon.ico'];if(!allowed.includes(u.pathname)){send(res,404,{error:'Not found'});return}const file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data)
}catch(err){send(res,400,{error:err.message.includes('fetch failed')?'Нет соединения с музыкальным сервисом. Проверьте интернет.':err.message})}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
port=server.address().port;origin=`http://127.0.0.1:${port}`;redirect=origin+'/api/spotify/callback';
return {server,origin,redirect,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections()})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const studio=await startStudioServer();console.log(`Cassette Studio: ${studio.origin}`);
}

