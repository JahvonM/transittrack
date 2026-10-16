import {test,expect} from "@playwright/test";
import {build} from "esbuild";
// The isolated Linux container has no mDNS responder. Only this transport test uses raw local ICE candidates.
test.use({launchOptions:{args:["--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection"]}});
test("direct receiver renders a real synthetic WebRTC video without camera, microphone or a streaming provider",async({page})=>{
 const bundle=await build({entryPoints:["src/lib/directTabletViewer.js"],bundle:true,write:false,format:"iife",globalName:"TTDirect",platform:"browser"});
 await page.route("**/rtc-test",r=>r.fulfill({contentType:"text/html",body:"<html><body></body></html>"}));
 await page.goto("/rtc-test");
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(async()=>{
  const video=document.createElement("video");video.autoplay=true;video.muted=true;video.playsInline=true;document.body.appendChild(video);
  const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;
  const paint=canvas.getContext("2d");let n=0;
  const draw=setInterval(()=>{paint.fillStyle=n++%2?"#00c8df":"#ffab00";paint.fillRect(0,0,320,180);},100);
  const stream=canvas.captureStream(10),sender=new RTCPeerConnection({iceServers:[]});
  sender.addTransceiver(stream.getVideoTracks()[0],{direction:"sendonly"});
  await sender.setLocalDescription(await sender.createOffer());
  if(sender.iceGatheringState!=="complete")await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("Sender ICE timed out: "+sender.iceGatheringState+" candidates="+(sender.localDescription?.sdp.match(/a=candidate:/g)||[]).length)),10000);sender.onicegatheringstatechange=()=>{if(sender.iceGatheringState==="complete"){clearTimeout(t);resolve();}};});
  let ended=false;
  const receiver=window.TTDirect.createSupportViewer({video,onEnded:()=>{ended=true;}});
  await receiver.connect({iceServers:[],sdp:sender.localDescription.sdp},sdp=>sender.setRemoteDescription({type:"answer",sdp}));
  window.__directResult=()=>({width:video.videoWidth,ready:video.readyState,connection:sender.connectionState,ice:sender.iceConnectionState,tracks:video.srcObject?.getTracks().map(t=>t.kind),ended,source:!!video.srcObject});
  window.__stopDirect=()=>{receiver.close();sender.close();stream.getTracks().forEach(t=>t.stop());clearInterval(draw);};
 });
 try { await expect.poll(()=>page.evaluate(()=>window.__directResult()),{timeout:7000}).toMatchObject({width:320}); } catch(e) { console.log(await page.evaluate(()=>window.__directResult())); throw e; }
 expect(await page.evaluate(()=>window.__directResult().tracks)).toEqual(["video"]);
 await page.evaluate(()=>window.__stopDirect());
 expect(await page.evaluate(()=>window.__directResult().source)).toBe(false);
});
