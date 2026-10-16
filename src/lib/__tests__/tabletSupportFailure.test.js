
import {describe,it,expect} from "vitest";
import {tabletSupportFailure} from "../tabletSupportFailure";
describe("remote-viewing failure messages",()=>{
 it("distinguishes relay discovery timeout from backend refusal and capture errors",()=>{
  expect(tabletSupportFailure("ICE_GATHERING_TIMEOUT")).toContain("Finding a network connection timed out");
  expect(tabletSupportFailure("PUBLISH_HTTP_403")).toContain("Video authorization was refused (HTTP 403)");
  expect(tabletSupportFailure("CAPTURE_ERROR")).toContain("Camera or screen startup failed");
 });
 it.each([null,{}, "token=secret","CAPTURE_ERROR extra","UNKNOWN_ERROR"])("never reflects arbitrary diagnostics: %s",value=>{
  expect(tabletSupportFailure(value)).toBe("");
 });
});
