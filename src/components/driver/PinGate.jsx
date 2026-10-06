import { saveDriverGrant } from "@/lib/deviceAuth";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Delete, Lock, Unlock } from "lucide-react";

const REVIEWER_PIN = "9999";

export default function PinGate({ vehicle, deviceId, invoke, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [resetError, setResetError] = useState("");
  const requestReset = async () => {
    setRequesting(true); setResetError("");
    try {
      const result = await invoke("request_pin_reset");
      if (result?.ok !== true) throw new Error("Request was not confirmed");
      setRequested(true);
    } catch (e) { setResetError(e?.response?.data?.error || e.message || "Could not send request. Contact your administrator."); }
    finally { setRequesting(false); }
  };
  const navigate = useNavigate();

  const submit = async (value = pin) => {
    if (checking) return;
    if (value === REVIEWER_PIN) { navigate("/reviewer-sandbox"); return; }
    setChecking(true);
    try {
      const result = await invoke("verify_pin", { pin: value });
      if (result?.ok !== true) throw new Error("PIN verification failed");
      saveDriverGrant(deviceId, result.driver_grant);
      onUnlock();
    } catch (e) {
      // Say what actually went wrong — a locked-out or offline tablet is not a
      // wrong PIN, and drivers were reading all three as one.
      const status = e?.response?.status;
      const serverMessage = e?.response?.data?.error;
      if (status === 429) setError(serverMessage || "Too many PIN tries. Wait 15 minutes and try again.");
      else if (status === 403) setError(serverMessage || "That PIN is not right for this bus. Check the PIN, or ask your administrator.");
      else if (status === 401) setError("This tablet is no longer paired to a bus. Ask your administrator to pair it again.");
      else setError("No connection. Check the tablet's Wi-Fi, then try again.");
      setPin("");
    } finally { setChecking(false); }
  };

  // The driver's own keypad: big keys that work with gloves, and the tablet's
  // keyboard never pops up. Entering the 4th digit on the keypad unlocks
  // straight away; a hardware keyboard still types into the field.
  const press = (d) => {
    if (checking || pin.length >= 4) return;
    setError("");
    const next = pin + d;
    setPin(next);
    if (next.length === 4) submit(next);
  };
  const back = () => { setError(""); setPin((p) => p.slice(0, -1)); };
  // Keys scale with the screen height so the whole gate always fits one
  // screen — a 10.1" tablet in portrait never scrolls to reach Unlock.
  const key = "h-[clamp(3.5rem,7.5vh,5.5rem)] rounded-2xl border border-border bg-background font-display text-[2rem] font-semibold tabular-nums transition-colors hover:bg-accent active:scale-[0.97] active:bg-accent disabled:opacity-50";

  return (
    <section className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="tt-pin-title">
      <h2 id="tt-pin-title" className="flex items-center gap-2 text-title font-bold">
        <Lock className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Driver PIN required
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">Enter the 4-digit PIN for {vehicle?.name || "this bus"} to begin your shift.</p>
      <label htmlFor="tt-driver-pin" className="sr-only">Driver PIN</label>
      <Input
        id="tt-driver-pin"
        type="password"
        inputMode="none"
        autoComplete="off"
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
        className="mt-3 h-14 text-center font-display text-4xl tracking-[0.6em]"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={checking}>{d}</button>
        ))}
        <button type="button" className={`${key} !text-title font-semibold`} onClick={() => { setPin(""); setError(""); }} disabled={checking || !pin}>Clear</button>
        <button type="button" className={key} onClick={() => press("0")} disabled={checking}>0</button>
        <button type="button" className={`${key} grid place-items-center`} onClick={back} disabled={checking || !pin} aria-label="Delete last digit">
          <Delete className="w-8 h-8" aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-3 text-body-sm text-danger" role="alert">{error}</p>}
      <Button size="lg" className="mt-3 h-14 w-full text-body" onClick={() => submit()} disabled={pin.length < 4 || checking} loading={checking}>
        <Unlock className="w-5 h-5" aria-hidden="true" /> Unlock
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Forgot PIN?</Button>
      {forgot && (
        <div className="mt-2 space-y-3 rounded-xl border border-border bg-secondary/50 p-3">
          <p className="text-body-sm">Your administrator can set a new PIN for {vehicle?.name || "this bus"}. Your current PIN cannot be displayed.</p>
          {requested
            ? <p role="status" className="text-body-sm font-semibold">Reset request sent. Contact your administrator and wait for a new PIN, then enter it above.</p>
            : <Button variant="outline" className="w-full" onClick={requestReset} disabled={requesting}>{requesting ? "Sending…" : "Request admin reset"}</Button>}
          {resetError && <p role="alert" className="text-body-sm text-danger">{resetError}</p>}
        </div>
      )}
    </section>
  );
}