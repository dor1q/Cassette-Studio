import {clone,esc,uid} from './model.js';

const LINKS_KEY='cassette-project-folder-links',TARGET_KEY='cassette-library-target';
export function unwrapFolderResult(result){
 if(result?.ok===true)return result;
 const error=Error(result?.error?.message||'Не удалось открыть папку проектов.');
 error.code=result?.error?.code||'UNAVAILABLE';throw error;
}
export function readFolderLinks(storage){
 try{
  const values=JSON.parse(storage?.getItem(LINKS_KEY)||'[]');
  return new Map(Array.isArray(values)?values.filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[1]&&typeof entry[1].id==='string'&&typeof entry[1].revision==='string'&&typeof entry[1].folderLabel==='string').slice(-1000):[]);
 }catch{return new Map()}
}

// Paths and revisions belong to this device's preferences, not portable artwork.
export function createFolderSession({bridge,storage,getProject,getMode=()=> 'jcard',newId=uid}){
 const links=readFolderLinks(storage);
 let busy=false;
 const persist=()=>{try{storage?.setItem(LINKS_KEY,JSON.stringify([...links].slice(-1000)))}catch{}};
 const call=async(name,...args)=>{
  if(!bridge?.[name])throw Error('Папка проектов доступна в приложении для Windows.');
  return unwrapFolderResult(await bridge[name](...args));
 };
 const linkFor=(project,status)=>{const link=links.get(project.libraryId);return link?.folderLabel===status.folderLabel?link:null};
 return {
  call,
  preferred(){try{return storage?.getItem(TARGET_KEY)==='folder'?'folder':'local'}catch{return 'local'}},
  prefer(target){try{storage?.setItem(TARGET_KEY,target==='folder'?'folder':'local')}catch{}},
  remember(project,record,status){if(!project.libraryId)project.libraryId=newId();links.set(project.libraryId,{id:record.id,revision:record.revision,folderLabel:status.folderLabel});persist()},
  matches(project,id,status){return linkFor(project,status)?.id===id},
  updateLink(id,record,status){for(const [key,link] of links)if(link.id===id&&link.folderLabel===status?.folderLabel){links.set(key,{...link,revision:record.revision});persist()}},
  forget(id,status){for(const [key,link] of links)if(link.id===id&&link.folderLabel===status?.folderLabel)links.delete(key);persist()},
  async save({copy=false}={}){
   if(busy)throw Error('Сохранение уже выполняется.');busy=true;
   try{
    const project=getProject(),initialId=project.libraryId,snapshot=clone(project),savedMode=getMode(),status=await call('status');
    if(!status.available){const error=Error(status.error?.message||'Выберите папку для проектов.');error.code=status.error?.code||'NOT_CONFIGURED';throw error}
    const prior=copy?null:linkFor(snapshot,status);
    snapshot.libraryId=copy?newId():snapshot.libraryId||newId();snapshot.mode=savedMode;
    const record=await call('save',{...(prior?{id:prior.id,expectedRevision:prior.revision}:{}),expectedFolder:status.folderLabel,project:snapshot});
    // Preserve identity only after the write commits. The user can keep editing meanwhile.
    this.remember(snapshot,record,status);
    if(getProject()===project&&project.libraryId===initialId)project.libraryId=snapshot.libraryId;
    return {record,project,status};
   }finally{busy=false}
  }
 };
}

export function createProjectFolderUI({bridge,storage,getProject,getMode,openProject,onProjectRename,saveAutosave,showLocal,modal,body,toast,closeModal}){
 const session=createFolderSession({bridge,storage,getProject,getMode});
 let status=null,records=[],generation=0,writing=false;
 const button=(label,action,attrs='')=>`<button type="button" data-folder-action="${action}" ${attrs}>${label}</button>`;
 const tabs=()=>`<nav class="library-tabs" aria-label="Место хранения"><button type="button" data-action="library-local">На этом устройстве</button>${button('Облачная папка','refresh','class="active"')}</nav>`;
 const active=()=>body.dataset.libraryView==='folder'&&body.closest?.('dialog')?.open!==false;
 const display=html=>{modal('Проекты',tabs()+html);body.dataset.libraryView='folder'};
 const render=()=>{
  const location=status?.configured?`<strong>${esc(status.folderLabel)}</strong><p class="hint">Синхронизацию выполняет программа OneDrive, Dropbox или Яндекс Диска. На втором компьютере выберите ту же папку.</p>`:'<strong>Выберите папку синхронизации</strong><p class="hint">Приложение создаст в ней папку «Cassette Studio Projects». Каждый проект включает свои изображения и шрифты.</p>';
  const actions=`<div class="row">${button(status?.configured?'Сменить папку':'Выбрать папку','choose')}${status?.configured?button('Обновить','refresh')+button('Отключить','disconnect'):''}</div>`;
  const issue=status?.configured&&!status.available?`<p class="library-message" role="status">${esc(status.error?.message||'Папка сейчас недоступна.')}</p>`:'';
  const save=status?.available?`<div class="row">${button('Сохранить текущий в папку','save','class="primary"')}${button('Сохранить как копию','save-copy')}</div>`:'';
  const rows=records.map(record=>`<article class="library-card"><div><strong>${esc(record.title)}</strong><small>${new Date(record.updatedAt).toLocaleString('ru')} · ${record.kind==='cassette-label'?'Cassette Label':'J-card'}</small></div>${button(record.favorite?'★':'☆','favorite',`data-id="${esc(record.id)}" aria-label="${record.favorite?'Убрать из избранного':'В избранное'}"`)}<div class="row">${button('Открыть','open',`data-id="${esc(record.id)}"`)}${button('Переименовать','rename',`data-id="${esc(record.id)}"`)}${button('Удалить','delete',`data-id="${esc(record.id)}"`)}</div></article>`).join('');
  display(`<section class="library-location">${location}${issue}${actions}</section>${save}${rows||(status?.available?'<p class="library-empty">В этой папке ещё нет проектов.</p>':'')}<p class="hint">Удалённые проекты перемещаются в подпапку .trash. Отключение папки сохраняет все файлы.</p>`);
 };
 async function show(){
  session.prefer('folder');const ticket=++generation;display('<p class="library-loading" role="status">Открываем библиотеку…</p>');
  try{
   const next=await session.call('status');let listing={projects:[]};
   if(next.available)listing=await session.call('list');
   if(ticket!==generation||!active())return;
   status=next;records=listing.projects||[];render();
   if(listing.skipped)toast('Некоторые повреждённые файлы пропущены: '+listing.skipped);
   if(listing.limited)toast('Показаны первые 2000 проектов.');
  }catch(error){if(ticket===generation&&active())display(`<p role="status">${esc(error.message)}</p>${button('Повторить','refresh')}`)}
 }
 function conflict(error){
  display(`<div class="library-conflict"><p role="status">${esc(error.message)}</p><p class="hint">Текущая работа останется открытой. Сохраните её отдельным проектом или обновите список, чтобы открыть версию из папки.</p><div class="row">${button('Сохранить как копию','save-copy','class="primary"')}${button('Обновить список','refresh')}</div></div>`);
 }
 async function save(options){
  const startedProject=getProject(),startedInFolder=active(),ticket=generation;
  try{
   const result=await session.save(options);if(getProject()===result.project)await saveAutosave?.(result.project);
   toast('«'+result.record.title+'» сохранён в папке синхронизации');if(active()&&ticket===generation)await show();return true;
  }catch(error){
   const relevant=getProject()===startedProject&&(!startedInFolder||active()&&ticket===generation);
   if(error.code==='CONFLICT'&&relevant)conflict(error);else if(error.code==='NOT_CONFIGURED'&&relevant)await show();else toast(error.message);return false;
  }
 }
 async function act(action,element){
  const record=records.find(item=>item.id===element?.dataset.id);
  switch(action){
   case 'refresh':return show();
   case 'choose':{const ticket=generation,result=await session.call('choose');if(!result.cancelled)session.prefer('folder');if(ticket===generation&&active())return show();return}
   case 'disconnect':{const ticket=generation;await session.call('disconnect');session.prefer('local');if(ticket===generation&&active())return showLocal();return}
   case 'save':return save();
   case 'save-copy':return save({copy:true});
   case 'open':{
    if(!record)return;const ticket=generation,startedProject=getProject(),startedFolder=status?.folderLabel;
    const result=await session.call('read',record.id),nextStatus=await session.call('status');
    if(ticket!==generation||!active()||getProject()!==startedProject||nextStatus.folderLabel!==startedFolder)return;
    const project=await openProject(result.project);session.remember(project,result,nextStatus);
    if(getProject()!==project)return;await saveAutosave?.(project);
    if(ticket===generation&&active())closeModal();toast('Проект открыт из папки');return;
   }
   case 'rename':{
    if(!record)return;display(`<label class="field">Название проекта<input id="folderProjectTitle" maxlength="200" value="${esc(record.title)}"></label><div class="row">${button('Сохранить название','rename-save',`data-id="${esc(record.id)}" class="primary"`)}${button('Назад','refresh')}</div>`);body.querySelector('#folderProjectTitle')?.focus();return;
   }
   case 'rename-save':{
    if(!record)return;const title=body.querySelector('#folderProjectTitle')?.value.trim();if(!title){toast('Введите название проекта');return}
    const current=getProject(),beforeTitle=current.title,linked=session.matches(current,record.id,status),currentStatus=status,ticket=generation;
    const result=await session.call('rename',{id:record.id,title,expectedRevision:record.revision,expectedFolder:currentStatus.folderLabel});session.updateLink(record.id,result,currentStatus);
    if(linked&&getProject()===current&&current.title===beforeTitle){await onProjectRename?.(current,result.title);if(getProject()===current)await saveAutosave?.(current)}
    if(ticket===generation&&active())return show();return;
   }
   case 'favorite':{
    if(!record)return;const currentStatus=status,ticket=generation;const result=await session.call('favorite',{id:record.id,favorite:!record.favorite,expectedRevision:record.revision,expectedFolder:currentStatus.folderLabel});session.updateLink(record.id,result,currentStatus);if(ticket===generation&&active())return show();return;
   }
   case 'delete':{
    if(!record)return;const currentStatus=status,ticket=generation;await session.call('remove',{id:record.id,expectedRevision:record.revision,expectedFolder:currentStatus.folderLabel});session.forget(record.id,currentStatus);toast('Проект перемещён в .trash');if(ticket===generation&&active())return show();return;
   }
  }
 }
 body.addEventListener('click',async event=>{
  const element=event.target.closest('[data-folder-action]');if(!element||!active()||writing)return;
  const action=element.dataset.folderAction;
  const ticket=generation,startedProject=getProject();writing=true;
  try{element.disabled=true;await act(action,element)}catch(error){if(error.code==='CONFLICT'&&ticket===generation&&active()&&getProject()===startedProject)conflict(error);else toast(error.message)}finally{writing=false;element.disabled=false}
 });
 return {show,save,preferred:()=>session.preferred(),prefer:target=>session.prefer(target)};
}
