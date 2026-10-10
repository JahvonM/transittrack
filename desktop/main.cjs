const {app,BrowserWindow,Menu,dialog,shell,ipcMain}=require('electron');
const path=require('node:path');
const {APP_ORIGIN,isAppUrl,externalUrl}=require('./policy.cjs');
const {startBrowserSignIn,providerFromLoginUrl,providerFromRedirect,returnPathFromLoginUrl,signedInUrl,PROVIDER_NAMES}=require('./browser-signin.cjs');
const {createUpdateChecker,startUpdateChecks}=require('./updates.cjs');
const DESKTOP_VERSION=require('./package.json').version;
let mainWindow,deviceSetup,browserSignIn=null,updateChecker,stopUpdateChecks;
app.enableSandbox();
app.setAppUserModelId('com.transittrack.desktop');
if(!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(createWindow);
}
function openRoute(route='/') {
 if(mainWindow)mainWindow.loadURL(APP_ORIGIN+route).catch(showOffline);
}
function showOffline() {
 if(mainWindow&&!mainWindow.isDestroyed())mainWindow.loadFile(path.join(__dirname,'offline.html')).catch(()=>{});
}
// Google/Apple block sign-in inside app windows, so finish it in the person's
// own browser and receive the session back on a one-time loopback listener.
async function signInWithBrowser(provider,returnPath='/') {
 browserSignIn?.cancel();
 const flow=startBrowserSignIn({openExternal:url=>shell.openExternal(url),provider,returnPath});
 browserSignIn=flow;
 const closeDialog=new AbortController();
 flow.result.then(token=>{
  closeDialog.abort();
  if(!mainWindow||mainWindow.isDestroyed())return;
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();mainWindow.focus();
  if(!mainWindow.isFocused?.()){mainWindow.flashFrame?.(true);mainWindow.once('focus',()=>mainWindow?.flashFrame?.(false));}
  mainWindow.loadURL(signedInUrl(token,flow.returnPath)).catch(showOffline);
 },()=>closeDialog.abort()).finally(()=>{if(browserSignIn===flow)browserSignIn=null;});
 try{await flow.opened;}
 catch{
  flow.cancel();
  await dialog.showMessageBox(mainWindow,{type:'error',title:'Sign in',message:'Your web browser could not be opened.',detail:'Set a default web browser in Windows Settings and try again, or sign in with email and password.'});
  return;
 }
 const name=PROVIDER_NAMES[flow.provider]||'your account';
 while(!flow.finished){
  const {response}=await dialog.showMessageBox(mainWindow,{type:'info',title:'Finish signing in',message:'Finish signing in with '+name+' in your web browser',detail:'TransitTrack opened in your web browser. Sign in there, then choose "Open TransitTrack Desktop". This window signs in by itself when you finish.\n\nIf your browser asks to let the site connect to apps on this device, choose Allow.',buttons:['Cancel sign-in','Open browser again'],defaultId:1,cancelId:0,noLink:true,signal:closeDialog.signal});
  if(closeDialog.signal.aborted||flow.finished)break;
  if(response===1){await flow.reopen().catch(()=>{});continue;}
  flow.cancel();
 }
}
async function openExternal(value) {
 const url=externalUrl(value);if(!url)return;
 const {response}=await dialog.showMessageBox(mainWindow,{type:'question',title:'Open in your browser?',message:'This link opens outside TransitTrack Desktop.',detail:new URL(url).origin,buttons:['Cancel','Open browser'],defaultId:0,cancelId:0});
 if(response===1)await shell.openExternal(url);
}
function openDeviceSetup(target='tablet') {
 deviceSetup ||= require('./setup-main.cjs').createDeviceSetup(require('electron'),mainWindow);
 deviceSetup.open(target);
}
require('./setup-launch.cjs').registerSetupLauncher(ipcMain,()=>mainWindow,openDeviceSetup);
function createWindow() {
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:700,title:'TransitTrack Desktop',backgroundColor:'#0d1520',icon:path.join(__dirname,'assets','icon.ico'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,partition:'persist:transittrack-desktop'}});
 mainWindow.once('ready-to-show',()=>mainWindow.show());
 mainWindow.webContents.on('page-title-updated',event=>{event.preventDefault();mainWindow.setTitle('TransitTrack Desktop');});
 const ses=mainWindow.webContents.session;
 ses.setPermissionCheckHandler((contents,permission,origin)=>isAppUrl(origin)&&['notifications','geolocation','loopback-network'].includes(permission));
 ses.setPermissionRequestHandler(async(contents,permission,callback)=>{
  if(!isAppUrl(contents.getURL())||!['notifications','geolocation','loopback-network'].includes(permission)){callback(false);return;}
  const {response}=await dialog.showMessageBox(mainWindow,{type:'question',title:'TransitTrack permission',message:permission==='loopback-network'?'Allow TransitTrack to connect to the local NFC reader?':permission==='geolocation'?'Allow TransitTrack to use your location?':'Allow TransitTrack desktop notifications?',buttons:['Deny','Allow'],defaultId:0,cancelId:0});
  callback(response===1);
 });
 mainWindow.webContents.on('will-navigate',(event,url)=>{
  const provider=providerFromLoginUrl(url);
  if(provider){event.preventDefault();signInWithBrowser(provider,returnPathFromLoginUrl(url)).catch(()=>{});return;}
  if(!isAppUrl(url)){event.preventDefault();openExternal(url).catch(()=>{});}
 });
 mainWindow.webContents.on('will-redirect',(event,url)=>{
  if(isAppUrl(url)&&!providerFromLoginUrl(url))return;
  event.preventDefault();
  const provider=providerFromLoginUrl(url)||providerFromRedirect(url);
  if(provider){signInWithBrowser(provider,returnPathFromLoginUrl(url)).catch(()=>{});return;}
  dialog.showMessageBox(mainWindow,{type:'info',message:'That page opens outside TransitTrack Desktop.',detail:'To sign in, use Workspace → Sign in / switch account.'});
 });
 mainWindow.webContents.setWindowOpenHandler(({url})=>{
  if(isAppUrl(url)){openRoute(new URL(url).pathname+new URL(url).search+new URL(url).hash);}
  else openExternal(url).catch(()=>{});
  return {action:'deny'};
 });
 mainWindow.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{
  if(isMainFrame&&code!==-3&&isAppUrl(url))showOffline();
 });
 mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
 mainWindow.on('closed',()=>{mainWindow=null;});
 updateChecker=createUpdateChecker({currentVersion:DESKTOP_VERSION,showMessage:options=>dialog.showMessageBox(mainWindow,options),openDownload:url=>shell.openExternal(url)});
 if(app.isPackaged)stopUpdateChecks=startUpdateChecks(updateChecker);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Workspace',submenu:[
   {label:'My workspace',accelerator:'Ctrl+Home',click:()=>openRoute('/')},
   {label:'Admin',click:()=>openRoute('/admin')},
   {label:'Mechanic',click:()=>openRoute('/mechanic')},
   {type:'separator'},
   {label:'Sign in / switch account',click:()=>openRoute('/login')},
   {type:'separator'},{role:'quit'}
  ]},
  {label:'Devices',submenu:[{label:'Tablet & NFC setup',click:()=>{openDeviceSetup();}}]},
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{label:'Reconnect / reload',accelerator:'Ctrl+R',click:()=>isAppUrl(mainWindow?.webContents.getURL())?mainWindow.reload():openRoute('/')},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
  {label:'Help',submenu:[{label:'Check for updates',click:()=>updateChecker.check(true)},{label:'About TransitTrack Desktop',click:()=>dialog.showMessageBox(mainWindow,{type:'info',message:'TransitTrack Desktop '+DESKTOP_VERSION,detail:'Admin and Mechanic workspaces. Uses your existing account permissions. Internet is needed for live data. Sign in with email and password, or with Google or Apple through your web browser. USB tablet setup and NFC reader controls are available under Devices. New Windows versions are checked at startup and every six hours. Use Help → Check for updates at any time.'})}]}
 ]));
 openRoute('/login?returnTo=%2F');
}
app.on('window-all-closed',()=>app.quit());

app.on('before-quit',()=>{stopUpdateChecks?.();updateChecker?.stop();deviceSetup?.stop();browserSignIn?.cancel();});
