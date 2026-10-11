import { expect, it } from "vitest";
import { load, mock, request, digest } from "../../../security-tests/helpers.js";
const setup = () => {
 const sdk=mock("admin");
 for(let i=0;i<30;i++) {
  sdk.tables.User.push({id:"p"+i,role:"staff",email:"p"+i+"@test.invalid"});
  sdk.tables.CompanyMembership.push({id:"m"+i,user_id:"p"+i,company_id:"a",scope:"passenger",active:true,code_hash:digest("JOIN12345678")});
 }
 return sdk;
};
it("loads admin user memberships in one batch and reads a shared company once",async()=>{
 const sdk=setup(), handler=load("entityAccess",sdk).default;
 const response=await handler(request({entity:"User",operation:"list"}));
 expect(response.status).toBe(200);
 const rows=(await response.json()).result;
 expect(rows.filter(r=>r.id.startsWith("p")).every(r=>r.company_id==="a")).toBe(true);
 expect(sdk.reads.filter(r=>r.name==="CompanyMembership")).toHaveLength(1);
 expect(sdk.reads.filter(r=>r.name==="Company" && r.method==="get")).toHaveLength(1);
 sdk.tables.Company[0].access_code="REVOKED";
 const fresh=await handler(request({entity:"User",operation:"list"}));
 expect((await fresh.json()).result.filter(r=>r.id.startsWith("p")).every(r=>r.company_id==="")).toBe(true);
});
it("reuses the directory company list for passenger checks",async()=>{
 const sdk=setup(), handler=load("nfcCards",sdk).default;
 const response=await handler(request({action:"people"}));
 expect(response.status).toBe(200);
 expect((await response.json()).people.filter(p=>p.id.startsWith("p"))).toHaveLength(30);
 expect(sdk.reads.filter(r=>r.name==="Company" && r.method==="get")).toHaveLength(0);
});
it("falls back to per-user membership reads when the batch reaches its cap",async()=>{
 const sdk=mock("admin");
 sdk.tables.User.push({id:"p",role:"staff"});
 sdk.tables.CompanyMembership=Array.from({length:5000},(_,i)=>({id:"m"+i,user_id:"p",company_id:"a",active:true,scope:"passenger"}));
 const response=await load("entityAccess",sdk).default(request({entity:"User",operation:"list"}));
 expect(response.status).toBe(200);
 expect((await response.json()).result.find(p=>p.id==="p").company_id).toBe("a");
 expect(sdk.reads.filter(r=>r.name==="CompanyMembership")).toHaveLength(3);
});
it("preserves an NFC read rate limit and server cooldown instead of returning 500",async()=>{
 const sdk=mock("admin"), original=sdk.asServiceRole.entities;
 sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
  const entity=target[name];
  return name==="Driver"?{...entity,list:async()=>{throw {status:429,response:{headers:{"retry-after":"45"}}};}}:entity;
 }});
 const response=await load("nfcCards",sdk).default(request({action:"people"}));
 expect(response.status).toBe(429);
 expect(response.headers.get("retry-after")).toBe("45");
});
