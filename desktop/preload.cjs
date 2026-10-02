const {contextBridge,ipcRenderer}=require('electron');
const actions=new Set(['open-project','download-project','library','export','undo','redo']);
contextBridge.exposeInMainWorld('cassetteDesktop',{
 ready(){ipcRenderer.send('studio-editor-ready')},
 onMenu(callback){ipcRenderer.on('studio-menu',(_event,name)=>{if(actions.has(name))callback(name)})},
 onBeforeClose(callback){ipcRenderer.on('studio-before-close',async()=>{try{await callback();ipcRenderer.send('studio-close-ready',true)}catch{ipcRenderer.send('studio-close-ready',false)}})}
});
