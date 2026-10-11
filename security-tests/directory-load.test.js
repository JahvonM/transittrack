import {it,expect} from "vitest";
import {load,mock,request} from "./helpers.js";
it("reads directory tables sequentially and never writes",async()=>{
 const client=mock("admin"),original=client.asServiceRole.entities;let active=0,max=0;
 client.asServiceRole.entities=new Proxy(original,{get(target,name){const entity=target[name];return new Proxy(entity,{get(e,method){const fn=e[method];if(typeof fn!=="function")return fn;return async(...args)=>{active++;max=Math.max(max,active);try{await Promise.resolve();return await fn(...args);}finally{active--;}};}});}});
 const response=await load("nfcCards",client).default(request({action:"directory"}));
 expect(response.status).toBe(200);expect(max).toBe(1);expect(client.writes).toEqual([]);
});
it("a failed card ledger fails the read instead of reporting no cards",async()=>{
 const client=mock("admin"),original=client.asServiceRole.entities;
 client.asServiceRole.entities=new Proxy(original,{get(target,name){const entity=target[name];return name==="NfcCard"?{...entity,list:async()=>{throw Object.assign(new Error("storage unavailable"),{status:503});}}:entity;}});
 const response=await load("nfcCards",client).default(request({action:"directory"}));
 expect(response.status).toBeGreaterThanOrEqual(500);expect((await response.json()).people).toBeUndefined();expect(client.writes).toEqual([]);
});
