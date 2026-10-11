import {it,expect,vi} from "vitest";
import {createAdminLoader,adminLoadProblem} from "./adminLoader";
it("shares concurrent section reads and loads one dataset at a time",async()=>{
 let running=0,max=0;const calls=[];
 const dataset=key=>({load:async()=>{calls.push(key);running++;max=Math.max(max,running);await new Promise(r=>setTimeout(r,5));running--;return [key];}});
 const load=createAdminLoader({vehicles:dataset("vehicles"),routes:dataset("routes"),companies:dataset("companies")},{spacingMs:0});
 const [a,b]=await Promise.all([load(["vehicles","routes"]),load(["vehicles","companies"])]);
 expect(calls).toEqual(["vehicles","routes","companies"]);expect(max).toBe(1);
 expect(a.map(r=>r.value)).toEqual([["vehicles"],["routes"]]);expect(b.map(r=>r.value)).toEqual([["vehicles"],["companies"]]);
});
it("a failed dataset does not prevent others or a later retry",async()=>{
 const failed=vi.fn().mockRejectedValueOnce({status:503}).mockResolvedValue(["recovered"]);
 const load=createAdminLoader({a:{load:failed},b:{load:async()=>["kept"]}},{spacingMs:0});
 const result=await load(["a","b"]);expect(result.map(r=>r.status)).toEqual(["rejected","fulfilled"]);
 expect((await load(["a"]))[0].value).toEqual(["recovered"]);
});
it("paces new reads",async()=>{
 vi.useFakeTimers();
 const times=[];const load=createAdminLoader({a:{load:async()=>{times.push(Date.now());return[];}},b:{load:async()=>{times.push(Date.now());return[];}}},{spacingMs:350});
 const job=load(["a","b"]);await vi.runAllTimersAsync();await job;
 expect(times[1]-times[0]).toBeGreaterThanOrEqual(350);vi.useRealTimers();
});
it.each([[429,"Server is busy"],[401,"Sign-in needs checking"],[403,"Admin access was refused"],[503,"Server couldn't load admin data"]])("explains HTTP %s", (status,title)=>{
 expect(adminLoadProblem([{originalError:{response:{status}}}]).title).toBe(title);
});
