import {describe,it,expect,vi} from "vitest";
import {createSupportViewer} from "../directTabletViewer";
const sdp="v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\na=candidate:test\r\n";
function fixture(options={}) {
 let peer;const transceiver={direction:"sendrecv"};
 class Peer {
  constructor(){peer=this;this.iceGatheringState="complete";this.connectionState="new";}
  setConfiguration(c){this.config=c}
  async setRemoteDescription(d){this.remote=d;if(options.remote)await options.remote();}
  getTransceivers(){return [transceiver]}
  async createAnswer(){return {type:"answer",sdp:sdp.replace("sendonly","recvonly")}}
  async setLocalDescription(d){this.localDescription=d}
  close(){this.closed=true}
 }
 const video={srcObject:null,play:async()=>{}};
 const onEnded=vi.fn();
 const viewer=createSupportViewer({video,Peer,onEnded,isCancelled:options.isCancelled});
 return {viewer,video,onEnded,peer,transceiver};
}
describe("direct tablet video receiver",()=>{
 it("answers receive-only without creating sender tracks or requesting permissions",async()=>{
  const f=fixture(),send=vi.fn();
  await f.viewer.connect({iceServers:[],sdp},send);
  expect(f.transceiver.direction).toBe("recvonly");
  expect(send).toHaveBeenCalledWith(sdp.replace("sendonly","recvonly"));
  f.viewer.close();expect(f.peer.closed).toBe(true);
 });
 it("rejects audio, data and zero-address offers before answering",async()=>{
  for(const offer of [sdp+"m=audio 9 RTP/SAVPF 111\r\n",sdp+"m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n",sdp.replace("a=candidate:test\r\n","")]) {
   const f=fixture(),send=vi.fn();
   await expect(f.viewer.connect({iceServers:[],sdp:offer},send)).rejects.toThrow();
   expect(send).not.toHaveBeenCalled();f.viewer.close();
  }
 });
 it("stops on disconnection and clears the video",()=>{
  const f=fixture();f.peer.connectionState="disconnected";f.peer.onconnectionstatechange();
  expect(f.peer.closed).toBe(true);expect(f.video.srcObject).toBeNull();expect(f.onEnded).toHaveBeenCalledOnce();
 });
 it("cannot finish connecting after the viewer closes",async()=>{
  let release;const blocked=new Promise(r=>{release=r});
  const f=fixture({remote:()=>blocked}),send=vi.fn();
  const promise=f.viewer.connect({iceServers:[],sdp},send);
  f.viewer.close();release();
  await expect(promise).rejects.toThrow("cancelled");expect(send).not.toHaveBeenCalled();
 });
 it("rejects callbacks after session cancellation",async()=>{
  const f=fixture({isCancelled:()=>true});
  await expect(f.viewer.connect({iceServers:[],sdp},vi.fn())).rejects.toThrow("cancelled");
  f.viewer.close();
 });
});
