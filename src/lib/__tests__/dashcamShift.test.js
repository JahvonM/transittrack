import {beforeEach,describe,it,expect,vi} from "vitest";
import {installMemoryStorage} from "./memoryStorage";
const env=vi.hoisted(()=>({mode:"ok",jobs:[],notify:vi.fn()}));
vi.mock("@/lib/nativeDashcam",()=>({notifyDashcamShift:env.notify}));
vi.mock("@/hooks/useDriverSession",()=>({patchDriverSession:vi.fn()}));
vi.mock("@/lib/offlineJobs",()=>({
 bindDriverPayload:p=>p,
 pendingJobs:()=>env.jobs,
 isOfflineError:e=>e.offline===true,
 submitSavedJob:async(_kind,p)=>{
  if(env.mode==="offline"){env.jobs.push({payload:p});throw Object.assign(new Error("offline"),{offline:true});}
  if(env.mode==="lost-storage")throw Object.assign(new Error("offline"),{offline:true});
  if(env.mode==="rejected")throw new Error("forbidden");
  return {shift:{id:"shift-1"}};
 }
}));
import {shiftAction} from "../driverShift";
beforeEach(()=>{installMemoryStorage();localStorage.setItem("tt_driver_device_id","tablet");env.mode="ok";env.jobs=[];env.notify.mockReset();});
describe("dashcam follows accepted foreground shift actions only",()=>{
 it("notifies after a successful start",async()=>{
  await shiftAction(vi.fn(),"start_shift");expect(env.notify).toHaveBeenCalledExactlyOnceWith("start_shift");
 });
 it("notifies when an offline start is durably queued",async()=>{
  env.mode="offline";expect((await shiftAction(vi.fn(),"start_shift")).queued).toBe(true);
  expect(env.jobs).toHaveLength(1);expect(env.notify).toHaveBeenCalledExactlyOnceWith("start_shift");
 });
 it("does not start recording on server rejection",async()=>{
  env.mode="rejected";await expect(shiftAction(vi.fn(),"start_shift")).rejects.toThrow();
  expect(env.notify).not.toHaveBeenCalled();
 });
 it("does not start if offline work could not be saved",async()=>{
  env.mode="lost-storage";await expect(shiftAction(vi.fn(),"start_shift")).rejects.toThrow();
  expect(env.notify).not.toHaveBeenCalled();
 });
 it("ends recording after an accepted named end",async()=>{
  await shiftAction(vi.fn(),"end_shift",{id:"shift-1"});expect(env.notify).toHaveBeenCalledExactlyOnceWith("end_shift");
 });
 it("never stops recording for an invalid unnamed end",async()=>{
  await expect(shiftAction(vi.fn(),"end_shift")).rejects.toThrow();
  expect(env.notify).not.toHaveBeenCalled();
 });
});
