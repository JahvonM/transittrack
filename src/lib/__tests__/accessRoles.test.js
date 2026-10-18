import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
const call=async(sdk,body)=>{const r=await load("accessRoles",sdk).default(request(body));return {status:r.status,body:await r.json()};};
const withRole=()=>{
 const sdk=mock("staff");
 sdk.tables.User[0].access_role_id="role-fleet";
 sdk.tables.RoleAssignment=[{id:"assignment",user_id:"caller",role_id:"role-fleet"}];
 sdk.tables.AccessRole=[{id:"role-fleet",name:"Fleet viewer",active:true,sections:["fleet"]}];
 return sdk;
};
describe("custom role boundaries",()=>{
 it("allows only checked screens and projects credentials out of assigned fleet data",async()=>{
  const sdk=withRole();
  const result=await call(sdk,{action:"workspace",section:"fleet",fields:["driver_pin"]});
  expect(result.status).toBe(200);expect(result.body.rows).toHaveLength(2);
  expect(JSON.stringify(result.body.rows)).not.toContain("driver_pin");
  for(const section of ["users","messages","billing","unknown"])expect((await call(sdk,{action:"workspace",section})).status).toBe(403);
 });
 it("does not trust a claimed role id without a protected assignment",async()=>{
  const sdk=withRole();sdk.tables.RoleAssignment=[];
  expect((await call(sdk,{action:"workspace",section:"fleet",role_id:"role-fleet"})).status).toBe(403);
 });
 it("revokes checked screens and disabled roles on the next request",async()=>{
  const sdk=withRole();
  expect((await call(sdk,{action:"workspace",section:"fleet"})).status).toBe(200);
  sdk.tables.AccessRole[0].sections=[];
  expect((await call(sdk,{action:"workspace",section:"fleet"})).status).toBe(403);
  sdk.tables.AccessRole[0].sections=["fleet"];sdk.tables.AccessRole[0].active=false;
  expect((await call(sdk,{action:"workspace",section:"fleet"})).status).toBe(403);
 });
 it.each(["staff","company","mechanic","driver",null])("refuses role administration by %s",async role=>{
  const sdk=mock(role);
  for(const action of ["list","save","assign"])expect([401,403]).toContain((await call(sdk,{action,name:"Admin",sections:["users"],user_id:"caller",role_id:"role-fleet"})).status);
  expect(sdk.writes).toEqual([]);
 });
 it("checks the current administrator record and rejects invalid permissions",async()=>{
  const sdk=mock("admin");
  expect((await call(sdk,{action:"save",name:"Bad",sections:["all","secrets"]})).status).toBe(400);
  sdk.auth.me=async()=>({id:"caller",role:"admin"});sdk.tables.User[0].role="staff";
  expect((await call(sdk,{action:"save",name:"Forged",sections:["fleet"]})).status).toBe(403);
 });
 it("creates named roles, assigns a view-only account and preserves full admins",async()=>{
  const sdk=mock("admin");sdk.tables.User.push({id:"viewer",role:"mechanic"});
  const saved=await call(sdk,{action:"save",name:"Supervisor",sections:["fleet","schedule","fleet"]});
  expect(saved.status).toBe(200);expect(saved.body.role.sections).toEqual(["fleet","schedule"]);
  const id=saved.body.role.id;
  expect((await call(sdk,{action:"assign",user_id:"caller",role_id:id})).status).toBe(403);
  expect((await call(sdk,{action:"assign",user_id:"viewer",role_id:id})).status).toBe(200);
  expect(sdk.tables.User.find(u=>u.id==="viewer")).toMatchObject({role:"staff",access_role_id:id});
  expect(sdk.tables.User[0].role).toBe("admin");
  expect(sdk.tables.RoleAssignment[0]).toMatchObject({user_id:"viewer",role_id:id});
  expect((await call(sdk,{action:"assign",user_id:"viewer",role_id:""})).status).toBe(200);
  expect(sdk.tables.RoleAssignment[0].role_id).toBe("");
 });
 it("projects role access onto the own profile and blocks broad gateway reads/writes",async()=>{
  const sdk=withRole();
  const api=load("entityAccess",sdk).default;
  const me=await api(request({entity:"User",operation:"get",id:"me"}));
  expect((await me.json()).result.access_role).toMatchObject({id:"role-fleet",sections:["fleet"]});
  for(const body of [{entity:"Vehicle",operation:"list"},{entity:"User",operation:"update",id:"caller",data:{role:"admin"}},{entity:"User",operation:"update",id:"caller",data:{access_role_id:"admin"}}])expect((await api(request(body))).status).toBe(403);
  expect((await api(request({entity:"AccessRole",operation:"list"}))).status).toBe(403);
 });
});
