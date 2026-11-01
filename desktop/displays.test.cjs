// Office display windows (displays.cjs) with fake Electron windows and
// monitors. Simulated: this checks the app's logic, not real hardware.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const {createDisplayManager}=require('./displays.cjs');
const ORIGIN='https://app.mcsweenstransport.com';
const TOKEN='a'.repeat(64),TOKEN2='b'.repeat(64);

function rig(){
 let nextContents=100;
 const screen=new EventEmitter();
 let displays=[
  {id:1,label:'Laptop',bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040},size:{width:1920,height:1080},scaleFactor:1.25},
  {id:2,label:'Office TV',bounds:{x:1920,y:0,width:3840,height:2160},workArea:{x:1920,y:0,width:3840,height:2120},size:{width:3840,height:2160},scaleFactor:1.5},
 ];
 Object.assign(screen,{
  getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],
  getDisplayMatching:b=>displays.find(d=>b.x>=d.bounds.x&&b.x<d.bounds.x+d.bounds.width)||displays[0],
 });
 const windows=[];
 class Win extends EventEmitter {
  constructor(o){super();this.options=o;this.bounds={x:o.x,y:o.y,width:o.width,height:o.height};this.full=false;this.destroyed=false;this.reloads=0;this.title=o.title;
   const wc=new EventEmitter();wc.id=nextContents++;wc.url='';wc.scripts=[];
   wc.session={setPermissionCheckHandler:f=>{wc.check=f;},setPermissionRequestHandler:f=>{wc.request=f;},clearStorageData:async()=>{wc.cleared=true;}};
   wc.setWindowOpenHandler=f=>{wc.popup=f;};wc.getURL=()=>wc.url;wc.executeJavaScript=async s=>{wc.scripts.push(s);return null;};
   this.webContents=wc;windows.push(this);}
  loadURL(u){this.webContents.url=u;return Promise.resolve();}
  once(e,f){super.once(e,f);if(e==='ready-to-show')setImmediate(()=>this.emit('ready-to-show'));return this;}
  removeMenu(){} show(){this.shown=true;} isDestroyed(){return this.destroyed;} isMinimized(){return false;} restore(){}
  isFullScreen(){return this.full;} setFullScreen(v){this.full=v;if(v){const d=screen.getDisplayMatching(this.bounds);this.bounds={...d.bounds};}}
  setBounds(b){this.bounds={...b};} getBounds(){return {...this.bounds};} setTitle(t){this.title=t;} reload(){this.reloads++;}
  close(){const e={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};this.emit('close',e);if(!e.defaultPrevented)this.destroy();}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('closed');}
 }
 const files={};
 const fs={readFileSync:f=>{if(!(f in files))throw new Error('missing');return files[f];},writeFileSync:(f,d)=>{files[f]=d;}};
 const changes=[];
 const make=()=>createDisplayManager({BrowserWindow:Win,screen,fs,path,userData:'/data',appOrigin:ORIGIN,preload:'/app/display-preload.cjs',onChange:l=>changes.push(l)});
 return {screen,windows,files,changes,make,setDisplays:d=>{displays=d;}};
}
const tick=()=>new Promise(r=>setImmediate(r));

test('opens an isolated, locked-down window on the TV, with no credential in the URL',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV'});
 await tick();
 const w=r.windows[0];
 const p=w.options.webPreferences;
 assert.equal(p.partition,'office-display-disp-1'); // in memory, not the main sign-in
 assert.ok(!p.partition.startsWith('persist:'));
 assert.equal(p.contextIsolation,true);assert.equal(p.sandbox,true);assert.equal(p.nodeIntegration,false);assert.equal(p.webviewTag,false);
 assert.equal(p.preload,'/app/display-preload.cjs');
 assert.equal(w.webContents.url,ORIGIN+'/display');
 assert.ok(!w.webContents.url.includes(TOKEN));
 assert.equal(w.full,true);assert.equal(w.bounds.x,1920); // the TV, full screen
 let blocked=false;w.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},ORIGIN+'/admin');assert.equal(blocked,true);
 blocked=false;w.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'https://evil.invalid/display');assert.equal(blocked,true);
 blocked=false;w.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},ORIGIN+'/display');assert.equal(blocked,false);
 assert.equal(w.webContents.popup({url:ORIGIN+'/display'}).action,'deny');
 assert.equal(w.webContents.check(null,'media',ORIGIN),false);
 let granted=null;w.webContents.request(null,'media',v=>{granted=v;});assert.equal(granted,false);
 assert.deepEqual(m.list().map(x=>x.id),['disp-1']);
});

test('hands the credential only to that window, only on /display',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'A'});m.open({id:'disp-2',token:TOKEN2,name:'B'});
 await tick();
 const [a,b]=r.windows;
 assert.equal(m.credentialFor(a.webContents),TOKEN);
 assert.equal(m.credentialFor(b.webContents),TOKEN2);
 assert.equal(m.credentialFor({id:999,getURL:()=>ORIGIN+'/display'}),null);
 a.webContents.url=ORIGIN+'/admin';
 assert.equal(m.credentialFor(a.webContents),null);
});

test('never opens two windows for one display',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV'});await tick();
 const again=m.open({id:'disp-1',token:TOKEN2,name:'Office TV'});
 assert.equal(again.reused,true);
 assert.equal(r.windows.length,1);
 assert.equal(r.windows[0].reloads,1);
 assert.equal(m.credentialFor(r.windows[0].webContents),TOKEN2);
});

test('rejects bad ids and credentials',()=>{
 const m=rig().make();
 assert.throws(()=>m.open({id:'../x',token:TOKEN}));
 assert.throws(()=>m.open({id:'disp-1',token:'short'}));
 assert.throws(()=>m.fullscreen('nope'));
});

test('closing lets the page end camera views, then closes; the app keeps running',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV'});await tick();
 const w=r.windows[0];
 m.close('disp-1');
 await tick();await tick();
 assert.match(w.webContents.scripts[0],/__ttDisplayClose/);
 assert.equal(w.destroyed,true);
 assert.deepEqual(m.list(),[]);
 assert.equal(m.credentialFor(w.webContents),null);
 assert.equal(w.webContents.session&&w.webContents.cleared,true);
 assert.deepEqual(r.changes.at(-1),[]);
});

test('a monitor unplugged: the window moves to a screen that is still there, and back when it returns',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV',screen_id:'2'});await tick();
 const w=r.windows[0];
 const all=r.screen.getAllDisplays();
 r.setDisplays([all[0]]);
 r.screen.emit('display-removed');
 assert.equal(w.bounds.x,0);assert.equal(w.full,true);
 r.setDisplays(all);
 r.screen.emit('display-added');
 assert.equal(w.bounds.x,1920);
 assert.equal(JSON.parse(r.files[path.join('/data','office-displays.json')])['disp-1'].screen_id,'2');
});

test('a resolution change refits a full-screen window',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV'});await tick();
 const w=r.windows[0];
 const [laptop,tv]=r.screen.getAllDisplays();
 r.setDisplays([laptop,{...tv,bounds:{x:1920,y:0,width:1920,height:1080},workArea:{x:1920,y:0,width:1920,height:1040},size:{width:1920,height:1080}}]);
 r.screen.emit('display-metrics-changed');
 assert.equal(w.bounds.width,1920);assert.equal(w.full,true);
});

test('fullscreen, refresh and screens for the settings page',async()=>{
 const r=rig(),m=r.make();
 m.open({id:'disp-1',token:TOKEN,name:'Office TV'});await tick();
 m.fullscreen('disp-1');assert.equal(r.windows[0].full,false);
 m.refresh('disp-1');assert.equal(r.windows[0].reloads,1);
 assert.deepEqual(m.screens().map(s=>[s.id,s.primary,s.width]),[['1',true,1920],['2',false,3840]]);
 m.closeAll();await tick();await tick();
 assert.equal(m.count(),0);
});
