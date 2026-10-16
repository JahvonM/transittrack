import {describe,it,expect} from "vitest";
import fs from "node:fs";
import ts from "typescript";
import {webcrypto} from "node:crypto";
import {AccessToken,TrackSource,TokenVerifier} from "livekit-server-sdk";
import {mock,request,digest} from "./helpers.js";
const secret="synthetic-test-secret-at-least-32-chars";
function fixture(role="admin") {
 const c=mock(role), deletes=[], creates=[];
 const modules={};
 const secrets={get:n=>({TT_SUPPORT_ENABLED:"true",TT_LIVEKIT_URL:"wss://test.livekit.cloud",TT_LIVEKIT_API_KEY:"testkey",TT_LIVEKIT_API_SECRET:secret})[n]};
 class Rooms {async createRoom(o){creates.push(o)} async deleteRoom(n){deletes.push(n)}}
 function module(file) {
  if(modules[file])return modules[file];
  const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const out={};modules[file]=out;
  const require=name=> name.includes("@base44/sdk")?{createClientFromRequest:()=>c}:name.includes("livekit-server-sdk")?{AccessToken,TrackSource,RoomServiceClient:Rooms}:name==="base44:runtime"?{secrets}:module("base44/shared/"+name.split("/").pop());
  new Function("exports","require","crypto",js)(out,require,webcrypto);return out;
 }
 const handler=module("base44/functions/tabletSupport/entry.ts").default;
 const d=c.tables.KioskDevice[0];d.helper_health={support_available:true};
 const token="a".repeat(64);
 c.tables.DeviceCredential=[{device_id:d.id,token_hash:digest(token),pairing_code_hash:digest(d.pairing_code),
  company_id:d.company_id,vehicle_id:d.vehicle_id,kiosk_type:d.kiosk_type,expires_at:new Date(Date.now()+3600000).toISOString()}];
 const call=async(operation,body={})=>{const r=await handler(request({operation,...body}));return {status:r.status,body:await r.json()}};
 const begin=async(capability="screen")=>{
  const r=await call("request",{device_id:d.id,capability});expect(r.status).toBe(200);
  return {session_id:r.body.session.id,device_id:d.id,device_token:token};
 };
 return {c,d,token,call,begin,secrets,deletes,creates};
}
describe("remote tablet viewing handlers",()=>{
 it.each([null,"staff","mechanic","company","driver"])("rejects %s before entity reads",async role=>{
  const f=fixture(role),r=await f.call("request",{device_id:"tablet",capability:"screen"});
  expect([401,403]).toContain(r.status);expect(f.c.reads).toHaveLength(0);
 });
 it("stays disabled with incomplete service configuration",async()=>{
  const f=fixture();f.secrets.get=()=>null;
  expect((await f.call("config")).body.enabled).toBe(false);
  expect((await f.call("request")).status).toBe(503);expect(f.c.writes).toHaveLength(0);
 });
 it("requires installed support and local approval state",async()=>{
  const f=fixture();f.d.helper_health.support_available=false;
  expect((await f.call("request",{device_id:"tablet",capability:"screen"})).status).toBe(409);
  f.d.helper_health.support_available=true;const b=await f.begin();
  expect((await f.call("viewer",b)).status).toBe(409);
  expect((await f.call("publish",b)).status).toBe(409);
  expect((await f.call("prepare",b)).body.capability).toBe("screen");
 });
 it.each(["screen","camera_front","camera_back"])("issues only the intended video grant: %s",async cap=>{
  const f=fixture(),b=await f.begin(cap);await f.call("prepare",b);
  const pub=await f.call("publish",b);expect(pub.status).toBe(200);
  const verify=new TokenVerifier("testkey",secret),claims=await verify.verify(pub.body.token);
  expect(claims.video).toMatchObject({canPublish:true,canSubscribe:false,canPublishData:false,canPublishSources:[cap==="screen"?"screen_share":"camera"]});
  expect(claims.exp-claims.nbf).toBeLessThanOrEqual(30);
  await f.call("started",b);
  const viewer=await f.call("viewer",b);expect(viewer.status).toBe(200);
  const view=await verify.verify(viewer.body.token);
  expect(view.video).toMatchObject({canPublish:false,canSubscribe:true,canPublishData:false});
  expect(JSON.stringify(f.c.tables.TabletSupportSession)).not.toContain(pub.body.token);
  expect(f.c.tables.AuditLog.length).toBeGreaterThanOrEqual(3);
 });
 it("rejects wrong device, token, reassignment, and demoted requester",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  expect((await f.call("publish",{...b,device_id:"another"})).status).toBe(401);
  expect((await f.call("publish",{...b,device_token:"b".repeat(64)})).status).toBe(401);
  f.c.tables.User[0].role="staff";
  expect((await f.call("pulse",b)).status).toBe(403);
  expect(f.c.tables.TabletSupportSession[0].ended_at).toBeTruthy();
 });
 it("never reauthorizes an ended session even if a concurrent state write says active",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);await f.call("end",b);
  f.c.tables.TabletSupportSession[0].state="active";
  expect((await f.call("publish",b)).status).toBe(410);
  expect((await f.call("pulse",b)).status).toBe(410);
  expect((await f.call("viewer",b)).status).toBe(410);
  expect((await f.call("status",b)).body.session.state).toBe("ended");
 });
 it("invalidates an older session when the device pointer changes",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  f.d.support_request.id="new-request";
  expect((await f.call("publish",b)).status).toBe(403);
 });
 it("expires before token issuance and deletes the room",async()=>{
  const f=fixture(),b=await f.begin();await f.call("prepare",b);
  f.c.tables.TabletSupportSession[0].expires_at=new Date(Date.now()-1).toISOString();
  expect((await f.call("publish",b)).status).toBe(410);expect(f.deletes).toHaveLength(1);
 });
 it("does not expose private support sessions through the entity gateway",()=>{
  const source=fs.readFileSync("base44/functions/entityAccess/entry.ts","utf8");
  expect(source).not.toContain("'TabletSupportSession'");
 });
});
