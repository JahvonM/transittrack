import React, { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Eye, KeyRound, Lock, MessageSquare, Plus, QrCode, RotateCcw, Tablet, Unplug, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { pairLink } from "@/lib/signupKiosk";

// Admin → Sign-up day → Sign-up iPads: connect iPads by QR, watch what each
// one is typing as it is typed, and choose what they show (functions signupKiosk).

const STEP = { welcome: "Waiting for someone", details: "Typing their details", codes: "Looking at their codes", pickup: "Choosing a pickup spot", done: "Finished" };
const SCREEN = { company_code: "Company code", join_qr: "Join QR", message: "Message", lock: "Locked" };
const REFRESH_MS = 2000;
const errorText = (e, fallback) => e?.response?.data?.error || e?.message || fallback;

function PairQr({ code, expiresAt, onClose }) {
  const [png, setPng] = useState("");
  const link = pairLink(window.location.origin, code);
  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 1 }).then(setPng).catch(() => setPng("")); }, [link]);
  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">Scan this with the iPad's camera</p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the QR"><X className="h-4 w-4" /></Button>
      </div>
      {png ? <img src={png} alt="QR to connect a sign-up iPad" className="h-56 w-56 rounded-lg bg-white p-2" /> : <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" />}
      <p className="text-body-sm text-muted-foreground">It opens the sign-up screen and connects by itself. Or open <b>{window.location.origin}/kiosk/signup</b> on the iPad and scan it there. Works until {new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
    </div>
  );
}

function KioskCard({ kiosk, onScreen, onRemove }) {
  const [message, setMessage] = useState("");
  const draft = kiosk.live?.draft || {};
  const typed = [["Name", draft.name], ["Email", draft.email], ["Phone", draft.phone], ["Staff number", draft.employee_id], ["Pickup spot", draft.pickup_name]].filter(([, v]) => v);
  const showing = SCREEN[kiosk.screen?.kind];
  const busy = !kiosk.paired;
  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tablet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="font-semibold">{kiosk.label}</p>
        <span className={`rounded-full px-2 py-0.5 text-caption ${kiosk.online ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>{!kiosk.paired ? "Waiting to connect" : kiosk.online ? "Online" : "Offline"}</span>
        {showing && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-caption text-warning">Showing: {showing}</span>}
      </div>
      {kiosk.paired && (
        <div className="rounded-lg bg-secondary/60 p-2.5" aria-live="polite">
          <p className="flex items-center gap-1.5 text-body-sm font-medium"><Eye className="h-4 w-4" aria-hidden="true" />{STEP[kiosk.live?.step] || "Waiting for someone"}</p>
          {typed.length > 0 && <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-body-sm">{typed.map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></React.Fragment>)}</dl>}
        </div>
      )}
      {kiosk.paired && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onScreen(kiosk, { kind: "company_code" })}><KeyRound className="h-4 w-4" aria-hidden="true" /> Show company code</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onScreen(kiosk, { kind: "join_qr" })}><QrCode className="h-4 w-4" aria-hidden="true" /> Show join QR</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onScreen(kiosk, { kind: "lock" })}><Lock className="h-4 w-4" aria-hidden="true" /> Lock</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onScreen(kiosk, { kind: "start" })}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Back to start</Button>
          {showing && <Button size="sm" disabled={busy} onClick={() => onScreen(kiosk, { kind: "none" })}><X className="h-4 w-4" aria-hidden="true" /> Clear the screen</Button>}
        </div>
      )}
      {kiosk.paired && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (message.trim()) { onScreen(kiosk, { kind: "message", text: message.trim() }); setMessage(""); } }}>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message for this iPad, e.g. Please see the desk" aria-label={`Message for ${kiosk.label}`} />
          <Button type="submit" size="sm" variant="outline" disabled={!message.trim()}><MessageSquare className="h-4 w-4" aria-hidden="true" /> Show</Button>
        </form>
      )}
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => onRemove(kiosk)}><Unplug className="h-4 w-4" aria-hidden="true" /> Disconnect</Button>
    </li>
  );
}

export default function SignupKioskPanel({ hotelId }) {
  const [kiosks, setKiosks] = useState(null);
  const [pairing, setPairing] = useState(null);
  const call = useCallback(async (action, extra = {}) => (await base44.functions.invoke("signupKiosk", { action, ...extra })).data, []);
  const load = useCallback(async () => {
    try { setKiosks((await call("list", { company_id: hotelId })).kiosks || []); } catch { /* keep the last list */ }
  }, [call, hotelId]);
  useEffect(() => {
    setKiosks(null); load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const add = async () => {
    try { const data = await call("pair_start", { company_id: hotelId }); setPairing(data); load(); }
    catch (e) { toast({ title: "Couldn't add an iPad", description: errorText(e, "Try again."), variant: "destructive" }); }
  };
  const onScreen = async (kiosk, screen) => {
    try { await call("screen", { device_id: kiosk.id, screen }); load(); }
    catch (e) { toast({ title: "Couldn't change that iPad's screen", description: errorText(e, "Try again."), variant: "destructive" }); }
  };
  const all = async (screen) => { for (const k of (kiosks || []).filter((k) => k.paired)) await onScreen(k, screen); };
  const onRemove = async (kiosk) => {
    if (!(await confirmAction({ title: `Disconnect ${kiosk.label}?`, description: "It stops working until you connect it again with a new QR.", confirmLabel: "Disconnect" }))) return;
    try { await call("remove", { device_id: kiosk.id }); load(); } catch (e) { toast({ title: "Couldn't disconnect it", description: errorText(e, "Try again."), variant: "destructive" }); }
  };
  const paired = (kiosks || []).filter((k) => k.paired);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-3" aria-label="Sign-up iPads">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-title-sm font-bold">Sign-up iPads</h2>
        {paired.length > 1 && (
          <>
            <Button size="sm" variant="outline" onClick={() => all({ kind: "company_code" })}>All: company code</Button>
            <Button size="sm" variant="outline" onClick={() => all({ kind: "none" })}>All: clear</Button>
          </>
        )}
        <Button size="sm" onClick={add}><Plus className="h-4 w-4" aria-hidden="true" /> Add an iPad</Button>
      </div>
      {pairing && <PairQr code={pairing.pairing_code} expiresAt={pairing.expires_at} onClose={() => setPairing(null)} />}
      {kiosks === null ? <p className="text-body-sm text-muted-foreground">Loading…</p>
        : kiosks.length === 0 ? <p className="text-body-sm text-muted-foreground">No iPads yet. Add one, and staff can sign themselves up on it. What they type shows here as they type.</p>
        : <ul className="grid gap-3 lg:grid-cols-2">{kiosks.map((k) => <KioskCard key={k.id} kiosk={k} onScreen={onScreen} onRemove={onRemove} />)}</ul>}
    </section>
  );
}
