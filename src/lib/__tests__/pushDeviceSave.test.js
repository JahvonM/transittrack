import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
const fixture=vi.hoisted(()=>({invoke:vi.fn(),toast:vi.fn()}));
vi.mock("@/api/base44Client",()=>({base44:{functions:{invoke:fixture.invoke}}}));
vi.mock("@/components/ui/use-toast",()=>({useToast:()=>({toast:fixture.toast})}));
vi.mock("@/lib/firebase",()=>({requestPushToken:async()=>({token:"synthetic-notification-token-long-enough",reason:null}),pushPermission:async()=>"granted",onForegroundMessage:()=>()=>{}}));
import { usePushNotifications } from "@/hooks/usePushNotifications";
function setup(){let hook;function Host(){hook=usePushNotifications({email:"me@test.invalid",role:"staff",companyId:"editable-profile-company"});return null;}renderToString(React.createElement(Host));return hook;}
beforeEach(()=>{fixture.invoke.mockReset();fixture.toast.mockReset();});
describe("device registration confirmation",()=>{
 it("sends only the token to the protected action and waits for the server",async()=>{
  let finish;fixture.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const hook=setup();const pending=hook.enableNotifications();await vi.waitFor(()=>expect(fixture.invoke).toHaveBeenCalledTimes(1));
  expect(fixture.invoke).toHaveBeenCalledWith("entityAccess",{entity:"PushToken",operation:"register",data:{token:"synthetic-notification-token-long-enough"}});
  expect(fixture.toast).not.toHaveBeenCalled();
  finish({data:{ok:true}});expect(await pending).toBe(true);expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Notifications on"}));
 });
 it.each(["rejected","missing acknowledgement"])("does not claim success on %s",async mode=>{
  if(mode==="rejected")fixture.invoke.mockRejectedValue(Error("synthetic save failure"));else fixture.invoke.mockResolvedValue({data:{ok:false}});
  expect(await setup().enableNotifications()).toBe(false);
  expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Couldn't save this device",variant:"destructive"}));
  expect(fixture.toast).not.toHaveBeenCalledWith(expect.objectContaining({title:"Notifications on"}));
 });
});
