import {describe,it,expect,vi,beforeEach} from "vitest";
const f=vi.hoisted(()=>({platform:"android",permission:"granted",listeners:{},removes:[],fail:false,prompts:0}));
vi.mock("@capacitor/core",()=>({Capacitor:{isNativePlatform:()=>true,getPlatform:()=>f.platform}}));
vi.mock("@capacitor/push-notifications",()=>({PushNotifications:{
 checkPermissions:async()=>({receive:f.permission}),
 requestPermissions:async()=>{f.prompts++;return {receive:"granted"};},
 addListener:async(name,cb)=>{f.listeners[name]=cb;return {remove:async()=>{f.removes.push(name);delete f.listeners[name];}};},
 register:async()=>{if(f.fail)f.listeners.registrationError({});else f.listeners.registration({value:"NATIVE-FCM-TOKEN"});}
}}));
import {requestNativePush} from "../nativePush";
beforeEach(()=>Object.assign(f,{platform:"android",permission:"granted",listeners:{},removes:[],fail:false,prompts:0}));
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
 it("does not send an iOS APNs token to an FCM backend",async()=>{
  f.platform="ios";expect((await requestNativePush()).reason).toBe("native_setup");expect(f.prompts).toBe(0);
 });
 it("reports missing native configuration without claiming success",async()=>{
  f.fail=true;expect((await requestNativePush()).reason).toBe("native_setup");
  expect(f.removes).toHaveLength(2);
 });
});
