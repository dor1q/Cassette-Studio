import {app,BrowserWindow,Menu,dialog,protocol,session,shell,ipcMain,safeStorage} from 'electron';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStudioServer} from '../server.mjs';
import {createSpotifySessionStore} from './spotify-session.mjs';
import {createProjectFolderStore} from './project-folder.mjs';
import {APP_ORIGIN,APP_URL,isAppUrl,externalUrl,proxyUrl,trustedInitiator} from './policy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const smoke=process.argv.includes('--smoke-test');
const checkClose=smoke&&process.argv.includes('--check-close');
const profileArg=process.argv.find(a=>a.startsWith('--studio-profile='));
app.setPath('userData',path.join(app.getPath('appData'),'Cassette Studio'));
if(profileArg)app.setPath('userData',path.resolve(profileArg.slice('--studio-profile='.length)));
app.setName('Cassette Studio');
app.setAppUserModelId('org.cassettestudio.editor');
protocol.registerSchemesAsPrivileged([{scheme:'cassette',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let studio,window,quitting=false,closingSaved=false,closingPending=false,closeReport=Promise.resolve();
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus()}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{
  if((!smoke||checkClose)&&window&&!window.isDestroyed()&&!closingSaved){event.preventDefault();window.close();return}
  if(!studio||quitting)return;
  event.preventDefault();quitting=true;
  Promise.all([studio.close(),closeReport]).finally(()=>app.quit());
 });
 app.whenReady().then(start).catch(async error=>{
  if(smoke){await report({ok:false,error:error.message});app.exit(1)}
  else{dialog.showErrorBox('Cassette Studio не запустился',error.message);app.quit()}
 });
}
async function report(result){
 await mkdir(app.getPath('userData'),{recursive:true});
 await writeFile(path.join(app.getPath('userData'),'startup-check.json'),JSON.stringify({...result,version:app.getVersion(),packaged:app.isPackaged,time:new Date().toISOString()},null,2));
}
async function start(){
 const configDir=app.getPath('userData');await mkdir(configDir,{recursive:true});
 // Development launches can keep the user's existing local connection settings.
 if(!app.isPackaged&&!smoke){try{await readFile(path.join(configDir,'.env'))}catch{try{await copyFile(path.join(here,'..','.env'),path.join(configDir,'.env'))}catch{}}}
 const options={configDir,useEnvironment:false,allowedOrigins:[APP_ORIGIN],spotifySession:createSpotifySessionStore(configDir,safeStorage),onSpotifyConnected:()=>{if(window){window.show();window.focus()}}};
 try{studio=await startStudioServer({...options,port:smoke?0:8769})}catch(error){if(error.code!=='EADDRINUSE')throw error;studio=await startStudioServer({...options,port:8771})}
 protocol.handle('cassette',async request=>{
  try{
   if(!trustedInitiator(request.initiatorOrigin))return new Response('Доступ разрешён только редактору',{status:403});
   const target=proxyUrl(request.url,studio.origin),headers=new Headers();
   for(const key of ['content-type','x-settings-token'])if(request.headers.has(key))headers.set(key,request.headers.get(key));
   headers.set('Origin',APP_ORIGIN);
   const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
   if(body&&body.byteLength>4096)return new Response('Слишком большой запрос',{status:413});
   const response=await fetch(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(new URL(target).pathname==='/api/import'?120000:60000)});
   const responseHeaders=new Headers(response.headers);
   if(responseHeaders.get('content-type')?.startsWith('text/html'))responseHeaders.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: blob:; connect-src 'self'; frame-src https://open.spotify.com https://embed.music.apple.com https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'");
   return new Response(response.body,{status:response.status,headers:responseHeaders});
  }catch(error){return new Response(JSON.stringify({error:error.message}),{status:400,headers:{'Content-Type':'application/json'}})}
 });
 const ses=session.defaultSession;
 ses.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='clipboard-sanitized-write'&&isAppUrl(details.requestingUrl||contents.getURL())));
 ses.setPermissionCheckHandler((_contents,permission,requestingOrigin)=>permission==='clipboard-sanitized-write'&&isAppUrl(requestingOrigin));
 ses.on('will-download',(_event,item)=>{
  item.setSaveDialogOptions({title:'Сохранить файл',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});
  item.on('done',(_e,state)=>{if(state==='interrupted')dialog.showErrorBox('Не удалось сохранить файл','Повторите экспорт и выберите другую папку.')});
 });
 let resolveReady;const editorReady=new Promise(resolve=>{resolveReady=resolve});
 ipcMain.on('studio-editor-ready',event=>{if(event.sender===window?.webContents&&event.senderFrame===window.webContents.mainFrame)resolveReady(true)});
 window=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:700,show:false,title:'Cassette Studio',backgroundColor:'#f4f1e8',icon:path.join(here,'icon.png'),webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,preload:path.join(here,'preload.cjs')}});
 installProjectFolder(createProjectFolderStore(configDir));
 window.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'}});
 window.webContents.on('will-navigate',(event,url)=>{if(!isAppUrl(url)){event.preventDefault();openExternal(url)}});
 window.webContents.on('will-redirect',(event,url)=>{if(!isAppUrl(url)){event.preventDefault();openExternal(url)}});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.on('page-title-updated',event=>{event.preventDefault();window.setTitle('Cassette Studio')});
 let closeTimer;
 const closeFailed=async()=>{
  clearTimeout(closeTimer);closingPending=false;
  if(checkClose){await writeFile(path.join(configDir,'close-check.json'),JSON.stringify({ok:false,autosaveFlushed:false,version:app.getVersion(),time:new Date().toISOString()},null,2));app.exit(1);return}
  const answer=await dialog.showMessageBox(window,{type:'warning',title:'Сохранение проекта',message:'Не удалось завершить сохранение проекта.',detail:'Можно вернуться в редактор и сохранить проект в файл.',buttons:['Вернуться в редактор','Закрыть приложение'],defaultId:0,cancelId:0});
  if(answer.response===1){closingSaved=true;window.close()}
 };
 window.on('close',event=>{
  if(smoke&&!checkClose||closingSaved)return;event.preventDefault();if(closingPending)return;
  closingPending=true;window.webContents.send('studio-before-close');
  closeTimer=setTimeout(closeFailed,8000);
 });
 if(checkClose)window.on('closed',()=>{closeReport=writeFile(path.join(configDir,'close-check.json'),JSON.stringify({ok:closingSaved,autosaveFlushed:closingSaved,version:app.getVersion(),time:new Date().toISOString()},null,2))});
 ipcMain.on('studio-close-ready',(event,ok)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!closingPending)return;
  clearTimeout(closeTimer);if(ok===true){closingSaved=true;window.close()}else closeFailed();
 });
 const loadFailures=[];
 window.webContents.on('did-fail-load',(_event,code,description,url,mainFrame)=>{if(code!==-3)loadFailures.push({code,description,url,mainFrame})});
 window.webContents.on('render-process-gone',(_event,details)=>{if(smoke)report({ok:false,error:'Renderer stopped',details}).then(()=>app.exit(1))});
 installMenu();
 await window.loadURL(APP_URL);
 if(smoke){
  const ready=await Promise.race([editorReady,new Promise(resolve=>setTimeout(()=>resolve(false),10000))]);
  const status=await fetch(studio.origin+'/api/status').then(r=>r.json());
  const assets=await Promise.all(['/','/app.js','/style.css'].map(async url=>({url,status:(await fetch(studio.origin+url)).status})));
  let musicImports;
  if(process.argv.includes('--check-music-import')){
   const cases=[['Spotify','https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr',9],['Apple Music','https://music.apple.com/us/album/discovery/697194953',14],['Apple Music playlist','https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',50,true],['Deezer','https://www.deezer.com/album/302127',14],['YouTube','https://youtu.be/dQw4w9WgXcQ',1]];
   musicImports=await Promise.all(cases.map(async([service,url,expected,checkGallery])=>{
    try{
     const result=await fetch(studio.origin+'/api/import?url='+encodeURIComponent(url)).then(r=>r.json());
     if(result.error)throw Error(result.error);
     const image=await fetch(studio.origin+'/api/image?url='+encodeURIComponent(result.cover)).then(r=>r.json());
     const cover=!!image.src?.startsWith('data:image/');
     const gallery=checkGallery?{posters:result.customPosters?.length||0,trackImages:result.tracks.filter(t=>t.thumbnail).length,missingDurations:result.tracks.filter(t=>!t.seconds).length}:null;
     return {service,ok:result.tracks?.length===expected&&cover&&(!gallery||gallery.posters>0&&gallery.trackImages===expected&&gallery.missingDurations===0),tracks:result.tracks?.length,cover,...(gallery?{gallery}:{})};
    }catch(e){return {service,ok:false,error:e.message}}
   }));
  }
  await report({ok:ready&&!loadFailures.length&&assets.every(a=>a.status===200)&&(!musicImports||musicImports.every(i=>i.ok)),windowLoaded:true,editorReady:ready,assets,loadFailures,settingsAvailable:!!status.settingsToken,stableOrigin:APP_ORIGIN,...(musicImports?{musicImports}:{})});
  app.quit();
 }else window.show();
}
function openExternal(value){const url=externalUrl(value,studio.origin);if(url)shell.openExternal(url).catch(error=>dialog.showErrorBox('Не удалось открыть ссылку',error.message))}
function action(name){window?.webContents.send('studio-menu',name)}
function installProjectFolder(store){
 const handle=(method,operation)=>ipcMain.handle('studio-project-folder-'+method,async(event,payload)=>{
  if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||!isAppUrl(event.senderFrame.url))return {ok:false,error:{code:'UNTRUSTED',message:'Доступ разрешён только редактору.'}};
  try{return {ok:true,...await operation(payload)}}catch(error){return {ok:false,error:{code:error.code||'IO_ERROR',message:error.message||'Не удалось открыть библиотеку проектов.'}}}
 });
 handle('status',()=>store.status());
 handle('choose',async()=>{
  const choice=await dialog.showOpenDialog(window,{title:'Папка для проектов между компьютерами',buttonLabel:'Использовать эту папку',properties:['openDirectory','createDirectory']});
  if(choice.canceled||!choice.filePaths.length)return {cancelled:true,...await store.status()};
  return store.configure(choice.filePaths[0]);
 });
 handle('disconnect',()=>store.disconnect());
 handle('list',()=>store.list());
 handle('read',id=>store.read(id));
 for(const method of ['save','rename','favorite','remove'])handle(method,payload=>store[method](payload));
}
function installMenu(){
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Файл',submenu:[{label:'Открыть проект…',accelerator:'CmdOrCtrl+O',click:()=>action('open-project')},{label:'Сохранить в библиотеку',accelerator:'CmdOrCtrl+S',click:()=>action('save-library')},{label:'Скачать JSON…',accelerator:'CmdOrCtrl+Shift+S',click:()=>action('download-project')},{label:'Библиотека проектов',click:()=>action('library')},{type:'separator'},{label:'Экспорт и печать…',accelerator:'CmdOrCtrl+E',click:()=>action('export')},{type:'separator'},{label:'Выход',role:'quit'}]},
  {label:'Правка',submenu:[{label:'Отменить изменение макета',accelerator:'CmdOrCtrl+Z',click:()=>action('undo')},{label:'Повторить изменение макета',accelerator:'CmdOrCtrl+Shift+Z',click:()=>action('redo')},{type:'separator'},{role:'cut',label:'Вырезать'},{role:'copy',label:'Копировать'},{role:'paste',label:'Вставить'},{role:'selectAll',label:'Выделить всё'}]},
  {label:'Вид',submenu:[{role:'resetZoom',label:'Исходный масштаб'},{role:'zoomIn',label:'Увеличить'},{role:'zoomOut',label:'Уменьшить'},{type:'separator'},{role:'togglefullscreen',label:'Полный экран'}]},
  {label:'Помощь',submenu:[{label:'О приложении',click:()=>dialog.showMessageBox(window,{type:'info',title:'Cassette Studio',message:'Cassette Studio '+app.getVersion(),detail:'Редактор кассет и CD: J-card, наклейки, передние и задние CD-вкладыши.\nПроекты сохраняются на этом компьютере или в выбранной папке OneDrive, Dropbox и Яндекс Диска. Для каталогов и новых материалов нужен интернет.'})}]}
 ]));
}
