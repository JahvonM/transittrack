// Office display windows only: the page asks the app for this window's
// display credential. Nothing else is exposed.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('transittrackDisplay',{credential:()=>ipcRenderer.invoke('office-display-credential')});
