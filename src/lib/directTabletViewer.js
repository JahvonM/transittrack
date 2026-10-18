// One-way WebRTC receiver. No camera/microphone requests, sender tracks or data channels.
export function createSupportViewer({ video, onEnded, isCancelled = () => false, Peer = globalThis.RTCPeerConnection }) {
 if (!Peer) throw new Error("This browser does not support live viewing.");
 const pc = new Peer({iceServers: []});
 let closed = false, timer, pendingReject;
 const assertOpen = () => { if (closed || isCancelled()) throw new Error("Viewing cancelled"); };
 const close = () => {
  if (closed) return;
  closed = true; clearTimeout(timer); pendingReject?.(new Error("Viewing cancelled"));
  pc.ontrack = null; pc.onconnectionstatechange = null; pc.onicegatheringstatechange = null;
  pc.close();
  if(video) { const stream=video.srcObject; video.srcObject=null; stream?.getTracks?.().forEach(t=>t.stop()); }
 };
 pc.ontrack = event => {
  if(closed || isCancelled()) return;
  if(event.track.kind !== "video") { close(); onEnded?.(); return; }
  video.srcObject = new MediaStream([event.track]);
  event.track.onended = () => { if(!closed) { close(); onEnded?.(); } };
  void video.play().catch(()=>{});
 };
 pc.onconnectionstatechange = () => {
  if(!closed && ["disconnected","failed"].includes(pc.connectionState)) {close();onEnded?.();}
 };
 const connect = async (auth, sendAnswer) => {
  assertOpen();
  if(!Array.isArray(auth.iceServers) || auth.iceServers.length>4 || typeof auth.sdp!=="string" || auth.sdp.length>65536)
   throw new Error("Invalid viewing configuration");
  const media=auth.sdp.split(/\r?\n/).filter(l=>l.startsWith("m="));
  if(media.length!==1 || !media[0].startsWith("m=video ") || !auth.sdp.split(/\r?\n/).includes("a=sendonly"))
   throw new Error("Expected video-only sender");
  if(!auth.sdp.includes("a=candidate:")) throw new Error("No tablet connection address. Configure a STUN/TURN server.");
  pc.setConfiguration({iceServers:auth.iceServers});
  await pc.setRemoteDescription({type:"offer",sdp:auth.sdp});assertOpen();
  for(const transceiver of pc.getTransceivers()) transceiver.direction="recvonly";
  await pc.setLocalDescription(await pc.createAnswer());assertOpen();
  if(pc.iceGatheringState!=="complete") await new Promise((resolve,reject)=>{
   pendingReject=reject;
   timer=setTimeout(()=>reject(new Error("Connection discovery timed out")),15000);
   pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete"){clearTimeout(timer);pendingReject=null;resolve();}};
   if(pc.iceGatheringState==="complete"){clearTimeout(timer);pendingReject=null;resolve();}
  });
  assertOpen();
  if(!pc.localDescription?.sdp.includes("a=candidate:")) throw new Error("No viewer connection address. Configure a STUN/TURN server.");
  await sendAnswer(pc.localDescription.sdp);
  assertOpen();
 };
 return {connect,close};
}
