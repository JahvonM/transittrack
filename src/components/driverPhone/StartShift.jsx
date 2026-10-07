import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, ClipboardCheck, Keyboard, Loader2, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { unlockCodeFrom, UNLOCK_CODE } from "@/lib/driverPhone";

const QrScanner = lazy(() => import("@/components/kiosk/QrScanner"));
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

/**
 * Start shift: the walk-around check, then scan (or type) the code the bus
 * tablet shows after "Start with the driver app". Claiming the code starts
 * the shift and unlocks that tablet for this driver.
 */
export default function StartShift({ today, initialCode, onClaim, onWalkaround, onBack }) {
  const [code, setCode] = useState(() => unlockCodeFrom(initialCode));
  const [mode, setMode] = useState(initialCode ? "confirm" : "scan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const sending = useRef(false);
  const walk = today?.walkaround;

  useEffect(() => { if (initialCode) setCode(unlockCodeFrom(initialCode)); }, [initialCode]);

  const claim = async (value) => {
    const clean = unlockCodeFrom(value);
    if (!UNLOCK_CODE.test(clean)) { setError("That isn't a bus code. It has 6 letters and numbers."); return; }
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try { setDone(await onClaim(clean)); }
    catch (e) { setError(e.message || "That didn't work. Try again."); setMode("type"); setCode(clean); }
    finally { sending.current = false; setBusy(false); }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
        <CircleCheck className="h-14 w-14 text-success" aria-hidden="true" />
        <h1 className="text-headline">{done.resumed ? "Welcome back" : "Shift started"}</h1>
        <p className="text-body text-muted-foreground">{done.bus?.name || "The bus"} tablet is unlocking for you now. Have a safe drive.</p>
        <button type="button" onClick={onBack} className="mt-2 min-h-[52px] w-full rounded-xl bg-primary font-bold text-primary-foreground">Done</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-2 self-start font-semibold text-muted-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Today
      </button>
      <h1 className="text-headline">Start shift</h1>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Step 1, walk-around check">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Step 1</p>
        <div className="mt-1 flex items-center gap-3">
          <ClipboardCheck className={cn("h-6 w-6 shrink-0", walk ? (walk.status === "passed" ? "text-success" : "text-warning") : "text-muted-foreground")} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Walk-around check</p>
            <p className="text-body-sm text-muted-foreground">
              {walk ? `Done at ${time(walk.created_date)}${walk.status === "failed" ? ", problems sent to the mechanic" : ", all good"}` : "Look around the bus before you get in."}
            </p>
          </div>
          {!walk && <button type="button" onClick={onWalkaround} className="min-h-[44px] shrink-0 rounded-xl border border-border px-3 font-semibold hover:bg-accent">Check now</button>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Step 2, scan the bus tablet">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Step 2</p>
        <p className="mt-1 font-semibold">Scan the bus tablet</p>
        <p className="text-body-sm text-muted-foreground">On the tablet, tap <span className="font-semibold text-foreground">Start with the driver app</span>, then point your camera at the code.</p>

        {mode === "confirm" && (
          <div className="mt-3 space-y-3">
            <p className="rounded-xl bg-secondary px-3 py-2 text-center font-display text-title tracking-[0.2em]">{code.slice(0, 3)} {code.slice(3)}</p>
            <button type="button" onClick={() => claim(code)} disabled={busy}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-title-sm font-bold text-primary-foreground disabled:opacity-60">
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} Start my shift
            </button>
          </div>
        )}
        {mode === "scan" && (
          <div className="mt-3 overflow-hidden rounded-xl bg-black">
            <Suspense fallback={<div className="grid aspect-square place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Opening camera" /></div>}>
              <QrScanner active={!busy} onDecode={(text) => claim(text)} />
            </Suspense>
          </div>
        )}
        {mode === "type" && (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); claim(code); }}>
            <label htmlFor="bus-code" className="sr-only">Bus code</label>
            <input id="bus-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }} autoComplete="off" autoCapitalize="characters" maxLength={9} placeholder="ABC 234"
              className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-center font-display text-title tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="submit" disabled={busy} className="min-h-[52px] shrink-0 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Starting" /> : "Start"}
            </button>
          </form>
        )}
        {busy && mode === "scan" && <p role="status" className="mt-2 text-body-sm text-muted-foreground">Starting your shift…</p>}
        {error && <p role="alert" className="mt-2 text-body-sm text-danger">{error}</p>}
        {mode !== "confirm" && (
          <button type="button" onClick={() => { setMode(mode === "scan" ? "type" : "scan"); setError(""); }}
            className="mt-3 flex min-h-[44px] items-center gap-2 font-semibold text-muted-foreground">
            {mode === "scan" ? <><Keyboard className="h-4 w-4" aria-hidden="true" /> Can't scan? Type the code</> : <><ScanLine className="h-4 w-4" aria-hidden="true" /> Scan instead</>}
          </button>
        )}
      </section>
      <p className="px-1 text-body-sm text-muted-foreground">No signal or phone trouble? The bus PIN still works on the tablet.</p>
    </div>
  );
}
