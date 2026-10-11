import {it,expect,vi} from "vitest";
import {createAdminBatchLoader} from "./adminBatchLoader";
const reply=datasets=>({data:{result:{datasets,errors:{}}}});
it("combines startup datasets into one call and caches independent copies",async()=>{
 const invoke=vi.fn(async keys=>reply(Object.fromEntries(keys.map(k=>[k,[{id:k}]]))));
 const load=createAdminBatchLoader(invoke);
 const first=await load(["vehicles","routes","companies"]);expect(invoke).toHaveBeenCalledTimes(1);
 first[0].value[0].id="changed";
 expect((await load(["vehicles"]))[0].value[0].id).toBe("vehicles");
 expect(invoke).toHaveBeenCalledTimes(1);
});
it("overlapping sections share pending datasets",async()=>{
 let finish;const invoke=vi.fn(keys=>keys.includes("vehicles")?new Promise(r=>finish=()=>r(reply({vehicles:[],routes:[]}))):Promise.resolve(reply({companies:[]})));
 const load=createAdminBatchLoader(invoke),a=load(["vehicles","routes"]),b=load(["vehicles","companies"]);
 await Promise.resolve();expect(invoke.mock.calls.map(c=>c[0])).toEqual([["vehicles","routes"],["companies"]]);
 finish();await Promise.all([a,b]);
});
it("expires cached lists and bypasses them on explicit refresh",async()=>{
 let now=0;const invoke=vi.fn(async()=>reply({vehicles:[]})),load=createAdminBatchLoader(invoke,{now:()=>now,ttlMs:30000});
 await load(["vehicles"]);now=29000;await load(["vehicles"]);expect(invoke).toHaveBeenCalledTimes(1);
 now=31000;await load(["vehicles"]);expect(invoke).toHaveBeenCalledTimes(2);
 await load(["vehicles"],{force:true});expect(invoke).toHaveBeenCalledTimes(3);
 load.invalidate();await load(["vehicles"]);expect(invoke).toHaveBeenCalledTimes(4);
});
it("does not cache a failed dataset or throw away its successful siblings",async()=>{
 const invoke=vi.fn().mockResolvedValueOnce({data:{result:{datasets:{vehicles:[{id:"kept"}]},errors:{parts:{status:429,error:"Busy"}}}}}).mockResolvedValueOnce(reply({parts:[]}));
 const load=createAdminBatchLoader(invoke),results=await load(["vehicles","parts"]);
 expect(results[0].status).toBe("fulfilled");expect(results[1].reason.status).toBe(429);
 await load(["vehicles","parts"]);expect(invoke.mock.calls[1][0]).toEqual(["parts"]);
});
it("keeps caches isolated to each mounted admin session",async()=>{
 const a=vi.fn(async()=>reply({vehicles:[{id:"A"}]})),b=vi.fn(async()=>reply({vehicles:[{id:"B"}]}));
 await createAdminBatchLoader(a)(["vehicles"]);
 expect((await createAdminBatchLoader(b)(["vehicles"]))[0].value[0].id).toBe("B");
 expect(b).toHaveBeenCalledTimes(1);
});
it("does not interpret a malformed response as an empty fleet",async()=>{
 const results=await createAdminBatchLoader(async()=>({data:{result:[]}}))(["vehicles"]);
 expect(results[0].status).toBe("rejected");expect(results[0].reason.status).toBe(502);
});
