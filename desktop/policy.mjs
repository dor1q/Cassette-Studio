export const APP_ORIGIN='cassette://studio';
export const APP_URL=APP_ORIGIN+'/';
export function trustedInitiator(value){return !value||value===APP_ORIGIN}
export function isAppUrl(value){try{const u=new URL(value);return u.protocol==='cassette:'&&u.host==='studio'&&!u.username&&!u.password}catch{return false}}
export function externalUrl(value,serverOrigin){
 try{const u=new URL(value);if(u.username||u.password)return null;
  if(isAppUrl(value)&&u.pathname==='/api/spotify/login')return serverOrigin+u.pathname;
  if(u.protocol==='https:')return u.href;
  if(u.origin===serverOrigin&&u.pathname==='/api/spotify/login')return u.href;
 }catch{}
 return null;
}
export function proxyUrl(value,serverOrigin){
 if(!isAppUrl(value))throw Error('Недопустимый адрес приложения');
 const u=new URL(value);return serverOrigin+u.pathname+u.search;
}
