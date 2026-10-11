import {it,expect} from "vitest";
import {load,mock,request} from "./helpers.js";
it.each([null,"staff","company","mechanic","driver"])("denies non-admin %s before reading datasets",async role=>{
 const client=mock(role),response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"list",datasets:["vehicles","users"]}));
 expect(response.status).toBe(role?403:401);
 expect(client.reads.filter(r=>r.name==="Vehicle")).toHaveLength(0);
});
it("reads both companies for admin using one context and existing projections",async()=>{
 const client=mock("admin");
 const response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"list",datasets:["vehicles","companies","routes"]}));
 expect(response.status).toBe(200);const result=(await response.json()).result;
 expect(result.datasets.vehicles.map(v=>v.id)).toEqual(["bus-a","bus-b"]);
 expect(JSON.stringify(result.datasets.vehicles)).not.toContain("1234");
 expect(client.reads.filter(r=>r.name==="User"&&r.method==="get")).toHaveLength(1);
 expect(client.writes).toEqual([]);
});
it.each([["DriverPinCredential"],["constructor"],Array(17).fill("vehicles")])("rejects invalid read descriptors",async datasets=>{
 const client=mock("admin"),response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"list",datasets}));
 expect(response.status).toBe(400);expect(client.writes).toEqual([]);
});
it("does not accept writes through the bootstrap",async()=>{
 const client=mock("admin"),response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"delete",datasets:["vehicles"]}));
 expect(response.status).toBe(400);expect(client.writes).toEqual([]);
});
it("keeps successful datasets and reports sanitized per-list failures",async()=>{
 const client=mock("admin"),original=client.asServiceRole.entities;
 client.asServiceRole.entities=new Proxy(original,{get(target,name){const entity=target[name];return name==="Part"?{...entity,filter:async()=>{throw Object.assign(new Error("PRIVATE SERVER DETAIL"),{response:{status:503}});}}:entity;}});
 const response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"list",datasets:["parts","vehicles"]}));
 const result=(await response.json()).result;
 expect(result.datasets.vehicles).toHaveLength(2);expect(result.errors.parts.status).toBe(503);
 expect(JSON.stringify(result)).not.toContain("PRIVATE SERVER DETAIL");
});
it("keeps the approved user membership projection",async()=>{
 const client=mock("admin");
 client.tables.User.push({id:"passenger",role:"staff",company_id:"b",email:"p@test.invalid",access_code:"PRIVATE"});
 client.tables.CompanyMembership.push({id:"approved",user_id:"passenger",company_id:"a",scope:"passenger",active:true});
 const response=await load("entityAccess",client).default(request({entity:"AdminBootstrap",operation:"list",datasets:["users"]}));
 const rows=(await response.json()).result.datasets.users;
 expect(rows.find(r=>r.id==="passenger")).toMatchObject({company_id:"a",company_membership_approved:true});
 expect(JSON.stringify(rows)).not.toContain("PRIVATE");
});
