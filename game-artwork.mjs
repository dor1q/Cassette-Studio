// Official APIs only: https://api-docs.igdb.com/ and
// https://www.steamgriddb.com/api/v2 (its /static/openapi.yml contract).
// Credentials stay in the local server; results contain public image metadata.
export const GAME_ARTWORK_SETTINGS=Object.freeze({
 STEAMGRIDDB_API_KEY:/^[A-Za-z0-9_-]{16,128}$/,
 IGDB_CLIENT_ID:/^[A-Za-z0-9_-]{8,128}$/,
 IGDB_CLIENT_SECRET:/^[A-Za-z0-9_-]{8,128}$/
});

const names={igdb:'IGDB',steamgriddb:'SteamGridDB'},MAX_JSON=2_000_000;
const validId=value=>/^[1-9]\d{0,9}$/.test(String(value||''))?String(value):'';
const title=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,300):'';
const dimension=value=>Number.isInteger(value)&&value>0&&value<=100000?value:0;
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
export class GameArtworkError extends Error{constructor(message,status=0){super(message);this.status=status}}
const upstreamError=(provider,status)=>new GameArtworkError(
 [400,401,403].includes(status)?names[provider]+': проверьте ключи в «Подключениях».'
 :status===429?names[provider]+': слишком много запросов. Повторите поиск позже.'
 :status===404?names[provider]+': игра или картинки не найдены.'
 :names[provider]+': сервис временно недоступен. Повторите поиск.',status);

function allowedApiUrl(url){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
 if(u.hostname==='api.igdb.com')return u.pathname==='/v4/games'&&!u.search;
 if(u.hostname==='id.twitch.tv')return ['/oauth2/token','/oauth2/validate'].includes(u.pathname)&&!u.search;
 if(u.hostname!=='www.steamgriddb.com')return false;
 return /^\/api\/v2\/search\/autocomplete\/[^/]+$/.test(u.pathname)&&!u.search||/^\/api\/v2\/(grids|heroes|logos|icons)\/game\/[1-9]\d{0,9}$/.test(u.pathname);
}

function steamImage(row,kind,index){
 const parts={grids:['grid','Обложка'],heroes:['hero','Панорама'],logos:['logo','Логотип'],icons:['icon','Значок']},[path,label]=parts[kind];
 if(typeof row?.url!=='string'||row.url.length>2000||row.animated===true)return null;
 let url;try{url=new URL(row.url)}catch{return null}
 if(url.protocol!=='https:'||url.hostname!=='cdn2.steamgriddb.com'||url.username||url.password||url.port||url.search||url.hash||!new RegExp('^/'+path+'/[a-f0-9]+\\.(png|jpe?g|webp)$','i').test(url.pathname))return null;
 const width=dimension(row.width),height=dimension(row.height);if(!width||!height)return null;
 return {file_path:url.href,width,height,label:label+' · '+(index+1),provider:'steamgriddb'};
}

function igdbImages(game){
 const images=[],seen=new Set();
 for(const [kind,label]of [['cover','Обложка'],['artworks','Иллюстрация'],['screenshots','Скриншот']]){
  const rows=kind==='cover'?[game?.cover]:Array.isArray(game?.[kind])?game[kind].slice(0,80):[];
  for(const [index,row]of rows.entries()){
   const width=dimension(row?.width),height=dimension(row?.height),id=row?.image_id;
   if(!width||!height||typeof id!=='string'||!/^[A-Za-z0-9]{1,200}$/.test(id)||seen.has(id)||row.animated===true)continue;
   // 1080p is a documented Fit size: the full picture fits these bounds.
   const ratio=Math.min(1,1920/width,1080/height);seen.add(id);
   images.push({file_path:'https://images.igdb.com/igdb/image/upload/t_1080p/'+id+'.jpg',width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio)),label:label+(kind==='cover'?'':' · '+(index+1)),provider:'igdb'});
   if(images.length===100)return images;
  }
 }
 return images;
}

export function createGameArtwork({fetchImpl=globalThis.fetch,getConfig=()=>({}),timeout=12000,now=Date.now,sleep=wait}={}){
 const cache=new Map(),pending=new Map(),queues=new Map();let generation=0,snapshot='',token='',expires=0,validated=0,tokenPending;
 const clearCache=()=>{generation++;cache.clear();pending.clear();token='';expires=0;validated=0;tokenPending=undefined};
 function configuration(){
  const config=getConfig()||{},next=Object.keys(GAME_ARTWORK_SETTINGS).map(key=>config[key]||'').join('\0');
  if(next!==snapshot){snapshot=next;clearCache()}
  return config;
 }
 function credentials(provider){
  if(!Object.hasOwn(names,provider))throw new GameArtworkError('Выберите IGDB или SteamGridDB');
  const config=configuration(),keys=provider==='igdb'?['IGDB_CLIENT_ID','IGDB_CLIENT_SECRET']:['STEAMGRIDDB_API_KEY'];
  if(keys.some(key=>!config[key]))throw new GameArtworkError(provider==='igdb'?'Для IGDB сохраните Twitch Client ID и Client Secret в «Подключениях».':'Для SteamGridDB сохраните свой API-ключ в «Подключениях».');
  if(keys.some(key=>typeof config[key]!=='string'||!GAME_ARTWORK_SETTINGS[key].test(config[key])))throw new GameArtworkError(names[provider]+': проверьте формат ключей в «Подключениях».');
  return config;
 }
 function status(){const config=getConfig()||{};return {steamgriddb:!!config.STEAMGRIDDB_API_KEY,igdb:!!(config.IGDB_CLIENT_ID&&config.IGDB_CLIENT_SECRET),igdbClientIdConfigured:!!config.IGDB_CLIENT_ID,igdbClientSecretConfigured:!!config.IGDB_CLIENT_SECRET}}
 async function apiJson(provider,url,options={}){
  if(!allowedApiUrl(url))throw new GameArtworkError('Адрес игрового каталога не поддерживается');
  // Space the actual API requests, including a 401 retry. Authentication can
  // take longer than the interval and must not allow the next game call to burst.
  if(new URL(url).hostname!=='id.twitch.tv'){
   const queue=queues.get(provider),delay=(queue?.next||0)-now();if(delay>0)await sleep(delay);
   if(queue)queue.next=now()+260;
  }
  const signal=AbortSignal.timeout(Math.max(10,Math.min(Number(timeout)||12000,30000)));let response;
  try{response=await fetchImpl(url,{...options,redirect:'error',signal,headers:{Accept:'application/json','User-Agent':'CassetteStudio (local artwork editor)',...options.headers}})}catch{throw new GameArtworkError(names[provider]+(signal.aborted?': загрузка заняла слишком много времени. Повторите поиск.':': нет соединения. Проверьте интернет.'))}
  if(response.redirected||!response.ok){try{await response.body?.cancel()}catch{}throw upstreamError(provider,response.status)}
  const declared=Number(response.headers.get('content-length'));if(declared>MAX_JSON){try{await response.body?.cancel()}catch{}throw new GameArtworkError(names[provider]+': ответ слишком большой.')}
  let raw='';
  try{
   const chunks=[];let length=0;
   for await(const chunk of response.body){length+=chunk.length;if(length>MAX_JSON)throw new GameArtworkError(names[provider]+': ответ слишком большой.');chunks.push(chunk)}
   raw=Buffer.concat(chunks).toString('utf8');
  }catch(error){if(error instanceof GameArtworkError)throw error;throw new GameArtworkError(names[provider]+': не удалось загрузить ответ. Повторите поиск.')}
  try{return JSON.parse(raw)}catch{throw new GameArtworkError(names[provider]+': сервис вернул некорректные данные.')}
 }
 function queued(provider,action){
  let queue=queues.get(provider);if(!queue){queue={tail:Promise.resolve(),count:0,next:0};queues.set(provider,queue)}
  if(queue.count>=8)throw new GameArtworkError(names[provider]+': дождитесь окончания текущей загрузки.');
  queue.count++;
  const promise=queue.tail.then(action);
  queue.tail=promise.catch(()=>{});return promise.finally(()=>{queue.count--});
 }
 const current=revision=>{configuration();if(revision!==generation)throw new GameArtworkError('Настройки игровых каталогов изменились. Повторите поиск.')};
 async function igdbToken(config,revision){
  if(token&&expires>now()+30000){
   if(now()-validated<3600000)return token;
   try{const value=await apiJson('igdb','https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+token}});current(revision);if(value.client_id!==config.IGDB_CLIENT_ID)throw new GameArtworkError('IGDB: проверьте Twitch Client ID в «Подключениях».');expires=now()+Number(value.expires_in||0)*1000;validated=now();if(expires>now()+30000)return token}catch(error){if(error.status!==401)throw error}
   token='';expires=0;
  }
  if(tokenPending)return tokenPending;
  const operation=(async()=>{
   const value=await apiJson('igdb','https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.IGDB_CLIENT_ID,client_secret:config.IGDB_CLIENT_SECRET,grant_type:'client_credentials'}).toString()});
   current(revision);
   if(typeof value.access_token!=='string'||!/^[A-Za-z0-9_-]{8,512}$/.test(value.access_token)||!Number.isFinite(value.expires_in)||value.expires_in<=0||String(value.token_type).toLowerCase()!=='bearer')throw new GameArtworkError('IGDB: Twitch не вернул доступ. Проверьте настройки подключения.');
   token=value.access_token;expires=now()+Math.min(value.expires_in,5184000)*1000;validated=now();return token;
  })();
  tokenPending=operation;try{return await operation}finally{if(tokenPending===operation)tokenPending=undefined}
 }
 async function igdbQuery(body,config,revision){
  return queued('igdb',async()=>{
   for(let attempt=0;attempt<2;attempt++){
    current(revision);const access=await igdbToken(config,revision);
    try{const data=await apiJson('igdb','https://api.igdb.com/v4/games',{method:'POST',headers:{'Content-Type':'text/plain','Client-ID':config.IGDB_CLIENT_ID,Authorization:'Bearer '+access},body});current(revision);if(!Array.isArray(data))throw new GameArtworkError('IGDB: сервис вернул некорректные данные.');return data}catch(error){if(error.status!==401||attempt)throw error;token='';expires=0}
   }
  });
 }
 async function steamQuery(path,config,revision){
  return queued('steamgriddb',async()=>{current(revision);const data=await apiJson('steamgriddb','https://www.steamgriddb.com/api/v2'+path,{headers:{Authorization:'Bearer '+config.STEAMGRIDDB_API_KEY}});current(revision);if(data?.success!==true||!Array.isArray(data.data))throw new GameArtworkError('SteamGridDB: сервис вернул некорректные данные.');return data.data});
 }
 async function cached(provider,key,action){
  const config=credentials(provider),revision=generation,cacheKey=provider+'|'+key;
  const found=cache.get(cacheKey);if(found&&found.expires>now())return structuredClone(found.data);
  let operation=pending.get(cacheKey);
  if(!operation){operation=(async()=>{const data=await action(config,revision);current(revision);if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(cacheKey,{data,expires:now()+300000});return data})();pending.set(cacheKey,operation)}
  try{return structuredClone(await operation)}finally{if(pending.get(cacheKey)===operation)pending.delete(cacheKey)}
 }
 async function search(provider,query){
  if(typeof query!=='string'||query.trim().length<2||query.trim().length>100||/[\u0000-\u001f\u007f]/.test(query))throw new GameArtworkError('Введите название игры: от 2 до 100 символов');
  const q=query.trim();
  return cached(provider,'search|'+q,async(config,revision)=>{
   const rows=provider==='igdb'?await igdbQuery('search '+JSON.stringify(q)+'; fields name,first_release_date; limit 20;',config,revision):await steamQuery('/search/autocomplete/'+encodeURIComponent(q),config,revision);
   const results=[],seen=new Set();
   for(const row of rows.slice(0,100)){
    const id=validId(row?.id),name=title(row?.name);if(!id||!name||seen.has(id))continue;seen.add(id);
    const result={id,title:name};if(provider==='igdb'&&Number.isFinite(row.first_release_date)){const year=new Date(row.first_release_date*1000).getUTCFullYear();if(year>=1950&&year<=2200)result.year=String(year)}
    results.push(result);if(results.length===20)break;
   }
   return results;
  });
 }
 async function images(provider,id){
  const gameId=validId(id);if(!gameId)throw new GameArtworkError('Некорректный ID игры');
  return cached(provider,'images|'+gameId,async(config,revision)=>{
   if(provider==='igdb'){
    const fields=['name','cover.image_id','cover.width','cover.height','cover.animated','artworks.image_id','artworks.width','artworks.height','artworks.animated','screenshots.image_id','screenshots.width','screenshots.height','screenshots.animated'];
    const rows=await igdbQuery('fields '+fields.join(',')+'; where id = '+gameId+'; limit 1;',config,revision);return igdbImages(rows.find(row=>String(row?.id)===gameId));
   }
   const found=[],seen=new Set();
   for(const kind of ['grids','heroes','logos','icons']){
    const mimes=kind==='icons'?'image/png':kind==='logos'?'image/png,image/webp':'image/png,image/jpeg,image/webp';
    let rows;try{rows=await steamQuery('/'+kind+'/game/'+gameId+'?'+new URLSearchParams({types:'static',mimes,limit:'25',page:'0'}),config,revision)}catch(error){if(error.status===404)continue;throw error}
    for(const [index,row]of rows.slice(0,100).entries()){const image=steamImage(row,kind,index);if(!image||seen.has(image.file_path))continue;seen.add(image.file_path);found.push(image);if(found.length===100)return found}
   }
   return found;
  });
 }
 return {search,images,status,clearCache};
}
