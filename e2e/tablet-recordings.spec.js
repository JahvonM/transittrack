import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
const device={id:'tablet000',label:'Bus tablet',status:'active',paired:true,helper_health:{recordings_available:true}};
let bundle;
test.beforeAll(async()=>{
 const result=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Viewer from './src/components/admin/TabletRecordingsViewer.jsx'; window.mountRecordings=(device)=>createRoot(document.getElementById('root')).render(<Viewer device={device}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',alias:{'@':process.cwd()+'/src'},plugins:[{name:'isolated-api',setup(b){b.onResolve({filter:/base44Client$/},()=>({path:'mock-api',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const base44={functions:{invoke:(name,body)=>window.testRecordingsApi(name,body)}};`,loader:'js'}));}}]});
 bundle=result.outputFiles[0].text;
});
async function setup(page,{available=true,partial=false}={}){
 await page.route('**/api/**',r=>r.abort());
 await page.route('**/recordings-isolated',r=>r.fulfill({contentType:'text/html',body:'<html><body style="background:#081420;color:#e4edf5"><main id="root" style="max-width:600px;margin:auto"></main></body></html>'}));
 await page.goto('/recordings-isolated');
 await page.evaluate(({partial})=>{
  window.calls=[];window.commands=[];window.revoked=[];window.partial=partial;
  const realRevoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked.push(url);realRevoke(url);};
  const name='1792195200000-1234567890abcdef.mp4';
  window.testRecordingsApi=async(_name,b)=>{
   window.calls.push(b);return {data:{session:{id:'session000',state:b.operation==='end'?'ended':'active',expires_at:new Date(Date.now()+600000).toISOString()},offer_ready:true,sdp:'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:synthetic\r\n',iceServers:[]}};
  };
  class Channel{
   label='tt-recordings-v1';ordered=true;readyState='open';
   send(raw){const b=JSON.parse(raw);window.commands.push(b);queueMicrotask(async()=>{
    const message=m=>this.onmessage?.({data:JSON.stringify(m)});
    if(b.op==='list')message({type:'list',id:b.id,clips:[{name,at:1792195200000,bytes:4,protected:false,incomplete:false}],next:-1});
    else{
     message({type:'start',id:b.id,name,bytes:4});this.onmessage?.({data:new Uint8Array(window.partial?[1,2]:[1,2,3,4]).buffer});
     const hash=await crypto.subtle.digest('SHA-256',new Uint8Array([1,2,3,4]));
     message({type:'end',id:b.id,bytes:4,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')});
    }
   });}
   close(){this.readyState='closed';}
  }
  window.RTCPeerConnection=class{
   iceGatheringState='complete';connectionState='connected';localDescription={sdp:'v=0\r\na=candidate:synthetic\r\n'};
   setConfiguration(){}async setRemoteDescription(){}async createAnswer(){return {type:'answer',sdp:this.localDescription.sdp};}
   async setLocalDescription(){queueMicrotask(()=>{const channel=new Channel();this.ondatachannel?.({channel});queueMicrotask(()=>channel.onopen?.());});}
   close(){this.connectionState='closed';}
  };
 },{partial});
 await page.addScriptTag({content:bundle});
 await page.evaluate(d=>window.mountRecordings(d),{...device,helper_health:{recordings_available:available}});
}
test('recording access is deliberate, date-filtered and closes on disconnect',async({page})=>{
 await setup(page);expect(await page.evaluate(()=>window.calls.length)).toBe(0);
 await page.getByRole('button',{name:'Browse recordings'}).click();
 await expect(page.getByText('Connected to tablet',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await page.getByLabel('Recording date').fill('2026-10-17');
 await expect.poll(()=>page.evaluate(()=>window.commands.filter(x=>x.op==='list').length)).toBe(2);
 const last=await page.evaluate(()=>window.commands.filter(x=>x.op==='list').at(-1));expect(last.until-last.from).toBe(86400000);
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await expect(page.getByRole('button',{name:'Browse recordings'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.calls.some(x=>x.operation==='end'))).toBe(true);
});
test('only a completely verified download gets a player and copy link; disconnect releases it',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Browse recordings'}).click();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect(page.getByRole('link',{name:'Save a copy',exact:true})).toBeVisible();
 await expect(page.getByLabel('Saved rear-camera video')).toHaveAttribute('controls','');
 await expect(page.getByLabel('Saved rear-camera video')).toHaveAttribute('src',/^blob:/);
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();
 await expect(page.getByLabel('Saved rear-camera video')).toHaveCount(0);
 expect(await page.evaluate(()=>window.revoked.length)).toBe(1);
});
test('partial download cannot be played or saved',async({page})=>{
 await setup(page,{partial:true});await page.getByRole('button',{name:'Browse recordings'}).click();await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('interrupted or invalid');
 await expect(page.getByLabel('Saved rear-camera video')).toHaveCount(0);await expect(page.getByRole('link',{name:'Save a copy',exact:true})).toHaveCount(0);
});
test('old tablets cannot request the new recording feature',async({page})=>{
 await setup(page,{available:false});await expect(page.getByRole('button',{name:'Browse recordings'})).toBeDisabled();expect(await page.evaluate(()=>window.calls.length)).toBe(0);
});
