import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('base44/shared/tabletSupportPolicy.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};new Function('exports',js)(policy);
const admin={id:'admin',role:'admin'},device={id:'tablet',status:'active',paired:true},at=Date.parse('2026-10-14T15:00:00Z');
const request=()=>policy.supportRequest(admin,device,'screen',at);
describe('tablet remote support server policy',()=>{
 it.each([null,{id:'p',role:'staff'},{id:'m',role:'mechanic'},{id:'c',role:'company'},{id:'d',role:'driver'}])('rejects non-admin requests %j',actor=>expect(()=>policy.supportRequest(actor,device,'screen',at)).toThrow());
 it('requests permission rather than starting capture',()=>expect(request()).toMatchObject({state:'requested',expires_at:'2026-10-14T15:10:00.000Z'}));
 it.each([{...device,paired:false},{...device,status:'revoked'}])('rejects inactive enrollment',tablet=>expect(()=>policy.supportRequest(admin,tablet,'screen',at)).toThrow());
 it('rejects unknown capabilities',()=>expect(()=>policy.supportRequest(admin,device,'microphone',at)).toThrow());
 it('requires the correct tablet and permission stage before activation',()=>{
  const s=request();expect(()=>policy.supportTransition(s,{device_id:'other'},'waiting_permission',at)).toThrow();
  expect(()=>policy.supportTransition(s,{device_id:'tablet'},'active',at)).toThrow();
  const waiting=policy.supportTransition(s,{device_id:'tablet'},'waiting_permission',at);
  expect(policy.supportTransition(waiting,{device_id:'tablet'},'active',at).state).toBe('active');
 });
 it('expires instead of activating a late request',()=>expect(policy.supportTransition(request(),{device_id:'tablet'},'waiting_permission',at+600000).state).toBe('expired'));
 it('prevents signaling after expiry, stop, or from a different viewer',()=>{
  expect(policy.canSupportSignal(request(),admin,at+600000)).toBe(false);
  expect(policy.canSupportSignal(request(),{id:'other',role:'admin'},at)).toBe(false);
  const ended=policy.supportTransition(request(),admin,'ended',at);
  expect(policy.canSupportSignal(ended,{device_id:'tablet'},at)).toBe(false);
  expect(()=>policy.supportTransition(ended,{device_id:'tablet'},'waiting_permission',at)).toThrow();
 });
 it('rejects a demoted admin from ending an open session',()=>expect(()=>policy.supportTransition(request(),{...admin,role:'staff'},'ended',at)).toThrow());
});
