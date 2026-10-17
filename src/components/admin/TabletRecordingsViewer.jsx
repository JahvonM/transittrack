import React, {useEffect, useRef, useState} from "react";
import {base44} from "@/api/base44Client";
import {Button} from "@/components/ui/button";
import {createRecordingViewer} from "@/lib/directRecordingViewer";
import {recordingDateRange, MAX_RECORDING_BYTES} from "@/lib/recordingTransfer";
import {errorData} from "@/lib/requestError";
const terminal = state => ["ended", "failed", "expired"].includes(state);
async function invoke(operation, extra = {}) {
 const r = await base44.functions.invoke("tabletRecordings", {operation, ...extra});
 if (r.data?.error) throw new Error(r.data.error);
 return r.data;
}
export default function TabletRecordingsViewer({device}) {
 const [session, setSession] = useState(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
 const [error, setError] = useState(""), [clips, setClips] = useState([]), [next, setNext] = useState(-1), [date, setDate] = useState("");
 const [progress, setProgress] = useState(null), [playing, setPlaying] = useState(null);
 const alive = useRef(false), epoch = useRef(0), current = useRef(null), peer = useRef(null), connecting = useRef(false), blobUrl = useRef(null), video = useRef(null);
 const clearVideo = () => {if (video.current) {video.current.pause(); video.current.removeAttribute("src"); video.current.load();} if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); blobUrl.current = null;};
 const clear = () => {peer.current?.close(); peer.current = null; clearVideo();};
 const end = async () => {
  const s = current.current; current.current = null; epoch.current++; connecting.current = false; clear();
  setSession(null); setReady(false); setPlaying(null); setClips([]); setNext(-1); setProgress(null); setBusy(false);
  if (s) try {await invoke("end", {session_id: s.id});} catch {if(alive.current) setError("Closed here. Tablet authorization expires automatically if shutdown cannot be confirmed.");}
 };
 useEffect(() => {
  alive.current = true;
  return () => {alive.current = false; epoch.current++; clear(); const s = current.current; current.current = null; if (s) void invoke("end", {session_id: s.id}).catch(() => {});};
 }, []);
 const request = async () => {
  setError(""); setBusy(true); const generation = ++epoch.current;
  try {
   const r = await invoke("request", {device_id: device.id});
   if (!alive.current || generation !== epoch.current) {void invoke("end", {session_id: r.session.id}).catch(() => {}); return;}
   current.current = r.session; setSession(r.session);
  } catch(e) {if(alive.current && generation === epoch.current) setError(errorData(e).error || e.message || "Could not connect to recordings.");}
  finally {if(alive.current && generation === epoch.current) setBusy(false);}
 };
 useEffect(() => {
  if (!session?.id) return undefined;
  let cancelled = false, timer, polling = false;
  const generation = epoch.current, stale = () => cancelled || !alive.current || generation !== epoch.current;
  const lost = message => {if (!stale()) {setError(message || "Connection lost. Reconnect to retry."); void end();}};
  const tick = async () => {
   if (stale() || polling) return;
   polling = true;
   try {
    const r = await invoke("status", {session_id: session.id}); if (stale()) return;
    if (terminal(r.session.state) || Date.parse(r.session.expires_at) <= Date.now()) {lost("Recordings session ended. Reconnect if needed."); return;}
    if (r.offer_ready && !peer.current && !connecting.current) {
     connecting.current = true;
     try {
      const auth = await invoke("viewer", {session_id: session.id}); if (stale()) return;
      const connection = createRecordingViewer({isCancelled: stale, onReady: () => {if (!stale()) setReady(true);}, onEnded: lost,
       onProgress: (received, total) => {if (!stale()) setProgress({received, total});}});
      peer.current = connection;
      await connection.connect(auth, sdp => invoke("answer", {session_id: session.id, sdp}));
      if (stale()) connection.close();
     } finally {connecting.current = false;}
    }
   } catch {lost("Could not reach this tablet. Keep the kiosk open and online, then reconnect."); return;}
   finally {polling = false;}
   if (!stale()) timer = setTimeout(tick, 5000);
  };
  void tick();
  return () => {cancelled = true; clearTimeout(timer);};
 }, [session?.id]);
 const load = async (offset = 0) => {
  if (!peer.current) return;
  const generation = epoch.current; setBusy(true); setError("");
  try {
   const r = await peer.current.list({...recordingDateRange(date), offset});
   if (!alive.current || generation !== epoch.current) return;
   setClips(old => offset ? [...old, ...r.clips] : r.clips); setNext(r.next);
  } catch(e) {if(alive.current && generation === epoch.current) {setError(e.message); void end();}}
  finally {if(alive.current && generation === epoch.current) setBusy(false);}
 };
 useEffect(() => {if (ready) void load();}, [ready, date]);
 const play = async clip => {
  if (!peer.current || busy) return;
  const generation = epoch.current; setBusy(true); setError(""); setProgress({received: 0, total: clip.bytes}); clearVideo(); setPlaying(null);
  try {
   const result = await peer.current.get(clip.name);
   if (!alive.current || generation !== epoch.current) return;
   const url = URL.createObjectURL(result.blob); blobUrl.current = url;
   setPlaying({url, name: result.name, at: clip.at});
   setClips(old => old.map(c => c.name === clip.name ? {...c, name: result.name, protected: true} : c));
  } catch(e) {if(alive.current && generation === epoch.current) {setError(e.message); void end();}}
  finally {if(alive.current && generation === epoch.current) {setBusy(false); setProgress(null);}}
 };
 const available = device.helper_health?.recordings_available === true && device.paired && device.status === "active";
 return <section className="rounded-xl border p-3 space-y-3" aria-label="Saved tablet recordings">
  <h3 className="font-semibold">Saved recordings</h3>
  <p className="text-sm text-muted-foreground">Rear-camera videos stored on this tablet. Admin access only. The kiosk must be open and online. Selected videos are protected from automatic deletion.</p>
  {!available && <p className="text-sm">Install the recordings kiosk update, then wait for a fresh tablet check-in.</p>}
  {!session ? <Button variant="outline" disabled={busy || !available} onClick={request}>{busy ? "Requesting…" : "Browse recordings"}</Button> : <>
   <div className="flex items-center justify-between gap-2"><p role="status" className="text-sm">{ready ? "Connected to tablet" : "Waiting for tablet connection…"}</p><Button variant="outline" onClick={() => void end()}>Disconnect</Button></div>
   <p className="text-xs text-muted-foreground">Session ends by {new Date(session.expires_at).toLocaleTimeString()}. Videos show the time reported by the tablet.</p>
   {ready && <>
    <label className="block text-sm">Recording date <input aria-label="Recording date" type="date" value={date} disabled={busy} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-2" /></label>
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Refresh videos</Button>{date && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDate("")}>All dates</Button>}</div>
    {progress && <div role="status" className="space-y-1"><p className="text-sm">Receiving video… {Math.round(progress.received / Math.max(1, progress.total) * 100)}%</p><progress aria-label="Video transfer" value={progress.received} max={Math.max(1, progress.total)} className="w-full" /><p className="text-xs">Playback opens after the complete video is verified.</p></div>}
    {playing && <div className="space-y-2"><p className="text-sm font-medium">{new Date(playing.at).toLocaleString()}</p><video ref={video} src={playing.url} controls playsInline preload="metadata" aria-label="Saved rear-camera video" className="w-full rounded-lg bg-black max-h-[55dvh]" onError={() => setError("This clip could not be played here. Save a copy and try another video player.")} /><a href={playing.url} download={playing.name} className="text-sm underline">Save a copy</a></div>}
    {!busy && !clips.length && <p role="status" className="text-sm">No completed videos{date ? " for this date" : " yet"}. The current recording appears when its clip finishes.</p>}
    <div className="max-h-80 overflow-y-auto space-y-2">{clips.map(c => <div key={c.name} className="rounded-lg border p-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{new Date(c.at).toLocaleString()}</p><p className="text-xs text-muted-foreground">{(c.bytes / 1048576).toFixed(1)} MB · {c.protected ? "Protected" : "Loop video"}{c.incomplete ? " · Interrupted; may not play" : ""}</p></div><Button size="sm" variant="outline" disabled={busy || c.bytes < 1 || c.bytes > MAX_RECORDING_BYTES} onClick={() => void play(c)}>Play</Button></div>)}</div>
    {next >= 0 && <Button variant="outline" disabled={busy} onClick={() => void load(next)}>Load older videos</Button>}
   </>}
  </>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
