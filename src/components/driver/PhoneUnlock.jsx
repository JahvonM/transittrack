import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, X } from "lucide-react";
import { saveDriverGrant } from "@/lib/deviceAuth";
import { errorData, httpStatus } from "@/lib/requestError";

const POLL_MS = 2500;
// The link the phone opens: the driver app's Start screen with the code in.
export const phoneStartUrl = (code, origin = window.location.origin) => `${origin}/driver-phone/start?code=${encodeURIComponent(code)}`;
const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * "Start with the driver app" on the locked bus tablet. Shows a QR and a
 * typed code for two minutes; the driver scans it with the phone app, which
 * starts their shift, and this tablet collects the same driver pass a correct
 * PIN gives. Needs a connection. The PIN pad below stays as the backup.
 */
export default function PhoneUnlock({ deviceId, vehicle, invoke, onUnlock, onOpenChange }) {
  const [state, setState] = useState({ step: "idle" });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const unlockRef = useRef(onUnlock);
  unlockRef.current = onUnlock;
  useEffect(() => { onOpenChange?.(state.step === "showing"); }, [state.step, onOpenChange]);

  const start = async () => {
    setState({ step: "asking" });
    try {
      const res = await invoke("phone_unlock_code");
      const qr = await QRCode.toDataURL(phoneStartUrl(res.code), { width: 480, margin: 1 });
      if (alive.current) setState({ step: "showing", id: res.unlock_id, code: res.code, expiresAt: Date.parse(res.expires_at), qr });
    } catch (e) {
      const status = httpStatus(e);
      const message = status === 429 ? errorData(e).error || "Too many codes asked for. Use the PIN."
        : status ? errorData(e).error || "Couldn't start. Use the PIN."
        : "This needs internet. Use the PIN instead.";
      if (alive.current) setState({ step: "idle", error: message });
    }
  };

  // While the code is up, ask every few seconds whether a phone claimed it.
  useEffect(() => {
    if (state.step !== "showing") return undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() > state.expiresAt + POLL_MS) { setState({ step: "idle", error: "That code ran out. Tap to show a new one." }); return; }
      try {
        const res = await invoke("phone_unlock_status", { unlock_id: state.id });
        if (stopped) return;
        if (res.status === "unlocked" && res.driver_grant) {
          try { saveDriverGrant(deviceId, res.driver_grant); }
          catch { setState({ step: "idle", error: "This tablet couldn't save the driver pass (storage is full). Use the PIN." }); return; }
          stopped = true;
          setState({ step: "done", name: res.driver_name });
          unlockRef.current({ via: "phone", driverName: res.driver_name });
          return;
        }
        if (res.status === "expired") { setState({ step: "idle", error: "That code ran out. Tap to show a new one." }); return; }
      } catch { /* a missed check on a weak signal; try again */ }
      timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [state.step, state.id, state.expiresAt, deviceId, invoke]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state.step !== "showing") return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.step]);

  if (state.step === "showing") {
    const left = Math.max(0, Math.round((state.expiresAt - now) / 1000));
    return (
      <section className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-5 text-center" aria-labelledby="tt-phone-unlock-title">
        <h2 id="tt-phone-unlock-title" className="flex items-center justify-center gap-2 text-title font-bold">
          <Smartphone className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Scan with the driver app
        </h2>
        <p className="mt-1 text-body-sm text-muted-foreground">On your phone: Today → Start shift → Scan the tablet.</p>
        <img src={state.qr} alt={`QR code to start your shift on ${vehicle?.name || "this bus"}`} className="mx-auto mt-4 aspect-square w-full max-w-[min(18rem,40vh)] rounded-xl bg-white p-2" />
        <p className="mt-3 text-body-sm text-muted-foreground">Or type this code</p>
        <p className="font-display text-[2.25rem] font-bold tracking-[0.25em] tabular-nums" aria-label={`Code ${state.code.split("").join(" ")}`}>{spaced(state.code)}</p>
        <p className="mt-1 text-body-sm text-muted-foreground" role="timer">New code in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>
        <button type="button" onClick={() => setState({ step: "idle" })}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-accent">
          <X className="h-5 w-5" aria-hidden="true" /> Use the PIN instead
        </button>
      </section>
    );
  }
  if (state.step === "done") {
    return <p role="status" className="w-full max-w-md mx-auto rounded-2xl bg-success/12 p-4 text-center font-semibold">Unlocked for {state.name || "you"}. Shift started.</p>;
  }
  return (
    <div className="w-full max-w-md mx-auto">
      <button type="button" onClick={start} disabled={state.step === "asking"}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-primary/50 bg-primary/10 px-4 text-left hover:bg-primary/15 disabled:opacity-60">
        <Smartphone className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-title-sm font-bold">{state.step === "asking" ? "Getting a code…" : "Start with the driver app"}</span>
          <span className="block text-body-sm text-muted-foreground">Scan with your phone. No PIN needed.</span>
        </span>
      </button>
      {state.error && <p role="alert" className="mt-2 text-body-sm text-danger">{state.error}</p>}
    </div>
  );
}
