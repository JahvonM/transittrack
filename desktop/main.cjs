const {app,BrowserWindow,Menu,dialog,shell}=require('electron');
const path=require('node:path');
const {APP_ORIGIN,isAppUrl,externalUrl}=require('./policy.cjs');
let mainWindow,deviceSetup;
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
async function openExternal(value) {
 const url=externalUrl(value);if(!url)return;
 const {response}=await dialog.showMessageBox(mainWindow,{type:'question',title:'Open in your browser?',message:'This link opens outside TransitTrack Desktop.',detail:new URL(url).origin,buttons:['Cancel','Open browser'],defaultId:0,cancelId:0});
 if(response===1)await shell.openExternal(url);
}
function createWindow() {
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:700,title:'TransitTrack Desktop',backgroundColor:'#0d1520',icon:path.join(__dirname,'assets','icon.ico'),show:false,webPreferences:{nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,partition:'persist:transittrack-desktop'}});
 mainWindow.once('ready-to-show',()=>mainWindow.show());
 mainWindow.webContents.on('page-title-updated',event=>{event.preventDefault();mainWindow.setTitle('TransitTrack Desktop');});
 const ses=mainWindow.webContents.session;
 ses.setPermissionCheckHandler((contents,permission,origin)=>isAppUrl(origin)&&['notifications','geolocation','loopback-network'].includes(permission));
 ses.setPermissionRequestHandler(async(contents,permission,callback)=>{
  if(!isAppUrl(contents.getURL())||!['notifications','geolocation','loopback-network'].includes(permission)){callback(false);return;}
  const {response}=await dialog.showMessageBox(mainWindow,{type:'question',title:'TransitTrack permission',message:permission==='loopback-network'?'Allow TransitTrack to connect to the local NFC reader?':permission==='geolocation'?'Allow TransitTrack to use your location?':'Allow TransitTrack desktop notifications?',buttons:['Deny','Allow'],defaultId:0,cancelId:0});
  callback(response===1);
 });
 mainWindow.webContents.on('will-navigate',(event,url)=>{if(!isAppUrl(url)){event.preventDefault();openExternal(url).catch(()=>{});}});
 mainWindow.webContents.on('will-redirect',(event,url)=>{if(!isAppUrl(url)){event.preventDefault();dialog.showMessageBox(mainWindow,{type:'info',message:'Use email and password to sign in here.',detail:'External provider sign-in is not supported in this desktop preview.'});}});
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
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Workspace',submenu:[
   {label:'My workspace',accelerator:'Ctrl+Home',click:()=>openRoute('/')},
   {label:'Admin',click:()=>openRoute('/admin')},
   {label:'Mechanic',click:()=>openRoute('/mechanic')},
   {type:'separator'},
   {label:'Sign in / switch account',click:()=>openRoute('/login')},
   {type:'separator'},{role:'quit'}
  ]},
  {label:'Devices',submenu:[{label:'Tablet & NFC setup',click:()=>{deviceSetup ||= require('./setup-main.cjs').createDeviceSetup(require('electron'),mainWindow);deviceSetup.open();}}]},
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{label:'Reconnect / reload',accelerator:'Ctrl+R',click:()=>isAppUrl(mainWindow?.webContents.getURL())?mainWindow.reload():openRoute('/')},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
  {label:'Help',submenu:[{label:'About TransitTrack Desktop',click:()=>dialog.showMessageBox(mainWindow,{type:'info',message:'TransitTrack Desktop 0.2.1',detail:'Admin and Mechanic workspaces. Uses your existing account permissions. Internet is needed for live data. This preview supports email/password sign-in; USB tablet setup and NFC reader controls are available under Devices. Automatic updates are not included.'})}]}
 ]));
 openRoute('/login?returnTo=%2F');
}
app.on('window-all-closed',()=>app.quit());

app.on('before-quit',()=>deviceSetup?.stop());
