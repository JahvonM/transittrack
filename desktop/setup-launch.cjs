const {isAppUrl}=require('./policy.cjs');
function registerSetupLauncher(ipcMain,getWindow,open){
 ipcMain.handle('open-device-setup',(event,target)=>{
  const window=getWindow();
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!isAppUrl(event.senderFrame.url))throw Error('Setup access denied.');
  if(!['tablet','nfc'].includes(target))throw Error('Unsupported setup view');
  open(target);return {ok:true};
 });
}
module.exports={registerSetupLauncher};
