const API='https://api.github.com/repos/JahvonM/transittrack/releases?per_page=30';
const ROOT='https://github.com/JahvonM/transittrack/releases/download/';
function version(value) {
 const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
 return m?m.slice(1).map(Number):null;
}
function newer(candidate,current) {
 const a=version(candidate),b=version(current);
 if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}
 return false;
}
function selectRelease(releases,current) {
 if(!Array.isArray(releases))throw Error('Invalid release response');
 let selected=null;
 for(const r of releases) {
  if(r.draft||r.prerelease||typeof r.tag_name!=='string')continue;
  const v=r.tag_name.replace(/^desktop-v/,'');
  if(r.tag_name!=='desktop-v'+v||!newer(v,current))continue;
  const name='TransitTrack-Desktop-Setup-'+v+'.exe';
  const expected=ROOT+encodeURIComponent(r.tag_name)+'/'+name;
  const asset=Array.isArray(r.assets)&&r.assets.find(a=>a.name===name&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===expected);
  if(asset&&(!selected||newer(v,selected.version)))selected={version:v,url:expected};
 }
 return selected;
}
function createUpdateChecker({currentVersion,fetchImpl=fetch,showMessage,openDownload}) {
 let checking=null,lastNotified=null,stopped=false;
 async function run(manual) {
  try {
   const response=await fetchImpl(API,{headers:{Accept:'application/vnd.github+json','User-Agent':'TransitTrack-Desktop'},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Update service unavailable');
   const raw=await response.text();
   if(raw.length>1024*1024)throw Error('Release response too large');
   const release=selectRelease(JSON.parse(raw),currentVersion);
   if(stopped)return;
   if(!release) {if(manual)await showMessage({type:'info',title:'Updates',message:'No newer published Windows version is available.',detail:'Installed version: '+currentVersion});return;}
   if(!manual&&lastNotified===release.version)return;
   lastNotified=release.version;
   const {response:choice}=await showMessage({type:'info',title:'TransitTrack update available',message:'TransitTrack Desktop '+release.version+' is available.',detail:'Installed version: '+currentVersion+'. Download the installer, then run it when you are ready. Your account and saved app settings are retained.',buttons:['Later','Download update'],defaultId:0,cancelId:0,noLink:true});
   if(choice===1&&!stopped)await openDownload(release.url);
  } catch {
   if(manual&&!stopped)await showMessage({type:'warning',title:'Updates',message:'Could not check for updates.',detail:'Check your internet connection and try again later.'});
  }
 }
 return {check(manual=false){if(stopped)return Promise.resolve();if(checking)return checking;checking=run(manual).finally(()=>{checking=null;});return checking;},stop(){stopped=true;}};
}
function startUpdateChecks(checker,{setTimer=setTimeout,setRepeat=setInterval,clearTimer=clearTimeout,clearRepeat=clearInterval}={}) {
 const startup=setTimer(()=>checker.check(),15000),periodic=setRepeat(()=>checker.check(),6*60*60*1000);
 startup.unref?.();periodic.unref?.();
 return ()=>{clearTimer(startup);clearRepeat(periodic);checker.stop();};
}
module.exports={API,newer,selectRelease,createUpdateChecker,startUpdateChecks};
