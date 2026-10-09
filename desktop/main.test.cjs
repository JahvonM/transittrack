const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
test('the real entry creates an isolated window and rejects foreign navigation',async()=>{
 let window,template;
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.session={setPermissionCheckHandler:fn=>this.permissionCheck=fn,setPermissionRequestHandler:fn=>this.permissionRequest=fn};this.webContents.setWindowOpenHandler=fn=>this.popup=fn;window=this;}
  once(){} loadURL(url){this.url=url;return Promise.resolve();} loadFile(file){this.file=file;return Promise.resolve();} isDestroyed(){return false;}
 }
 const app=new EventEmitter();Object.assign(app,{enableSandbox(){},setAppUserModelId(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit(){}});
 const external=[];
 const electron={app,BrowserWindow:Window,Menu:{buildFromTemplate:t=>(template=t),setApplicationMenu(){}},dialog:{showMessageBox:async()=>({response:0})},shell:{openExternal:async url=>external.push(url)}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/main.cjs','utf8'),{require:name=>name==='electron'?electron:require(name),__dirname,URL,AbortController});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(window.options.webPreferences.nodeIntegration,false);
 assert.equal(window.options.webPreferences.contextIsolation,true);
 assert.equal(window.options.webPreferences.sandbox,true);
 assert.equal(window.options.webPreferences.webSecurity,true);
 assert.equal(window.options.webPreferences.webviewTag,false);
 assert.equal(window.url,'https://eager-transit-track-go.base44.app/login?returnTo=%2F');
 let prevented=false;window.webContents.emit('will-navigate',{preventDefault(){prevented=true;}},'file:///secret');
 assert.equal(prevented,true);assert.deepEqual(external,[]);
 assert.equal(window.popup({url:'javascript:alert(1)'}).action,'deny');
 assert.equal(window.permissionCheck(null,'media','https://eager-transit-track-go.base44.app'),false);
 assert.equal(window.permissionCheck(null,'geolocation','https://evil.invalid'),false);
 // Google sign-in is moved to the person's own browser (Google blocks app windows).
 const APP='https://eager-transit-track-go.base44.app';
 let blocked=false;window.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},APP+'/api/apps/auth/login?app_id=x&from_url='+encodeURIComponent(APP+'/admin'));
 assert.equal(blocked,true);
 for(let i=0;i<100&&external.length<1;i++)await new Promise(r=>setTimeout(r,10));
 assert.match(external[0],/^https:\/\/eager-transit-track-go\.base44\.app\/desktop-signin\?port=\d+&state=[A-Za-z0-9_-]{43}&provider=google$/);
 let redirected=false;window.webContents.emit('will-redirect',{preventDefault(){redirected=true;}},'https://accounts.google.com/o/oauth2/v2/auth?client_id=x');
 assert.equal(redirected,true);
 for(let i=0;i<100&&external.length<2;i++)await new Promise(r=>setTimeout(r,10));
 assert.match(external[1],/\/desktop-signin\?port=\d+&state=[A-Za-z0-9_-]{43}&provider=google$/);
 let other=false;window.webContents.emit('will-redirect',{preventDefault(){other=true;}},APP+'/admin');
 assert.equal(other,false);
 window.webContents.emit('did-fail-load',{},-105,'Offline',window.url,true);
 assert.ok(window.file.endsWith('offline.html'));
 assert.equal(template[0].submenu[2].label,'Mechanic');
});
