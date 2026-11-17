import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
function load(path,scope={}){
 const input=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'');
 const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports',...Object.keys(scope),output)(exports,...Object.values(scope));return exports;
}
const policy=load('base44/shared/tabletRecordings.ts');
function fixture(){
 const device={id:'device000',company_id:'A',vehicle_id:'bus',kiosk_type:'driver',status:'active',paired:true,helper_health:{recordings_available:true}};
 const sessions=new Map();let actor={id:'admin000',role:'admin'},requester={id:'admin000',role:'admin'},failAudit=false;
 let checks=0,reads=0;
 const db={KioskDevice:{get:async id=>{reads++;return id===device.id?{...device}:null;},update:async(id,data)=>Object.assign(device,data)},
  User:{get:async()=>requester},AuditLog:{create:async()=>{if(failAudit)throw new Error('audit unavailable');}},
  TabletRecordingSession:{get:async id=>sessions.get(id),create:async data=>{const s={...data,id:'session0'+sessions.size};sessions.set(s.id,s);return {...s};},update:async(id,data)=>Object.assign(sessions.get(id),data)}};
 const entry=load('base44/functions/tabletRecordings/entry.ts',{...policy,createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:db}}),strictControlDevice:async(_db,d,token)=>{checks++;return d?.paired && d.status==='active' && token==='valid';},streamingConfig:()=>({}),supportIce:async()=>({iceServers:[{urls:['turn:relay.example:3478'],credential:'temporary'}],ttl_ms:600000})}).default;
 const call=async body=>{const r=await entry(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
 return {call,device,sessions,actor:a=>{actor=a;},requester:r=>{requester=r;},auditFail:()=>{failAudit=true;},checks:()=>checks,reads:()=>reads};
}
async function opened(f){return (await f.call({operation:'request',device_id:f.device.id})).body.session;}
describe('recordings endpoint isolated authorization checks',()=>{
 it.each([null,{id:'passenger',role:'staff'},{id:'mechanic',role:'mechanic'},{id:'manager',role:'company'}])('refuses non-admin before device lookup %j',async actor=>{
  const f=fixture();f.actor(actor);const r=await f.call({operation:'request',device_id:f.device.id});expect([401,403]).toContain(r.status);expect(f.reads()).toBe(0);
 });
 it('does not authorize native operations with only a device ID',async()=>{
  const f=fixture(),s=await opened(f);const r=await f.call({operation:'prepare',session_id:s.id,device_id:f.device.id});expect(r.status).toBe(401);expect(f.checks()).toBe(1);
 });
 it('does not expose native ICE configuration to a wrong tablet',async()=>{
  const f=fixture(),s=await opened(f);const r=await f.call({operation:'prepare',session_id:s.id,device_id:'another',device_token:'valid'});expect(r.status).toBe(401);expect(r.body.iceServers).toBeUndefined();
 });
 it('refuses another admin on the same session',async()=>{
  const f=fixture(),s=await opened(f);f.actor({id:'admin222',role:'admin'});expect((await f.call({operation:'status',session_id:s.id})).status).toBe(403);expect((await f.call({operation:'end',session_id:s.id})).status).toBe(403);
 });
 it('stops access after demotion or changed tablet assignment',async()=>{
  for(const change of ['role','assignment']){
   const f=fixture(),s=await opened(f);if(change==='role')f.requester({id:'admin000',role:'staff'});else f.device.company_id='B';
   expect((await f.call({operation:'pulse',session_id:s.id,device_id:f.device.id,device_token:'valid'})).status).toBe(403);expect(f.sessions.get(s.id).state).toBe('ended');
  }
 });
 it('never returns offer SDP or credentials from status',async()=>{
  const f=fixture(),s=await opened(f);Object.assign(f.sessions.get(s.id),{offer_sdp:'private',answer_sdp:'private'});
  const r=await f.call({operation:'status',session_id:s.id});expect(r.status).toBe(200);expect(JSON.stringify(r.body)).not.toContain('private');expect(r.body.iceServers).toBeUndefined();
 });
 it('clears signaling and refuses further reads after stop',async()=>{
  const f=fixture(),s=await opened(f);Object.assign(f.sessions.get(s.id),{offer_sdp:'private',answer_sdp:'private'});
  expect((await f.call({operation:'end',session_id:s.id})).status).toBe(200);expect(f.sessions.get(s.id)).toMatchObject({state:'ended',offer_sdp:'',answer_sdp:''});
  expect((await f.call({operation:'viewer',session_id:s.id})).status).toBe(410);
 });
 it('expires before returning connection configuration',async()=>{
  const f=fixture(),s=await opened(f);f.sessions.get(s.id).expires_at=new Date(0).toISOString();
  expect((await f.call({operation:'viewer',session_id:s.id})).status).toBe(410);expect(f.sessions.get(s.id).state).toBe('expired');
 });
 it('resumes the same admin request after a lost response without creating another session',async()=>{
  const f=fixture(),s=await opened(f),again=await opened(f);expect(again.id).toBe(s.id);expect(f.sessions.size).toBe(1);
 });
 it('fails closed and marks the session failed if access auditing fails',async()=>{
  const f=fixture();f.auditFail();const r=await f.call({operation:'request',device_id:f.device.id});expect(r.status).toBe(503);expect(f.device.recordings_request).toBeUndefined();expect([...f.sessions.values()][0].state).toBe('failed');
 });
 it('rejects camera/media SDP even from an enrolled tablet',async()=>{
  const f=fixture(),s=await opened(f);await f.call({operation:'prepare',session_id:s.id,device_id:f.device.id,device_token:'valid'});
  const r=await f.call({operation:'offer',session_id:s.id,device_id:f.device.id,device_token:'valid',sdp:'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'});expect(r.status).toBe(400);
 });
});
