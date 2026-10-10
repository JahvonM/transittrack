const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('transittrackDesktop',{openSetup:target=>{
 if(!['tablet','nfc'].includes(target))return Promise.reject(Error('Unsupported setup view'));
 return ipcRenderer.invoke('open-device-setup',target);
}});
