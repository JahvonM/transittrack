import { afterEach, expect, it, vi } from "vitest";
import { createFunctionTransport } from "../functionTransport";
import { withRateLimitRetry } from "../scopedEntities";
afterEach(() => vi.useRealTimers());

it("paces all function names and limits concurrent calls", async () => {
 vi.useFakeTimers();
 const starts = []; let running = 0, peak = 0;
 const raw = vi.fn(async name => {
  starts.push([name, Date.now()]); running++; peak = Math.max(peak, running);
  await new Promise(resolve => setTimeout(resolve, 800)); running--;
  return name;
 });
 const call = createFunctionTransport(raw);
 const pending = Promise.all(["entityAccess","driverSession","kioskHeartbeat","kioskCheckIn","companyAccess"].map(name=>call(name,{})));
 await vi.runAllTimersAsync();
 await expect(pending).resolves.toHaveLength(5);
 expect(peak).toBe(2);
 for(let i=1;i<starts.length;i++) expect(starts[i][1]-starts[i-1][1]).toBeGreaterThanOrEqual(250);
});

it.each(["sdk","axios","date"])("shares a server cooldown across kiosk, driver and admin: %s",async shape=>{
 vi.useFakeTimers();
 const headers={"retry-after":shape==="date"?new Date(Date.now()+45000).toUTCString():"45"};
 const error=shape==="sdk"?{status:429,headers}:{response:{status:429,headers}};
 const raw=vi.fn().mockRejectedValueOnce(error).mockResolvedValue({data:{ok:true}});
 const call=createFunctionTransport(raw);
 await expect(call("kioskHeartbeat",{})).rejects.toBe(error);
 await expect(call("driverSession",{action:"verify_pin"})).rejects.toMatchObject({status:429});
 await vi.advanceTimersByTimeAsync(44000);
 await expect(call("entityAccess",{})).rejects.toMatchObject({status:429});
 expect(raw).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1000);
 await expect(call("kioskHeartbeat",{})).resolves.toEqual({data:{ok:true}});
 expect(raw).toHaveBeenCalledTimes(2);
});

it("does not send queued mutations after another request triggers a cooldown",async()=>{
 vi.useFakeTimers();
 const raw=vi.fn().mockRejectedValue({status:429});
 const call=createFunctionTransport(raw);
 const checks=Promise.allSettled([call("kioskHeartbeat"),call("kioskCheckIn",{action:"check_in"}),call("driverSession",{action:"verify_pin"})]);
 await vi.runAllTimersAsync();
 expect((await checks).every(r=>r.status==="rejected"&&r.reason.status===429)).toBe(true);
 expect(raw).toHaveBeenCalledTimes(1);
});

it("read retry can recover through the transport without a nested queue deadlock",async()=>{
 vi.useFakeTimers();
 const raw=vi.fn().mockRejectedValueOnce({status:429}).mockResolvedValue({data:{result:[]}});
 const call=createFunctionTransport(raw);
 const pending=withRateLimitRetry(()=>call("entityAccess",{}));
 await vi.runAllTimersAsync();
 await expect(pending).resolves.toEqual({data:{result:[]}});
 expect(raw).toHaveBeenCalledTimes(2);
});

it.each([403,500])("does not retry a failed write or PIN check (%s)",async status=>{
 const raw=vi.fn().mockRejectedValue({status});
 await expect(createFunctionTransport(raw)("driverSession",{action:"verify_pin"})).rejects.toMatchObject({status});
 expect(raw).toHaveBeenCalledTimes(1);
});
