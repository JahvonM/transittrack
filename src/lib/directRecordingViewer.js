import {createRecordingReceiver} from "./recordingTransfer";
export function createRecordingViewer({onReady, onEnded, onProgress, isCancelled = () => false, Peer = globalThis.RTCPeerConnection}) {
 if (!Peer) throw new Error("Use a browser that supports WebRTC to view recordings.");
 const pc = new Peer({iceServers: []});
 let closed = false, channel, timer, rejectGather, received = Promise.resolve(), queued = 0;
 const assertOpen = () => { if (closed || isCancelled()) throw new Error("Recordings connection closed."); };
 const receiver = createRecordingReceiver({send: text => {assertOpen(); if (channel?.readyState !== "open") throw new Error("Not connected"); channel.send(text);}, onProgress});
 const close = () => {
  if (closed) return;
  closed = true; clearTimeout(timer); rejectGather?.(new Error("Connection closed.")); receiver.close();
  pc.ondatachannel = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.onicegatheringstatechange = null;
  if (channel) {channel.onmessage = null; channel.onclose = null; channel.onerror = null; channel.onopen = null; channel.close();}
  pc.close();
 };
 const lost = message => { if (!closed) {close(); onEnded?.(message || "Connection ended. Reconnect to the tablet.");} };
 pc.ontrack = () => lost("Unexpected media capture was refused.");
 pc.onconnectionstatechange = () => {if (["disconnected", "failed", "closed"].includes(pc.connectionState)) lost();};
 pc.ondatachannel = event => {
  if (closed) {event.channel.close(); return;}
  if (channel || event.channel.label !== "tt-recordings-v1" || !event.channel.ordered) {event.channel.close(); lost("Unexpected recording channel."); return;}
  channel = event.channel; channel.binaryType = "arraybuffer";
  channel.onopen = () => {if (!closed && !isCancelled()) onReady?.();};
  channel.onclose = () => lost(); channel.onerror = () => lost();
  channel.onmessage = e => {
   const size = typeof e.data === "string" ? e.data.length : e.data?.byteLength;
   if (!Number.isInteger(size) || size > (typeof e.data === "string" ? 24000 : 16384) || queued + size > 34 * 1024 * 1024) {lost("Recording channel exceeded its transfer limit."); return;}
   queued += size;
   received = received.then(() => receiver.receive(e.data)).catch(() => lost("Video transfer was interrupted or invalid. Reconnect to retry.")).finally(() => {queued -= size;});
  };
 };
 const connect = async (auth, sendAnswer) => {
  assertOpen();
  const media = typeof auth.sdp === "string" ? auth.sdp.split(/\r?\n/).filter(l => l.startsWith("m=")) : [];
  if (auth.sdp?.length > 65536 || media.length !== 1 || !/^m=application [1-9][0-9]* UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0]) || !Array.isArray(auth.iceServers) || auth.iceServers.length > 4 || !auth.sdp.includes("a=candidate:")) throw new Error("Invalid tablet recording connection.");
  pc.setConfiguration({iceServers: auth.iceServers});
  await pc.setRemoteDescription({type: "offer", sdp: auth.sdp}); assertOpen();
  await pc.setLocalDescription(await pc.createAnswer()); assertOpen();
  if (pc.iceGatheringState !== "complete") await new Promise((resolve, reject) => {
   rejectGather = reject; timer = setTimeout(() => reject(new Error("Connection discovery timed out.")), 20000);
   pc.onicegatheringstatechange = () => {if (pc.iceGatheringState === "complete") {clearTimeout(timer); rejectGather = null; resolve();}};
   if (pc.iceGatheringState === "complete") {clearTimeout(timer); rejectGather = null; resolve();}
  });
  assertOpen();
  if (!pc.localDescription?.sdp.includes("a=candidate:")) throw new Error("No admin connection address.");
  await sendAnswer(pc.localDescription.sdp); assertOpen();
 };
 return {connect, close, list: receiver.list, get: receiver.get};
}
