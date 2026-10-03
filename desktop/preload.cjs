const {contextBridge,ipcRenderer}=require('electron');
const actions=new Set(['open-project','download-project','save-library','library','export','undo','redo']);
contextBridge.exposeInMainWorld('cassetteDesktop',{
 projectFolder:{
  status:()=>ipcRenderer.invoke('studio-project-folder-status'),
  choose:()=>ipcRenderer.invoke('studio-project-folder-choose'),
  disconnect:()=>ipcRenderer.invoke('studio-project-folder-disconnect'),
  list:()=>ipcRenderer.invoke('studio-project-folder-list'),
  read:id=>ipcRenderer.invoke('studio-project-folder-read',id),
  save:payload=>ipcRenderer.invoke('studio-project-folder-save',payload),
  rename:payload=>ipcRenderer.invoke('studio-project-folder-rename',payload),
  favorite:payload=>ipcRenderer.invoke('studio-project-folder-favorite',payload),
  remove:payload=>ipcRenderer.invoke('studio-project-folder-remove',payload)
 },
 ready(){ipcRenderer.send('studio-editor-ready')},
 onMenu(callback){ipcRenderer.on('studio-menu',(_event,name)=>{if(actions.has(name))callback(name)})},
 onBeforeClose(callback){ipcRenderer.on('studio-before-close',async()=>{try{await callback();ipcRenderer.send('studio-close-ready',true)}catch{ipcRenderer.send('studio-close-ready',false)}})}
});
