import {beforeEach,describe,it,expect,vi} from "vitest";
const env=vi.hoisted(()=>({native:true,platform:"android",plugin:{}}));
vi.mock("@capacitor/core",()=>({
 Capacitor:{isNativePlatform:()=>env.native,getPlatform:()=>env.platform,isPluginAvailable:()=>true},
 registerPlugin:()=>env.plugin,
}));
import {nativeDashcamAvailable,openRearDashcam,rearDashcamState,notifyDashcamShift} from "../nativeDashcam";
beforeEach(()=>{
 env.native=true;env.platform="android";
 env.plugin.openDashcam=vi.fn(async()=>{});
 env.plugin.getDashcamState=vi.fn(async()=>({recording:true}));
 env.plugin.dashcamShift=vi.fn(async()=>{});
});
describe("local rear dashcam bridge",()=>{
 it("stays absent on web and iOS",async()=>{
  env.native=false;expect(nativeDashcamAvailable()).toBe(false);expect(await openRearDashcam()).toBe(false);
  await notifyDashcamShift("start_shift");expect(env.plugin.dashcamShift).not.toHaveBeenCalled();
  env.native=true;env.platform="ios";expect(nativeDashcamAvailable()).toBe(false);
 });
 it("opens native local controls without credentials or server requests",async()=>{
  expect(await openRearDashcam()).toBe(true);expect(env.plugin.openDashcam).toHaveBeenCalledWith();
 });
 it("reports native recording state",async()=>{expect(await rearDashcamState()).toEqual({recording:true});});
 it("handles an older installed plugin without breaking kiosk UI",async()=>{
  env.plugin.getDashcamState.mockRejectedValue(new Error("not implemented"));
  expect(await rearDashcamState()).toBe(null);
 });
 it("passes only supported shift actions",async()=>{
  await notifyDashcamShift("start_shift");await notifyDashcamShift("delete");await notifyDashcamShift("end_shift");
  expect(env.plugin.dashcamShift.mock.calls).toEqual([[{action:"start_shift"}],[{action:"end_shift"}]]);
 });
 it("recording errors do not undo a shift",async()=>{
  env.plugin.dashcamShift.mockRejectedValue(new Error("encoder failed"));
  await expect(notifyDashcamShift("start_shift")).resolves.toBeUndefined();
 });
});
