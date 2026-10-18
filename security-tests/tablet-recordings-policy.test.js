import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import {load,mock} from './helpers.js';
const source=fs.readFileSync('base44/shared/tabletRecordings.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const p={};new Function('exports',js)(p);
const actor={id:'owner',role:'admin'},now=Date.parse('2026-10-17T00:00:00Z');
const d={id:'tablet000',status:'active',paired:true,company_id:'companyA',vehicle_id:'bus1',kiosk_type:'driver',helper_health:{recordings_available:true}};
const session={...p.recordingsRequest(actor,d,now),id:'session1'};
const bound={...d,recordings_request:{id:'session1',expires_at:session.expires_at}};
const fingerprint='AA:'.repeat(31)+'AA';
const sdp='v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\na=fingerprint:sha-256 '+fingerprint+'\r\n';
describe('saved recordings authorization and protocol policy',()=>{
 it.each([null,{id:'x',role:'staff'},{id:'x',role:'company'},{id:'x',role:'mechanic'},{id:'x',role:'driver'}])('rejects non-admin %j',a=>expect(()=>p.recordingsRequest(a,d,now)).toThrow());
 it('requires recordings-capable current enrollment',()=>{
  for(const x of [{...d,paired:false},{...d,status:'revoked'},{...d,helper_health:{support_available:true}}])expect(()=>p.recordingsRequest(actor,x,now)).toThrow();
 });
 it('limits sessions to ten minutes and keeps the requesting identity',()=>expect(session).toMatchObject({requested_by:'owner',expires_at:'2026-10-17T00:10:00.000Z',state:'requested'}));
 it('binds to the same company, bus, device, type and current request',()=>{
  expect(p.recordingsBinding(session,bound)).toBe(true);
  for(const patch of [{id:'other'},{company_id:'B'},{vehicle_id:'bus2'},{kiosk_type:'bus_boarding'},{recordings_request:{id:'other'}},{paired:false},{status:'revoked'}])expect(p.recordingsBinding(session,{...bound,...patch})).toBe(false);
 });
 it('does not deliver expired or malformed notices',()=>{
  expect(p.recordingsNotice(bound,now)).toEqual({id:'session1'});
  expect(p.recordingsNotice(bound,now+600000)).toBeNull();
  expect(p.recordingsNotice({...bound,recordings_request:{id:'../secret',expires_at:session.expires_at}},now)).toBeNull();
 });
 it('whitelists the public session response',()=>expect(p.publicRecordings({...session,offer_sdp:'private',answer_sdp:'private',secret:'never'})).toEqual({id:'session1',device_id:d.id,state:'requested',expires_at:session.expires_at}));
 it('accepts only one DTLS data-channel section',()=>{
  expect(p.validateRecordingsSdp(sdp)).toBe(sdp);
  for(const invalid of [sdp.replace('m=application 9','m=application 0'),sdp+'m=video 9 UDP/TLS/RTP/SAVPF 96\r\n',sdp.replace('a=sctp-port:5000',''),sdp.replace(fingerprint,'invalid'),sdp.replace('UDP/DTLS/SCTP','RTP/AVP'),null,'x'.repeat(70000)])expect(()=>p.validateRecordingsSdp(invalid)).toThrow();
 });
 it('treats termination as final',()=>{
  for(const state of ['ended','failed','expired'])expect(p.recordingsTerminal({...session,state})).toBe(true);
  expect(p.recordingsTerminal({...session,ended_at:'now'})).toBe(true);
  expect(p.recordingsTerminal(session)).toBe(false);
 });
});

describe('driver and boarding heartbeat integration',()=>{
 for(const name of ['driverSession','kioskHeartbeat']){
  const file=fs.readFileSync(`base44/functions/${name}/entry.ts`,'utf8');
  const ast=ts.createSourceFile('heartbeat.ts',file,ts.ScriptTarget.Latest,true);
  it(`${name} preserves boolean recording capability and rejects forged types`,()=>{
   const clean=load(name,mock(null),['cleanHelperHealth']).cleanHelperHealth;
   expect(clean({recordings_available:true}).recordings_available).toBe(true);
   expect(clean({recordings_available:'true'}).recordings_available).toBeUndefined();
   expect(clean({recordings_available:false}).recordings_available).toBe(false);
  });
  it(`${name} delivers only a bounded live recording notice`,()=>{
   let property;
   function visit(n){if(ts.isPropertyAssignment(n) && n.name.getText(ast)==='recordings_notice')property=n;ts.forEachChild(n,visit);}
   visit(ast);expect(property).toBeTruthy();
   const notice=new Function('recordingsNotice','device','tokenOk','return '+property.initializer.getText(ast));
   const live={...bound,recordings_request:{id:'session1',expires_at:new Date(Date.now()+60000).toISOString()}};
   expect(notice(p.recordingsNotice,live,true)).toEqual({id:'session1'});
   expect(notice(p.recordingsNotice,{...live,recordings_request:{...live.recordings_request,expires_at:new Date(0).toISOString()}},true)).toBeNull();
   if(name==='kioskHeartbeat')expect(notice(p.recordingsNotice,live,false)).toBeNull();
  });
 }
});
