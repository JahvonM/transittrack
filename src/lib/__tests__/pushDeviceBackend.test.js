import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
const token="synthetic-FCM-registration-token-for-tests";
const register=async(sdk,data={token})=>{const res=await load("entityAccess",sdk).default(request({entity:"PushToken",operation:"register",data}));return {status:res.status,body:await res.json()};};
describe("protected push device registration",()=>{
 it.each(["staff","passenger","company","admin","mechanic"])("registers authenticated %s with server identity",async role=>{
  const sdk=mock(role);const res=await register(sdk,{token,email:"victim@test.invalid",role:"admin",company_id:"b"});
  expect(res).toEqual({status:200,body:{ok:true}});
  expect(sdk.tables.PushToken).toHaveLength(1);
  expect(sdk.tables.PushToken[0]).toMatchObject({token,email:"caller@test.invalid",role,company_id:["admin","mechanic"].includes(role)?"":"a",device_id:""});
  expect(JSON.stringify(res.body)).not.toContain(token);
 });
 it("rejects signed-out registration before touching tokens",async()=>{
  const sdk=mock(null);expect((await register(sdk)).status).toBe(401);
  expect(sdk.reads.some(r=>r.name==="PushToken")).toBe(false);expect(sdk.writes).toHaveLength(0);
 });
 it.each(["",null,123,"short","a".repeat(4097),"invalid whitespace in notification token"])("rejects malformed token %s",async value=>{
  const sdk=mock("staff");expect((await register(sdk,{token:value})).status).toBe(400);expect(sdk.writes).toHaveLength(0);
 });
 it("refreshes an existing device and removes stale duplicates without exposing it",async()=>{
  const sdk=mock("staff");sdk.tables.PushToken=[{id:"old",token,email:"old-account@test.invalid",role:"admin",company_id:"b",device_id:"old-tablet"},{id:"duplicate",token,email:"caller@test.invalid",role:"company",company_id:"b"}];
  expect((await register(sdk)).body).toEqual({ok:true});
  expect(sdk.tables.PushToken).toHaveLength(1);expect(sdk.tables.PushToken[0]).toMatchObject({email:"caller@test.invalid",role:"staff",company_id:"a",device_id:""});
  await register(sdk);expect(sdk.tables.PushToken).toHaveLength(1);
 });
 it("does not derive company access from the editable profile",async()=>{
  const sdk=mock("staff");sdk.tables.CompanyMembership[0].active=false;
  await register(sdk);expect(sdk.tables.PushToken[0].company_id).toBe("");
 });
 it("does not reopen credential searches",async()=>{
  const sdk=mock("staff");const res=await load("entityAccess",sdk).default(request({entity:"PushToken",operation:"filter",query:{token}}));
  expect(res.status).toBe(400);expect(sdk.reads.some(r=>r.name==="PushToken")).toBe(false);
 });
 it("fails when persistence fails",async()=>{
  const sdk=mock("staff");const db=sdk.asServiceRole.entities;
  sdk.asServiceRole.entities=new Proxy(db,{get:(target,name)=>name==="PushToken"?{...target[name],create:async()=>{throw Error("synthetic database failure");}}:target[name]});
  expect((await register(sdk)).status).toBe(500);
 });
});
