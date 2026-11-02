const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('transittrackDesktop',{openSetup:target=>{
 if(!['tablet','nfc'].includes(target))return Promise.reject(Error('Unsupported setup view'));
 return ipcRenderer.invoke('open-device-setup',target);
},
// Admin → Office displays: open a display in its own window on a monitor
// connected to this computer. The main process checks every call comes from
// this window on the TransitTrack site.
displays:{
 screens:()=>ipcRenderer.invoke('office-displays','screens'),
 list:()=>ipcRenderer.invoke('office-displays','list'),
 open:options=>ipcRenderer.invoke('office-displays','open',options),
 close:id=>ipcRenderer.invoke('office-displays','close',id),
 closeAll:()=>ipcRenderer.invoke('office-displays','closeAll'),
 fullscreen:(id,on)=>ipcRenderer.invoke('office-displays','fullscreen',id,on),
 refresh:id=>ipcRenderer.invoke('office-displays','refresh',id),
 show:id=>ipcRenderer.invoke('office-displays','show',id),
 onChange:callback=>{
  if(typeof callback!=='function')return ()=>{};
  const listener=(_event,list)=>callback(list);
  ipcRenderer.on('office-displays-changed',listener);
  return ()=>ipcRenderer.removeListener('office-displays-changed',listener);
 },
}});
