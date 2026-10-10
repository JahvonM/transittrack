const $=id=>document.getElementById(id);
function selected(){if(!$('serial').value)throw Error('Find tablets and select one first.');return {serial:$('serial').value};}
function show(value){return typeof value==='string'?value:JSON.stringify(value,null,2);}
function log(message){$('activity').textContent=new Date().toLocaleTimeString()+'  '+message+'\n'+$('activity').textContent.slice(0,7000);}
async function run(action,input={}){
 document.querySelectorAll('button').forEach(b=>b.disabled=true);$('state').textContent='Working…';
 try{const result=await window.deviceSetup.run(action,input);$('state').textContent=result.cancelled?'Cancelled':'Ready';log(result.message||action+' complete');return result;}
 catch(error){$('state').textContent='Check required';log(error.message.replace(/^Error invoking remote method '[^']*': (Error: )?/,''));throw error;}
 finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function bind(id,handler){$(id).addEventListener('click',()=>Promise.resolve().then(handler).catch(error=>{if($('state').textContent!=='Check required'){log(error.message);$('state').textContent='Check required';}}));}
bind('scan',async()=>{const r=await run('scan');const select=$('serial');select.replaceChildren();for(const d of r.devices){const option=document.createElement('option');option.value=d.state==='device'?d.serial:'';option.textContent=[d.serial,d.model,d.state==='unauthorized'?'Approve USB debugging on tablet':d.state].filter(Boolean).join(' · ');select.appendChild(option);}if(!r.devices.length){const option=document.createElement('option');option.value='';option.textContent='No tablets found — check cable and USB debugging';select.appendChild(option);}});
bind('inspect',async()=>{$('health').textContent=show(await run('inspect',selected()));});
bind('chooseHelper',async()=>{const r=await run('chooseHelper');if(!r.cancelled)$('helper').textContent='Helper '+r.version+' verified and ready to install.';});
bind('installHelper',()=>run('installHelper',selected()));
bind('chooseKiosk',()=>run('chooseKiosk'));
bind('installKiosk',()=>run('installKiosk',selected()));
bind('configure',async()=>{try{const input={...selected()};for(const name of ['mode','type','pin','apiKey','code','bus','hotspotPassword'])input[name]=$(name).value.trim();await run('configure',input);}finally{for(const name of ['pin','apiKey','hotspotPassword'])$(name).value='';}});
for(const action of ['startReader','readerStatus','testReader'])bind(action,async()=>{$('reader').textContent=show(await run(action));});
window.deviceSetup.onReaderEvent(event=>{if(event.type==='card')$('uid').textContent=String(event.uid||'').slice(0,64);if(event.type==='status')$('reader').textContent=event.reader||'Helper running. Plug in a supported reader.';});

function selectView(view){
 const nfc=view==='nfc';
 document.querySelectorAll('section[data-view]').forEach(section=>section.hidden=section.dataset.view!==(nfc?'nfc':'tablet'));
 $('showTablet').setAttribute('aria-pressed',String(!nfc));
 $('showNfc').setAttribute('aria-pressed',String(nfc));
 document.querySelector('h1').textContent=nfc?'NFC reader setup':'Tablet setup';
 window.scrollTo(0,0);
}
$('showTablet').addEventListener('click',()=>selectView('tablet'));
$('showNfc').addEventListener('click',()=>selectView('nfc'));
window.deviceSetup.onView(selectView);
selectView(location.hash.slice(1));
