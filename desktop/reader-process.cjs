const path=require('node:path');
const {spawn}=require('node:child_process');
function createReaderProcess({native,script,isPackaged,request,platform=process.platform,start=spawn,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60}) {
 let child;
 function stop(){const owned=child;child=null;owned?.kill();}
 async function launch() {
  if(platform!=='win32')throw Error('The NFC reader helper runs on Windows.');
  try{return await request('/status');}catch{}
  // A previous failed launch must not compete with the retry for the local port.
  stop();
  let diagnostic='',failure=null,capture=true;
  const exe=isPackaged?path.join(native,'TransitTrack-Card-Reader.exe'):path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const args=isPackaged?[]:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script];
  const owned=start(exe,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,TT_NO_INSTALL:'1',TT_SIMULATE:'0'}});
  child=owned;
  const collect=data=>{if(capture)diagnostic=(diagnostic+data.toString()).slice(-6000);};
  owned.stdout?.on('data',collect);owned.stderr?.on('data',collect);
  owned.on('error',e=>{failure=e.code==='ENOENT'?'The installed reader helper is missing. Reinstall TransitTrack Desktop.':'Windows could not launch the reader helper ('+(e.code||'startup error')+').';if(child===owned)child=null;});
  owned.on('exit',code=>{failure=failure||'The reader helper exited before it was ready (code '+code+').';if(child===owned)child=null;});
  try {
   for(let i=0;i<attempts;i++){
    if(!failure)await wait(500);
    try {const status=await request('/status');capture=false;diagnostic='';return status;}catch{}
    if(failure)break;
   }
   // Startup output only; never retain card events or write diagnostic files.
   const detail=diagnostic.split(/\r?\n/).filter(line=>!/\b(uid|card detected|card removed)\b|\bCard\s+[0-9a-f]{4,}\b/i.test(line)).join('\n').replace(/[\u001b\u0000-\u0008]/g,'').trim().slice(-2400);
   throw Error((failure||'The NFC reader service did not become ready within 30 seconds.')+(detail?'\nReader startup details:\n'+detail:'')+'\nClose any other reader helper, check the reader USB cable, then retry.');
  }catch(error){if(child===owned)stop();throw error;}
 }
 return {launch,stop};
}
module.exports={createReaderProcess};
