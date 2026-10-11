import {describe,it,expect,vi,beforeEach} from "vitest";
const f=vi.hoisted(()=>({platform:"android",permission:"granted",listeners:{},removes:[],fail:false,prompts:0,token:"NATIVE-FCM-TOKEN"}));
vi.mock("@capacitor/core",()=>({Capacitor:{isNativePlatform:()=>f.platform!=="web",getPlatform:()=>f.platform}}));
vi.mock("@capacitor/push-notifications",()=>({PushNotifications:{
 checkPermissions:async()=>({receive:f.permission}),
 requestPermissions:async()=>{f.prompts++;return {receive:"granted"};},
 addListener:async(name,cb)=>{f.listeners[name]=cb;return {remove:async()=>{f.removes.push(name);delete f.listeners[name];}};},
 register:async()=>{if(f.fail)f.listeners.registrationError({});else f.listeners.registration({value:f.token});}
}}));
import {requestNativePush,nativePushPermission,notificationLink,onNativeNotificationTap,looksLikeApnsToken} from "../nativePush";
beforeEach(()=>Object.assign(f,{platform:"android",permission:"granted",listeners:{},removes:[],fail:false,prompts:0,token:"NATIVE-FCM-TOKEN"}));
describe("native FCM registration",()=>{
 it("installs listeners before registration and cleans both up",async()=>{
  expect(await requestNativePush()).toEqual({token:"NATIVE-FCM-TOKEN",reason:null});
  expect(f.removes.sort()).toEqual(["registration","registrationError"]);
 });
 it("quiet registration never prompts and denied permission never registers",async()=>{
  f.permission="prompt";
  expect((await requestNativePush({prompt:false})).reason).toBe("dismissed");expect(f.prompts).toBe(0);
  f.permission="denied";expect((await requestNativePush()).reason).toBe("denied");expect(f.removes).toEqual([]);
 });
 it("iPhone: saves the Firebase token the app hands over",async()=>{
  f.platform="ios";f.permission="prompt";f.token="fcm-ios:APA91bH_example_token";
  expect(await nativePushPermission()).toBe("default");
  expect(await requestNativePush()).toEqual({token:"fcm-ios:APA91bH_example_token",reason:null});
  expect(f.prompts).toBe(1);
 });
 it("iPhone build without the Firebase swap: a raw Apple token is never saved",async()=>{
  f.platform="ios";f.token="A1B2C3D4".repeat(8);
  expect(looksLikeApnsToken(f.token)).toBe(true);
  expect(await requestNativePush()).toEqual({token:null,reason:"native_setup"});
  expect(looksLikeApnsToken("NATIVE-FCM-TOKEN")).toBe(false);
 });
 it("reports missing native configuration without claiming success",async()=>{
  f.fail=true;expect((await requestNativePush()).reason).toBe("native_setup");
  expect(f.removes).toHaveLength(2);
 });
 it("not in the phone app: nothing to register",async()=>{
  f.platform="web";
  expect((await requestNativePush()).reason).toBe("native_setup");
  expect(await nativePushPermission()).toBe("unsupported");
 });
});
describe("tapping a notification",()=>{
 it("opens the page it is about, same-site paths only",async()=>{
  expect(notificationLink({link:"/driver-phone/me"})).toBe("/driver-phone/me");
  for(const bad of [undefined,{},{link:""},{link:"https://evil.example"},{link:"//evil.example"},{link:"/\\evil"},{link:5}])expect(notificationLink(bad)).toBeNull();
  const go=vi.fn();
  const stop=onNativeNotificationTap(go);
  await vi.waitFor(()=>expect(f.listeners.pushNotificationActionPerformed).toBeTypeOf("function"));
  f.listeners.pushNotificationActionPerformed({actionId:"tap",notification:{data:{link:"/admin"}}});
  f.listeners.pushNotificationActionPerformed({actionId:"tap",notification:{data:{link:"https://evil.example"}}});
  expect(go.mock.calls).toEqual([["/admin"]]);
  stop();
  await vi.waitFor(()=>expect(f.removes).toContain("pushNotificationActionPerformed"));
 });
});
