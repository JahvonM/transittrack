const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const fs=require('node:fs');const path=require('node:path');const {createReaderProcess}=require('./reader-process.cjs');
function fixture({packaged=true,readyAt=Infinity,exit,output=''}={}) {
 const proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stderr=new EventEmitter();let kills=0,polls=0,spawned;
 proc.kill=()=>{kills++;};let waited=0;
 const helper=createReaderProcess({native:'native',script:'reader.ps1',isPackaged:packaged,platform:'win32',attempts:60,
  request:async()=>{if(polls++>=readyAt)return {reader:'ACR122U'};throw Error('offline');},
  start:(exe,args,options)=>{spawned={exe,args,options};return proc;},
  wait:async()=>{waited++;if(waited===1){if(output)proc.stderr.emit('data',Buffer.from(output));if(exit!=null)proc.emit('exit',exit);}}
 });
 return {helper,proc,get waited(){return waited;},get spawned(){return spawned;},get kills(){return kills;}};
}
test('packaged app launches compiled helper without PowerShell and tolerates slow startup',async()=>{
 const f=fixture({readyAt:22});assert.deepEqual(await f.helper.launch(),{reader:'ACR122U'});
 assert.equal(path.basename(f.spawned.exe),'TransitTrack-Card-Reader.exe');assert.deepEqual(f.spawned.args,[]);
 assert.equal(f.spawned.options.shell,false);assert.equal(f.spawned.options.env.TT_SIMULATE,'0');
 assert.ok(f.waited>16);f.helper.stop();assert.equal(f.kills,1);
});
test('existing running helper is reused',async()=>{
 const f=fixture({readyAt:0});await f.helper.launch();assert.equal(f.spawned,undefined);
});
test('startup failure reports real diagnostics and excludes card identifiers',async()=>{
 const f=fixture({exit:1,output:'Compiler failed CS1234\nUID ABCDSECRET\n'});
 await assert.rejects(f.helper.launch(),e=>e.message.includes('CS1234')&&!e.message.includes('ABCDSECRET'));
 assert.equal(f.waited,1);
});
test('timeout terminates only owned helper and permits a clean retry',async()=>{
 const f=fixture();await assert.rejects(f.helper.launch(),/within 30 seconds/);
 assert.equal(f.waited,60);assert.equal(f.kills,1);
});
test('missing native helper tells user to reinstall',async()=>{
 const f=fixture();let scheduled=false;
 const helper=createReaderProcess({native:'native',script:'reader.ps1',isPackaged:true,platform:'win32',
  request:async()=>{throw Error('offline');},start:()=>{queueMicrotask(()=>f.proc.emit('error',{code:'ENOENT'}));scheduled=true;return f.proc;},wait:async()=>{}});
 await assert.rejects(helper.launch(),/missing.*Reinstall/);assert.equal(scheduled,true);
});
test('Windows build compiles canonical C# helper and includes it outside the archive',()=>{
 const pkg=require('./package.json');const script=fs.readFileSync(path.join(__dirname,'build-reader.ps1'),'utf8');
 assert.match(script,/tools\\card-reader\\TTCardReader.cs/);
 assert.match(pkg.scripts['build:win'],/build:reader/);
 assert.ok(pkg.build.extraResources.some(r=>r.to==='native'&&r.filter.includes('TransitTrack-Card-Reader.exe')));
 assert.ok(pkg.build.files.includes('reader-process.cjs'));
 assert.equal(pkg.version,require('./package-lock.json').version);
});
