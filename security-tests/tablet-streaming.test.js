import {describe,it,expect} from "vitest";
import fs from "node:fs";
import ts from "typescript";
import {webcrypto,createHmac} from "node:crypto";
import {mock,request,digest} from "./helpers.js";
const offer="v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\na=fingerprint:sha-256 "+Array(32).fill("AA").join(":")+"\r\n";
const answer=offer.replace("sendonly","recvonly");
function fixture(role="admin") {
 const c=mock(role),modules={};
 const settings={TT_SUPPORT_ENABLED:"true",TT_SUPPORT_TRANSPORT:"webrtc"};
 const secrets={get:n=>settings[n]};
 function module(file) {
  if(modules[file])return modules[file];
  const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const out={};modules[file]=out;
  const require=name=> name.includes("@base44/sdk")?{createClientFromRequest:()=>c}:name==="base44:runtime"?{secrets}:module("base44/shared/"+name.split("/").pop());
  new Function("exports","require","crypto",js)(out,require,webcrypto);return out;
 }
 const handler=module("base44/functions/tabletSupport/entry.ts").default;
 const d=c.tables.KioskDevice[0];d.helper_health={support_available:true,support_transport:"webrtc"};
 const token="a".repeat(64);
 c.tables.DeviceCredential=[{device_id:d.id,token_hash:digest(token),pairing_code_hash:digest(d.pairing_code),
  company_id:d.company_id,vehicle_id:d.vehicle_id,kiosk_type:d.kiosk_type,expires_at:new Date(Date.now()+3600000).toISOString()}];
 const call=async(operation,body={})=>{const r=await handler(request({operation,...body}));return {status:r.status,body:await r.json()}};
 const begin=async(capability="screen")=>{
  const r=await call("request",{device_id:d.id,capability});expect(r.status).toBe(200);
  return {session_id:r.body.session.id,device_id:d.id,device_token:token};
 };
 return {c,d,token,call,begin,settings};
}
describe("direct WebRTC tablet viewing handlers",()=>{
 it.each([null,"staff","mechanic","company","driver"])("rejects %s before entity reads",async role=>{
  const f=fixture(role),r=await f.call("request",{device_id:"tablet",capability:"screen"});
  expect([401,403]).toContain(r.status);expect(f.c.reads).toHaveLength(0);
 });
 it("requires explicit WebRTC activation, and does not inherit old provider settings",async()=>{
  const f=fixture();f.settings.TT_SUPPORT_TRANSPORT="livekit";
  expect((await f.call("config")).body.enabled).toBe(false);
  expect((await f.call("request")).status).toBe(503);expect(f.c.writes).toHaveLength(0);
 });
 it("requires the updated native protocol and approval state",async()=>{
  const f=fixture();delete f.d.helper_health.support_transport;
  expect((await f.call("request",{device_id:"tablet",capability:"screen"})).status).toBe(409);
  f.d.helper_health.support_transport="webrtc";const b=await f.begin();
  expect((await f.call("viewer",b)).status).toBe(409);
  expect((await f.call("publish",b)).status).toBe(409);
  expect((await f.call("prepare",b)).body.capability).toBe("screen");
 });
 it.each(["screen","camera_front","camera_back"])("exchanges only authorized video signaling: %s",async cap=>{
  const f=fixture(),b=await f.begin(cap);await f.call("prepare",b);
  const pub=await f.call("publish",b);expect(pub.status).toBe(200);
  expect(pub.body.iceServers).toEqual([]);expect(pub.body.token).toBeUndefined();
  expect((await f.call("offer",{...b,sdp:offer})).status).toBe(200);
  expect((await f.call("viewer",b)).body.sdp).toBe(offer);
  expect((await f.call("answer",{...b,sdp:answer})).status).toBe(200);
  expect((await f.call("answer_poll",b)).body.sdp).toBe(answer);
  expect((await f.call("started",b)).status).toBe(200);
  expect((await f.call("status",b)).body.session.state).toBe("active");
  await f.call("end",b);
  expect(f.c.tables.TabletSupportSession[0]).toMatchObject({offer_sdp:"",answer_sdp:""});
  expect(JSON.stringify(f.c.tables.AuditLog)).not.toContain("fingerprint");
 });
 it.each([offer+"m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",offer+"m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n",offer.replace("sendonly","sendrecv"),"x".repeat(65537)])("rejects extra media, directions or oversized signaling",async sdp=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  expect((await f.call("offer",{...b,sdp})).status).toBe(400);
 });
 it("rejects wrong device/token and stops a demoted requester",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  expect((await f.call("publish",{...b,device_id:"another"})).status).toBe(401);
  expect((await f.call("publish",{...b,device_token:"b".repeat(64)})).status).toBe(401);
  f.c.tables.User[0].role="staff";
  expect((await f.call("pulse",b)).status).toBe(403);
  expect(f.c.tables.TabletSupportSession[0].ended_at).toBeTruthy();
 });
 it("prevents another admin from reading or writing the answer",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);await f.call("offer",{...b,sdp:offer});
  f.c.tables.User[0].id="another-admin";
  expect((await f.call("viewer",b)).status).toBe(403);
  expect((await f.call("answer",{...b,sdp:answer})).status).toBe(403);
 });
 it("never reauthorizes an ended session after a stale active state write",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);await f.call("end",b);
  f.c.tables.TabletSupportSession[0].state="active";
  expect((await f.call("publish",b)).status).toBe(410);
  expect((await f.call("pulse",b)).status).toBe(410);
  expect((await f.call("viewer",b)).status).toBe(410);
  expect((await f.call("status",b)).body.session.state).toBe("ended");
 });
 it("invalidates the old session after reassignment or pointer replacement",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  f.d.support_request.id="new-request";
  expect((await f.call("publish",b)).status).toBe(403);
 });
 it("expires before connection authorization",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  f.c.tables.TabletSupportSession[0].expires_at=new Date(Date.now()-1).toISOString();
  expect((await f.call("publish",b)).status).toBe(410);
 });
 it("issues short-lived coturn credentials without disclosing the relay secret",async()=>{
  const f=fixture();Object.assign(f.settings,{TT_SUPPORT_TURN_URL:"turns:relay.example.com:5349?transport=tcp",TT_SUPPORT_TURN_SECRET:"synthetic-secret-never-real-1234567890"});
  const b=await f.begin();await f.call("prepare",b);
  const r=await f.call("publish",b),ice=r.body.iceServers[0];
  expect(r.status).toBe(200);
  expect(ice.credential).toBe(createHmac("sha1",f.settings.TT_SUPPORT_TURN_SECRET).update(ice.username).digest("base64"));
  expect(Number(ice.username.split(":")[0])).toBeLessThanOrEqual(Math.ceil(Date.now()/1000)+661);
  expect(JSON.stringify(r)).not.toContain(f.settings.TT_SUPPORT_TURN_SECRET);
 });
 it("fails closed for malformed relay configuration",async()=>{
  const f=fixture();f.settings.TT_SUPPORT_TURN_URL="https://example.com/";
  expect((await f.call("config")).body.enabled).toBe(false);
 });
 it("allows stop even if remote viewing was disabled after session creation",async()=>{
  const f=fixture(),b=await f.begin();f.settings.TT_SUPPORT_ENABLED="false";
  expect((await f.call("end",b)).status).toBe(200);
 });
 it("does not expose private support signaling through the entity gateway",()=>{
  expect(fs.readFileSync("base44/functions/entityAccess/entry.ts","utf8")).not.toContain("'TabletSupportSession'");
 });
});
