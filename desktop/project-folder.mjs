import {constants} from 'node:fs';
import {mkdir,rename,unlink,link,lstat,realpath,readdir,open} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {hostname,tmpdir} from 'node:os';
import {normalizeEditorMode} from '../src/media-formats.js';

export const PROJECT_FOLDER_NAME='Cassette Studio Projects';
export const MAX_PROJECT_BYTES=64*1024*1024;
const CONFIG_NAME='project-folder.json',MARKER_NAME='.cassette-studio-library.json';
const FOLDER_FORMAT='cassette-studio-folder',PROJECT_FORMAT='cassette-studio-project';
const ID=/^[a-z0-9][a-z0-9_-]{0,79}$/;
const DEVICE=/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_RECORDS=2000;
const MACHINE=createHash('sha256').update(hostname().toLowerCase()).digest('hex').slice(0,32);
export function projectFolderLockDirectory(directory){return path.join(tmpdir(),'cassette-studio-project-locks',MACHINE,createHash('sha256').update(normalized(directory)).digest('hex'))}
function processAlive(pid){try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}}

export class ProjectFolderError extends Error{
 constructor(code,message){super(message);this.name='ProjectFolderError';this.code=code}
}
const fail=(code,message)=>{throw new ProjectFolderError(code,message)};
const absent=e=>e?.code==='ENOENT';
const normalized=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
function validId(value){if(typeof value!=='string'||!ID.test(value)||DEVICE.test(value))fail('INVALID_ID','Неверный идентификатор проекта.');return value}
function titleOf(project){return String(project?.title||project?.data?.album||'Проект').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200)||'Проект'}
function summary(record){return {id:record.id,title:record.title,revision:record.revision,createdAt:record.createdAt,updatedAt:record.updatedAt,updated:Date.parse(record.updatedAt),favorite:record.favorite===true,kind:record.kind}}
function revisionMatches(record,expected){if(typeof expected!=='string'||record.revision!==expected)fail('CONFLICT','Проект изменён на другом компьютере. Обновите библиотеку или сохраните отдельную копию.')}
function validMetadata(record,id){return record?.format===PROJECT_FORMAT&&record.version===1&&record.id===id&&typeof record.revision==='string'&&!!record.revision&&typeof record.title==='string'&&Number.isFinite(Date.parse(record.updatedAt))}
function parseRecord(bytes,id){
 let record;try{record=JSON.parse(bytes)}catch{fail('INVALID_PROJECT','Файл проекта повреждён или имеет другой формат.')}
 if(!validMetadata(record,id)||!record.project||typeof record.project!=='object'||Array.isArray(record.project))fail('INVALID_PROJECT','Файл не является проектом Cassette Studio.');
 return record;
}
function parseSummary(bytes,id){
 const text=bytes.toString('utf8'),projectAt=text.indexOf(',"project":');
 if(projectAt<0||text[projectAt+',"project":'.length]!=='{')fail('INVALID_PROJECT','Файл не является проектом Cassette Studio.');
 let record;try{record=JSON.parse(text.slice(0,projectAt)+'}')}catch{fail('INVALID_PROJECT','Файл проекта повреждён или имеет другой формат.')}
 if(!validMetadata(record,id))fail('INVALID_PROJECT','Файл не является проектом Cassette Studio.');return summary(record);
}
function filesystemError(error){
 if(error instanceof ProjectFolderError)return error;
 if(['EACCES','EPERM','EROFS'].includes(error?.code))return new ProjectFolderError('UNAVAILABLE','Папка недоступна для сохранения. Проверьте доступ и работу облачной программы.');
 if(absent(error))return new ProjectFolderError('UNAVAILABLE','Папка библиотеки недоступна. Подключите диск или выберите папку заново.');
 if(error?.code==='ENOSPC')return new ProjectFolderError('NO_SPACE','На диске недостаточно места для сохранения проекта.');
 return new ProjectFolderError('IO_ERROR','Не удалось прочитать или сохранить проект. Повторите действие.');
}

// All ancestors are checked: junctions on Windows are reported as symbolic links.
async function checkedDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.includes('\0'))fail('UNSAFE_PATH','Выберите обычную папку, а не ссылку на другую папку.');
 const absolute=path.resolve(directory),root=path.parse(absolute).root;
 let cursor=root;
 for(const component of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,component);const stat=await lstat(cursor);
  if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_PATH','Папка библиотеки содержит ссылку или перенаправление. Выберите обычную папку.');
 }
 // Resolve legitimate Windows 8.3 names after rejecting every reparse point.
 return realpath(absolute);
}
async function safeFile(file,maxBytes,headBytes=0){
 const parent=await checkedDirectory(path.dirname(file));
 const before=await lstat(file);
 if(before.isSymbolicLink()||!before.isFile()||before.nlink>1)fail('UNSAFE_PATH','Файл проекта должен быть обычным файлом, а не ссылкой.');
 if(before.size>maxBytes)fail('TOO_LARGE','Проект слишком большой. Максимальный размер — 64 МБ.');
 if(normalized(await realpath(file))!==normalized(path.join(parent,path.basename(file))))fail('UNSAFE_PATH','Файл проекта находится за пределами библиотеки.');
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const current=await handle.stat();
  if(!current.isFile()||current.dev!==before.dev||current.ino!==before.ino||current.nlink>1)fail('UNSAFE_PATH','Файл изменился во время чтения. Повторите действие.');
  if(current.size>maxBytes)fail('TOO_LARGE','Проект слишком большой. Максимальный размер — 64 МБ.');
  let bytes;
  if(headBytes){const buffer=Buffer.alloc(Math.min(headBytes,current.size));const result=await handle.read(buffer,0,buffer.length,0);bytes=buffer.subarray(0,result.bytesRead)}
  else{
   // A cloud client can replace or grow a file while it is open. Never let
   // readFile allocate beyond the accepted limit before rejecting that growth.
   const chunks=[];let total=0;
   while(total<=maxBytes){
    const buffer=Buffer.alloc(Math.min(256*1024,maxBytes+1-total));
    const result=await handle.read(buffer,0,buffer.length,null);if(!result.bytesRead)break;
    chunks.push(buffer.subarray(0,result.bytesRead));total+=result.bytesRead;
   }
   bytes=Buffer.concat(chunks,total);
  }
  if(bytes.byteLength>maxBytes)fail('TOO_LARGE','Проект слишком большой. Максимальный размер — 64 МБ.');
  return bytes;
 }finally{await handle.close()}
}
async function writeExclusive(file,bytes){const handle=await open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}}
async function removeTemp(file){try{const stat=await lstat(file);if(stat.isFile()&&!stat.isSymbolicLink())await unlink(file)}catch(error){if(!absent(error))throw error}}

export function createProjectFolderStore(configDirectory,{maxBytes=MAX_PROJECT_BYTES}={}){
 const configFile=path.join(configDirectory,CONFIG_NAME);
 let selected=null,loaded=false,queue=Promise.resolve();
 const serial=operation=>{const result=queue.then(async()=>{try{return await operation()}catch(error){throw filesystemError(error)}});queue=result.catch(()=>{});return result};
 async function load(){
  if(loaded)return;loaded=true;
  try{
   const value=JSON.parse(await safeFile(configFile,8192));
   if(value?.format==='cassette-studio-folder-settings'&&value.version===1&&typeof value.directory==='string'&&path.isAbsolute(value.directory))selected=path.resolve(value.directory);
  }catch(error){if(!absent(error))selected=null}
 }
 async function writeConfig(directory){
  await mkdir(configDirectory,{recursive:true});await checkedDirectory(configDirectory);
  try{const stat=await lstat(configFile);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink>1)fail('UNSAFE_PATH','Настройки папки повреждены.')}catch(error){if(!absent(error))throw error}
  const temp=path.join(configDirectory,`.project-folder-${randomUUID()}.tmp`);
  try{await writeExclusive(temp,JSON.stringify({format:'cassette-studio-folder-settings',version:1,directory}));await rename(temp,configFile)}finally{await removeTemp(temp)}
 }
 async function library(){
  await load();if(!selected)fail('NOT_CONFIGURED','Сначала выберите папку для проектов.');
  const parent=await checkedDirectory(selected),directory=await checkedDirectory(path.join(parent,PROJECT_FOLDER_NAME));
  let marker;try{marker=JSON.parse(await safeFile(path.join(directory,MARKER_NAME),4096))}catch(error){if(error instanceof ProjectFolderError)throw error;fail('INVALID_FOLDER','В выбранной папке нет библиотеки Cassette Studio.')}
  if(marker?.format!==FOLDER_FORMAT||marker.version!==1)fail('INVALID_FOLDER','Папка не является библиотекой Cassette Studio.');
  return directory;
 }
 async function statusInternal(){
  await load();if(!selected)return {configured:false,available:false,folderLabel:''};
  const folderLabel=path.join(selected,PROJECT_FOLDER_NAME);
  try{await library();return {configured:true,available:true,folderLabel}}catch(error){const safe=filesystemError(error);return {configured:true,available:false,folderLabel,error:{code:safe.code,message:safe.message}}}
 }
 async function readInternal(directory,id){return parseRecord(await safeFile(path.join(directory,validId(id)+'.cassette.json'),maxBytes),id)}
 async function existing(directory,id){try{return await readInternal(directory,id)}catch(error){if(absent(error))return null;throw error}}
 function checkTarget(directory,payload){
  if(payload?.expectedFolder!=null&&(typeof payload.expectedFolder!=='string'||normalized(payload.expectedFolder)!==normalized(directory)))fail('FOLDER_CHANGED','Выбранная папка изменилась. Обновите библиотеку и повторите действие.');
 }
 async function localLocks(directory){
  const target=projectFolderLockDirectory(directory);let current=await checkedDirectory(tmpdir());
  // Keep transient locks off the synced drive. A crashed remote app must not
  // leave a lock that another computer can never validate or safely recover.
  for(const component of path.relative(tmpdir(),target).split(path.sep)){
   current=path.join(current,component);try{await mkdir(current)}catch(error){if(error.code!=='EEXIST')throw error}
   current=await checkedDirectory(current);
  }
  return current;
 }
 async function withLock(directory,id,operation){
  const locks=await localLocks(directory),lockFile=path.join(locks,`.${id}.lock`),nonce=randomUUID(),temp=path.join(locks,`.${id}-${nonce}.lock.tmp`);let acquired=false;
  // Publish a complete lock atomically. A crash between opening and writing a
  // lock used to leave an empty file that could never be safely recovered.
  try{
  await writeExclusive(temp,JSON.stringify({format:'cassette-studio-project-lock',id,nonce,machine:MACHINE,pid:process.pid,createdAt:new Date().toISOString()}));
  for(let attempt=0;attempt<2;attempt++){
   try{await link(temp,lockFile);acquired=true;break}catch(error){
    if(error.code!=='EEXIST')throw error;
    let stale=false;
    try{
     const before=await lstat(lockFile),value=JSON.parse(await safeFile(lockFile,4096));
     if(value.format==='cassette-studio-project-lock'&&value.id===id&&value.machine===MACHINE&&typeof value.nonce==='string'&&Number.isInteger(value.pid)&&value.pid>0&&Number.isFinite(Date.parse(value.createdAt))&&!processAlive(value.pid)){
      const after=await lstat(lockFile),again=JSON.parse(await safeFile(lockFile,4096));
      if(after.ino===before.ino&&after.dev===before.dev&&again.nonce===value.nonce){await unlink(lockFile);stale=true}
     }
    }catch(recoveryError){if(absent(recoveryError))stale=true}
    if(attempt===0&&stale)continue;
    fail('BUSY','Этот проект сейчас сохраняется. Повторите действие через несколько секунд.');
   }
  }
  }finally{await removeTemp(temp)}
  try{return await operation()}
  finally{
   if(acquired)try{const current=JSON.parse(await safeFile(lockFile,4096));if(current.format==='cassette-studio-project-lock'&&current.nonce===nonce)await unlink(lockFile)}catch(error){if(!absent(error))throw error}
  }
 }
 async function writeRecord(directory,record,prior){
  let bytes;try{bytes=Buffer.from(JSON.stringify(record))}catch{fail('INVALID_PROJECT','Проект не удалось преобразовать в файл.')}
  if(bytes.byteLength>maxBytes)fail('TOO_LARGE','Проект слишком большой. Максимальный размер — 64 МБ.');
  const file=path.join(directory,record.id+'.cassette.json'),temp=path.join(directory,`.${record.id}-${randomUUID()}.tmp`);
  try{
   await writeExclusive(temp,bytes);await library();
   const current=await existing(directory,record.id);
   if(prior){if(!current||current.revision!==prior.revision)fail('CONFLICT','Проект изменён во время сохранения. Обновите библиотеку или сохраните отдельную копию.');await rename(temp,file)}
   else{if(current)fail('CONFLICT','Проект с таким идентификатором уже существует. Сохраните отдельную копию.');try{await link(temp,file)}catch(error){if(error.code==='EEXIST')fail('CONFLICT','В библиотеке уже есть файл с таким именем.');throw error}}
  }finally{await removeTemp(temp)}
  return summary(record);
 }
 const saveInternal=async payload=>{
  if(!payload||typeof payload!=='object')fail('INVALID_PROJECT','Не передан проект.');
  const id=payload.id==null?randomUUID():validId(payload.id),project=payload.project;
  if(!project||typeof project!=='object'||Array.isArray(project))fail('INVALID_PROJECT','Не передан проект.');
  const directory=await library();checkTarget(directory,payload);return withLock(directory,id,async()=>{
   const prior=await existing(directory,id);
   if(prior)revisionMatches(prior,payload.expectedRevision);
   else if(payload.expectedRevision!=null)fail('CONFLICT','Проект больше не находится в библиотеке. Сохраните отдельную копию.');
   const mode=normalizeEditorMode(project.editorMode??(project.mode==='cassette-label'?'label':project.mode));
   const now=new Date().toISOString(),record={format:PROJECT_FORMAT,version:1,id,revision:randomUUID(),createdAt:prior?.createdAt||now,updatedAt:now,title:titleOf(project),favorite:prior?.favorite===true,kind:mode==='label'?'cassette-label':mode,project};
   return writeRecord(directory,record,prior);
  });
 };
 async function updateRecord(payload,change){
  if(!payload||typeof payload!=='object')fail('INVALID_PROJECT','Не передан проект.');
  const id=validId(payload.id),directory=await library();checkTarget(directory,payload);return withLock(directory,id,async()=>{
   const prior=await existing(directory,id);if(!prior)fail('NOT_FOUND','Проект не найден. Обновите библиотеку.');revisionMatches(prior,payload.expectedRevision);
   const record={...prior,revision:randomUUID(),updatedAt:new Date().toISOString()};change(record);return writeRecord(directory,record,prior);
  });
 }
 return {
  status:()=>serial(statusInternal),
  configure:directory=>serial(async()=>{
   const parent=await checkedDirectory(directory),child=path.join(parent,PROJECT_FOLDER_NAME);
   let created=false;try{await mkdir(child);created=true}catch(error){if(error.code!=='EEXIST')throw error}
   await checkedDirectory(child);const marker=path.join(child,MARKER_NAME);
   try{
    const value=JSON.parse(await safeFile(marker,4096));if(value?.format!==FOLDER_FORMAT||value.version!==1)fail('INVALID_FOLDER','В этой папке уже есть другая библиотека. Выберите другую папку.');
   }catch(error){
    if(!absent(error))throw error;
    if(!created&&(await readdir(child)).length)fail('INVALID_FOLDER','Папка Cassette Studio Projects уже содержит другие файлы. Выберите другую папку.');
    try{await writeExclusive(marker,JSON.stringify({format:FOLDER_FORMAT,version:1}))}catch(writeError){if(writeError.code!=='EEXIST')throw writeError;const value=JSON.parse(await safeFile(marker,4096));if(value?.format!==FOLDER_FORMAT||value.version!==1)fail('INVALID_FOLDER','Папка не является библиотекой Cassette Studio.')}
   }
   await writeConfig(parent);selected=parent;loaded=true;return statusInternal();
  }),
  disconnect:()=>serial(async()=>{await writeConfig(null);selected=null;loaded=true;return statusInternal()}),
  list:()=>serial(async()=>{
   const directory=await library(),entries=await readdir(directory,{withFileTypes:true}),projects=[];let skipped=0,limited=false,examined=0;
   for(const entry of entries){
    const match=/^([a-z0-9][a-z0-9_-]{0,79})\.cassette\.json$/.exec(entry.name);
    if(!match||DEVICE.test(match[1])||!entry.isFile()||entry.isSymbolicLink())continue;
    if(projects.length>=MAX_RECORDS||examined++>=MAX_RECORDS*2){limited=true;break}
    // Metadata precedes the embedded assets: listing never loads full cover/font data.
    try{projects.push(parseSummary(await safeFile(path.join(directory,entry.name),maxBytes,8192),match[1]))}catch{skipped++}
   }
   projects.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id));return {projects,skipped,limited};
  }),
  read:id=>serial(async()=>{const directory=await library();let record;try{record=await readInternal(directory,validId(id))}catch(error){if(absent(error))fail('NOT_FOUND','Проект не найден. Обновите библиотеку.');throw error}return {...summary(record),project:record.project}}),
  save:payload=>serial(()=>saveInternal(payload)),
  rename:payload=>serial(()=>updateRecord(payload,record=>{record.title=titleOf({title:payload.title});record.project={...record.project,title:record.title}})),
  favorite:payload=>serial(()=>updateRecord(payload,record=>{if(typeof payload.favorite!=='boolean')fail('INVALID_PROJECT','Не передана отметка избранного.');record.favorite=payload.favorite})),
  remove:payload=>serial(async()=>{
   if(!payload||typeof payload!=='object')fail('INVALID_PROJECT','Не передан проект.');
   const id=validId(payload.id),directory=await library();checkTarget(directory,payload);return withLock(directory,id,async()=>{
    const record=await existing(directory,id);if(!record)fail('NOT_FOUND','Проект не найден. Обновите библиотеку.');revisionMatches(record,payload.expectedRevision);
    const trash=path.join(directory,'.trash');try{await mkdir(trash)}catch(error){if(error.code!=='EEXIST')throw error}await checkedDirectory(trash);await library();
    const current=await readInternal(directory,id);revisionMatches(current,payload.expectedRevision);
    const archive=path.join(trash,`${id}-${randomUUID()}.cassette.json`);await rename(path.join(directory,id+'.cassette.json'),archive);
    return {id,removed:true,recoverable:true};
   });
  })
 };
}
