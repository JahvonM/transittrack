import {it,expect,vi} from "vitest";
import {createPollBudget,startTabletPoll} from "./tabletPolling";
it("backs off reads after busy replies, respects Retry-After and resets on success",()=>{
 let now=0;const budget=createPollBudget({now:()=>now});
 budget.failed({status:429,response:{headers:{"Retry-After":"90"}}});
 now=89000;expect(budget.allowed()).toBe(false);now=90000;expect(budget.allowed()).toBe(true);
 budget.succeeded();budget.failed({status:503});now+=29000;expect(budget.allowed()).toBe(false);now+=1000;expect(budget.allowed()).toBe(true);
});
it("does not turn authorization failures into a polling cooldown",()=>{
 const budget=createPollBudget();budget.failed({status:401});expect(budget.allowed()).toBe(true);
 budget.failed({status:403});expect(budget.allowed()).toBe(true);
});
it("caps exponential backoff while respecting longer server instructions",()=>{
 let now=0;const budget=createPollBudget({now:()=>now});
 for(let n=0;n<20;n++)budget.failed({status:503});
 now=120000;expect(budget.allowed()).toBe(true);
 budget.failed({status:429,originalError:{response:{headers:{"retry-after":"180"}}}});
 now+=120000;expect(budget.allowed()).toBe(false);now+=60000;expect(budget.allowed()).toBe(true);
});
it("never overlaps slow polls and stops cleanly",async()=>{
 vi.useFakeTimers();let finish;
 const run=vi.fn(()=>new Promise(r=>finish=r));
 const stop=startTabletPoll(run,15000,{random:()=>0});
 await vi.advanceTimersByTimeAsync(15000);expect(run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledTimes(1);
 finish();await Promise.resolve();stop();await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledTimes(1);vi.useRealTimers();
});
it("spreads 100 tablets rather than firing them together",async()=>{
 vi.useFakeTimers();const times=[],stops=[];
 for(let i=0;i<100;i++)stops.push(startTabletPoll(()=>times.push(Date.now()),15000,{random:()=>i/100}));
 await vi.advanceTimersByTimeAsync(18000);
 expect(times).toHaveLength(100);expect(new Set(times).size).toBe(100);
 for(const stop of stops)stop();vi.useRealTimers();
});
