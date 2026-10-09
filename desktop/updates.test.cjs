const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newer,selectRelease,createUpdateChecker,startUpdateChecks,API}=require('./updates.cjs');
function release(v='0.2.4') {return {tag_name:'desktop-v'+v,draft:false,prerelease:false,assets:[{name:'TransitTrack-Desktop-Setup-'+v+'.exe',state:'uploaded',size:100,browser_download_url:'https://github.com/JahvonM/transittrack/releases/download/desktop-v'+v+'/TransitTrack-Desktop-Setup-'+v+'.exe'}]};}
test('numeric versions do not downgrade or select malformed versions',()=>{
 assert.equal(newer('0.10.0','0.9.0'),true);
 for(const v of ['0.2.3','0.2.2','0.2.4-beta','garbage','00.2.4'])assert.equal(newer(v,'0.2.3'),false);
});
test('selects the newest complete stable Windows release only',()=>{
 assert.equal(selectRelease([release('0.2.4'),release('0.3.0')],'0.2.3').version,'0.3.0');
 for(const change of [{draft:true},{prerelease:true},{tag_name:'helper-v0.2.4'},{assets:[]}])assert.equal(selectRelease([{...release(),...change}],'0.2.3'),null);
});
test('rejects foreign URLs, wrong installer names and unpublished assets',()=>{
 for(const field of [{browser_download_url:'https://evil.invalid/a.exe'},{name:'other.exe'},{state:'pending'},{size:0}]){const r=release();Object.assign(r.assets[0],field);assert.equal(selectRelease([r],'0.2.3'),null);}
});
test('automatic checks offer a download once and never open it without the choice',async()=>{
 const shown=[],opened=[];
 const checker=createUpdateChecker({currentVersion:'0.2.3',fetchImpl:async(url,opts)=>{assert.equal(url,API);assert.equal(opts.redirect,'error');return Response.json([release()]);},showMessage:async m=>{shown.push(m);return {response:0};},openDownload:async u=>opened.push(u)});
 await checker.check();await checker.check();
 assert.equal(shown.length,1);assert.equal(opened.length,0);
 await checker.check(true);assert.equal(shown.length,2);
});
test('explicit download opens only the validated installer',async()=>{
 const opened=[];
 const checker=createUpdateChecker({currentVersion:'0.2.3',fetchImpl:async()=>Response.json([release()]),showMessage:async()=>({response:1}),openDownload:async u=>opened.push(u)});
 await checker.check();assert.deepEqual(opened,[release().assets[0].browser_download_url]);
});
test('offline automatic checks stay quiet and manual failures are reported safely',async()=>{
 const shown=[];
 const checker=createUpdateChecker({currentVersion:'0.2.3',fetchImpl:async()=>{throw Error('private details');},showMessage:async m=>{shown.push(m);},openDownload:async()=>assert.fail()});
 await checker.check();assert.equal(shown.length,0);
 await checker.check(true);assert.equal(shown.length,1);assert.doesNotMatch(JSON.stringify(shown),/private details/);
});
test('manual checks distinguish no published upgrade from a network error',async()=>{
 const shown=[];
 const checker=createUpdateChecker({currentVersion:'0.2.3',fetchImpl:async()=>Response.json([]),showMessage:async m=>shown.push(m),openDownload:async()=>assert.fail()});
 await checker.check(true);assert.match(shown[0].message,/No newer published/);
});
test('overlapping checks share a request and stop suppresses late prompts',async()=>{
 let finish,calls=0;const shown=[];
 const checker=createUpdateChecker({currentVersion:'0.2.3',fetchImpl:()=>{calls++;return new Promise(r=>finish=r);},showMessage:async m=>shown.push(m),openDownload:async()=>assert.fail()});
 const a=checker.check(),b=checker.check();assert.equal(a,b);assert.equal(calls,1);
 checker.stop();finish(Response.json([release()]));await a;assert.equal(shown.length,0);
});
test('checks at startup and six-hour intervals and clears both timers on exit',()=>{
 const pending=[],cleared=[];let checks=0,stopped=0;
 const stop=startUpdateChecks({check:()=>checks++,stop:()=>stopped++},{setTimer:(fn,ms)=>(pending.push({fn,ms}),1),setRepeat:(fn,ms)=>(pending.push({fn,ms}),2),clearTimer:id=>cleared.push(id),clearRepeat:id=>cleared.push(id)});
 assert.deepEqual(pending.map(p=>p.ms),[15000,21600000]);pending.forEach(p=>p.fn());assert.equal(checks,2);
 stop();assert.deepEqual(cleared,[1,2]);assert.equal(stopped,1);
});
