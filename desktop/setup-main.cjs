const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {execFile,spawn}=require('node:child_process');
const http=require('node:http');
const {APP_ORIGIN}=require('./policy.cjs');
const policy=require('./device-policy.cjs');
function createDeviceSetup({app,BrowserWindow,dialog,ipcMain},parent){
 let window,helper,kiosk,reader,busy=false;
 const native=app.isPackaged?path.join(process.resourcesPath,'native'):path.join(__dirname,'native');
 const adb=path.join(native,'adb.exe'),page=path.join(__dirname,'setup.html');
 const trustedUrl=pathToFileURL(page).href;
 function execute(args,timeout=18000){return new Promise((resolve,reject)=>execFile(adb,args,{windowsHide:true,shell:false,timeout,maxBuffer:1024*1024},(err,stdout)=>err?reject(Error('Tablet command failed. Check USB authorization, installed apps and the selected tablet.')):resolve(stdout)));}
 async function target(value){const id=policy.serial(value);if((await execute(['-s',id,'get-state'])).trim()!=='device')throw Error('This tablet is offline or awaiting USB approval.');return id;}
 const selected=async(value,args,timeout)=>execute(['-s',await target(value),...args],timeout);
 function readerRequest(route){return new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port:8765,path:route,headers:{Origin:APP_ORIGIN},timeout:5000},res=>{let text='';res.on('data',b=>{text+=b;if(text.length>65536)req.destroy(Error('Reader response too large'));});res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Reader unavailable');resolve(JSON.parse(text));}catch(e){reject(e);}});});req.on('timeout',()=>req.destroy(Error('Reader timed out')));req.on('error',()=>reject(Error('Reader is not running. Click Start reader and check the USB connection.')));
 });}
 async function confirm(message,detail){const r=await dialog.showMessageBox(window,{type:'question',message,detail,buttons:['Cancel','Continue'],defaultId:0,cancelId:0});return r.response===1;}
 const actions={
  scan:async()=>{if(process.platform!=='win32')throw Error('Device setup runs on Windows.');return {devices:policy.devices(await execute(['devices','-l']))};},
  inspect:async input=>{
   const id=await target(input.serial);
   const [model,version,battery,timeout]=await Promise.all([execute(['-s',id,'shell','getprop','ro.product.model']),execute(['-s',id,'shell','dumpsys','package','com.transittrack.kioskhelper']),execute(['-s',id,'shell','dumpsys','battery']),execute(['-s',id,'shell','settings','get','system','screen_off_timeout'])]);
   return {model:model.trim(),helperVersion:version.match(/versionName=([^\s]+)/)?.[1]||'Not installed',battery:battery.match(/level:\s*(\d+)/)?.[1]||'Unknown',screenTimeout:timeout.trim()};
  },
  chooseHelper:async()=>{
   const result=await dialog.showOpenDialog(window,{title:'Choose the signed tablet setup downloaded from Admin',properties:['openFile'],filters:[{name:'TransitTrack tablet setup',extensions:['bat']}]});
   if(result.canceled)return {cancelled:true};
   const stat=await fs.stat(result.filePaths[0]);if(stat.size>45*1024*1024)throw Error('Setup file too large.');
   helper=policy.helperFromSetup(await fs.readFile(result.filePaths[0],'utf8'));
   return {version:helper.version,message:'Signed Helper extracted and integrity verified. The batch file was not executed.'};
  },
  installHelper:async input=>{
   if(!helper)throw Error('Choose the signed tablet setup file first.');await target(input.serial);
   if(!await confirm('Update TransitTrack Helper on '+input.serial+'?','Version '+helper.version+'. Updates the installed app without uninstalling it or clearing app data. Sync or export Saved Work before an update.'))return {cancelled:true};
   const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tt-helper-'));
   try{const apk=path.join(dir,'TransitTrack-Helper.apk');await fs.writeFile(apk,helper.bytes);await selected(input.serial,['install','-r',apk],120000);return {message:'Helper installed. Existing app data was preserved.'};}finally{await fs.rm(dir,{recursive:true,force:true});}
  },
  chooseKiosk:async()=>{
   const result=await dialog.showOpenDialog(window,{title:'Choose a trusted FreeKiosk APK',properties:['openFile'],filters:[{name:'Android app',extensions:['apk']}]});
   if(result.canceled)return {cancelled:true};kiosk=result.filePaths[0];return {message:'Selected '+path.basename(kiosk)};
  },
  installKiosk:async input=>{if(!kiosk)throw Error('Choose a trusted FreeKiosk APK first.');await target(input.serial);if(!await confirm('Install the selected FreeKiosk APK?','Only use an APK from the official FreeKiosk release. This uses an update install and does not clear existing data.'))return {cancelled:true};await selected(input.serial,['install','-r',kiosk],120000);return {message:'FreeKiosk installed.'};},
  configure:async input=>{
   const steps=policy.configuration(input);await target(input.serial);
   for(const pkg of ['com.freekiosk','com.transittrack.kioskhelper']){if(!(await selected(input.serial,['shell','pm','path',pkg])).includes('package:'))throw Error('Install FreeKiosk and the Helper before applying settings.');}
   if(input.mode==='new'){
    const owners=await selected(input.serial,['shell','dumpsys','device_policy']);
    if(/Device Owner/i.test(owners))throw Error('This tablet already has a device owner. Use Update existing tablet; no ownership changes were made.');
   }
   const detail=input.mode==='new'?'Sets FreeKiosk as device owner, changes the kiosk start link and configures '+input.type+' mode. Use only on a new tablet with no accounts. Pairing happens on the tablet.':'Preserves the kiosk URL, pairing and current reader/GPS mode. Applies always-on settings and the supplied local FreeKiosk PIN/API key. Saved Work is not cleared.';
   if(!await confirm('Apply '+input.mode+' tablet settings to '+input.serial+'?',detail))return {cancelled:true};
   const completed=[];
   for(const [name,args]of steps){try{await selected(input.serial,args);completed.push(name);}catch{throw Error(name+' failed. '+completed.length+' earlier steps applied. Inspect the tablet before retrying; no data was cleared.');}}
   return {message:'Settings applied. On the tablet, check FreeKiosk opens, approve USB reader access, and test a card.',steps:completed};
  },
  startReader:async()=>{
   if(process.platform!=='win32')throw Error('The NFC reader helper runs on Windows.');
   try{return await readerRequest('/status');}catch{}
   if(!reader){const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');reader=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'reader.ps1')],{windowsHide:true,shell:false,stdio:'ignore',env:{...process.env,TT_NO_INSTALL:'1',TT_SIMULATE:'0'}});reader.on('error',()=>{reader=null;});reader.on('exit',()=>{reader=null;});}
   for(let i=0;i<16;i++){await new Promise(r=>setTimeout(r,500));try{return await readerRequest('/status');}catch{}}
   throw Error('Reader helper did not start. Windows may block PowerShell/Add-Type, or the Smart Card driver may be missing.');
  },
  readerStatus:()=>readerRequest('/status'),
  testReader:()=>readerRequest('/feedback?kind=success&beep=1&led=1'),
 };
 ipcMain.handle('device-setup',async(event,action,input)=>{
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==trustedUrl)throw Error('Setup access denied.');
  if(!Object.hasOwn(actions,action)||!input||typeof input!=='object'||Array.isArray(input))throw Error('Unsupported setup request.');
  if(busy)throw Error('Wait for the current device operation to finish.');
  busy=true;try{return await actions[action](input);}finally{busy=false;}
 });
 // Read-only live card test uses the same existing reader service. It is exposed
 // only to the packaged setup UI, never to the remotely loaded web page.
 let events,pollTimer;
 function connectEvents(){
  if(events)return;
  events=http.get({hostname:'127.0.0.1',port:8765,path:'/events',headers:{Origin:APP_ORIGIN}},res=>{
   let buffer='';res.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>65536){buffer='';return;}let end;while((end=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=part.split('\n').find(l=>l.startsWith('data: '));if(!line)continue;try{const event=JSON.parse(line.slice(6));if(window&&!window.isDestroyed())window.webContents.send('reader-event',event);}catch{}}});
   res.on('end',()=>{events=null;});res.on('close',()=>{events=null;});res.on('error',()=>{events=null;});
  });events.on('error',()=>{events=null;});
 }
 function open(){
  if(window&&!window.isDestroyed()){window.focus();return;}
  window=new BrowserWindow({parent,width:1120,height:900,minWidth:900,minHeight:720,title:'TransitTrack • Tablet & NFC setup',backgroundColor:'#0d1520',webPreferences:{preload:path.join(__dirname,'setup-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,partition:'setup-ui'}});
  window.webContents.session.setPermissionCheckHandler(()=>false);window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.on('closed',()=>{window=null;helper=null;kiosk=null;clearInterval(pollTimer);pollTimer=null;events?.destroy();events=null;});
  window.loadFile(page);
  window.webContents.once('did-finish-load',()=>{pollTimer=setInterval(()=>{if(!window||window.isDestroyed()){clearInterval(pollTimer);return;}connectEvents();},2000);});
 }
 function stop(){clearInterval(pollTimer);reader?.kill();events?.destroy();}
 return {open,stop};
}
module.exports={createDeviceSetup};
