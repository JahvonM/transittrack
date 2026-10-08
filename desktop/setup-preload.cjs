const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['scan','inspect','chooseHelper','installHelper','chooseKiosk','installKiosk','configure','startReader','readerStatus','testReader']);
contextBridge.exposeInMainWorld('deviceSetup',{run:(action,input={})=>{if(!allowed.has(action))return Promise.reject(Error('Unsupported setup action'));return ipcRenderer.invoke('device-setup',action,input);},onReaderEvent:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('reader-event',listener);return ()=>ipcRenderer.removeListener('reader-event',listener);}});
