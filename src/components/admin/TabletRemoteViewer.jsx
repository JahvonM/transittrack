import { createSupportViewer } from "@/lib/directTabletViewer";
import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
const ended = s => ["ended", "expired", "failed", "denied"].includes(s);
const labels = {screen: "View screen", camera_front: "View front camera", camera_back: "View back camera"};
async function invoke(operation, extra = {}) {
 const r = await base44.functions.invoke("tabletSupport", {operation, ...extra});
 if (r.data?.error) throw new Error(r.data.error);
 return r.data;
}
export default function TabletRemoteViewer({device}) {
 const [relay, setRelay] = useState(false), [enabled, setEnabled] = useState(null), [session, setSession] = useState(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [live, setLive] = useState(false);
 const video = useRef(null), room = useRef(null), sessionRef = useRef(null), alive = useRef(false), connecting = useRef(false), epoch = useRef(0);
 const clearRoom = () => { const r = room.current; room.current = null; r?.close(); if (video.current) video.current.srcObject = null; };
 useEffect(() => {
  alive.current = true;
  invoke("config").then(r => { if (alive.current) {setEnabled(r.enabled === true);setRelay(r.relay_configured === true);} }).catch(() => { if (alive.current) setError("Could not check viewing availability."); });
  return () => { alive.current = false; epoch.current++; clearRoom(); const s = sessionRef.current; sessionRef.current = null; if(s) void invoke("end", {session_id:s.id}).catch(()=>{}); };
 }, []);
 const stop = async () => {
  const s = sessionRef.current;
  epoch.current++; clearRoom(); setLive(false); setBusy(true);
  try { if (s) await invoke("end", {session_id:s.id}); sessionRef.current = null; setSession(null); }
  catch { setError("Viewer closed. Could not confirm tablet shutdown; its authorization check and expiry remain active."); }
  finally { if(alive.current) setBusy(false); }
 };
 const request = async capability => {
  setBusy(true); setError("");
  try {
   const r = await invoke("request", {device_id:device.id, capability});
   if(!alive.current) { await invoke("end", {session_id:r.session.id}); return; }
   sessionRef.current = r.session; setSession(r.session);
  } catch(e) { if(alive.current) setError(e.message || "Could not request viewing."); }
  finally { if(alive.current) setBusy(false); }
 };
 useEffect(() => {
  if (!session?.id) return undefined;
  let cancelled = false, timer, polling = false;
  const generation = epoch.current, isCancelled = () => cancelled || generation !== epoch.current;
  const tick = async () => {
   if(isCancelled() || polling) return;
   polling = true;
   try {
    const result = await invoke("status", {session_id:session.id});
    if(isCancelled()) return;
    const s = result.session; setSession(s);
    if(ended(s.state) || Date.parse(s.expires_at) <= Date.now()) {
     clearRoom(); setLive(false); sessionRef.current = null; return;
    }
    if(result.offer_ready === true && !room.current && !connecting.current) {
     connecting.current = true;
     try {
      const auth = await invoke("viewer", {session_id:s.id});
      if(isCancelled()) return;
      const r = createSupportViewer({video:video.current,isCancelled,onEnded:()=>{
       if(!isCancelled()) { setLive(false);setError("Video connection ended. A relay may be needed on this network.");void invoke("end",{session_id:s.id}).catch(()=>{}); }
      }});
      room.current = r;
      await r.connect(auth, sdp => invoke("answer",{session_id:s.id,sdp}));
      if(isCancelled()) r.close();
     } finally { connecting.current = false; }
    }
   } catch {
    if(!isCancelled()) { clearRoom(); setLive(false); setError("Viewing connection lost. End this session before trying again."); void invoke("end", {session_id:session.id}).catch(()=>{}); return; }
   } finally { polling = false; }
   if(!isCancelled()) timer = setTimeout(tick, 5000);
  };
  void tick();
  return () => { cancelled = true; clearTimeout(timer); clearRoom(); };
 }, [session?.id]);
 const active = session && !ended(session.state);
 return <section className="space-y-3 border rounded-xl p-3" aria-label="Remote tablet viewing">
  <h3 className="font-semibold">Screen & camera</h3>
  <p className="text-sm text-muted-foreground">Admin-only live viewing. Someone at the tablet must approve each session. Video only, no recording; ends after 10 minutes.</p>
  {enabled === false && <p role="status" className="text-sm">Direct remote viewing is not enabled yet.</p>}
  {enabled === true && !relay && <p className="text-sm">Direct connection mode. Some mobile and Wi-Fi networks need a relay before video can connect.</p>}
  {device.helper_health?.support_transport !== "webrtc" && <p className="text-sm">Requires the direct-viewing kiosk update.</p>}
  <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([key,label]) => <Button key={key} variant="outline" disabled={busy || active || enabled !== true || device.helper_health?.support_available !== true || device.helper_health?.support_transport !== "webrtc" || !device.paired} onClick={()=>request(key)}>{label}</Button>)}</div>
  {session && <div className="space-y-2">
   <p role="status">{live ? "Live video" : session.state === "requested" ? "Waiting for tablet to check in" : session.state === "waiting_permission" ? "Waiting for approval on the tablet" : ["connecting","active"].includes(session.state) ? "Connecting video…" : "Session " + session.state}</p>
   {active && <p className="text-xs">Ends by {new Date(session.expires_at).toLocaleTimeString()}</p>}
   <video ref={video} onPlaying={() => { if(room.current && video.current?.readyState >= 2) setLive(true); }} autoPlay playsInline muted aria-label="Tablet live video" className={live ? "w-full max-h-[55dvh] bg-black rounded-lg object-contain" : "hidden"} />
   {active && <Button disabled={busy} variant="destructive" onClick={stop}>Stop viewing</Button>}
  </div>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
