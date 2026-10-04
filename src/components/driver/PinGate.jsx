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
  const navigate = useNavigate();

  const submit = async () => {
    if (checking) return;
    if (pin === REVIEWER_PIN) { navigate("/reviewer-sandbox"); return; }
    setChecking(true);
    try {
      const result = await invoke("verify_pin", { pin });
      if (result?.ok !== true) throw new Error("PIN verification failed");
      saveDriverGrant(deviceId, result.driver_grant);
      onUnlock();
    } catch {
      setError("Could not unlock. Check your PIN and connection, or contact your administrator.");
      setPin("");
    } finally { setChecking(false); }
  };

  // On-screen keypad for touch tablets; it only types into the same field.
  const press = (d) => { setError(""); setPin((p) => (p.length < 4 ? p + d : p)); };
  const back = () => { setError(""); setPin((p) => p.slice(0, -1)); };
  const key = "h-14 rounded-xl border border-border bg-background font-display text-headline font-semibold tabular-nums transition-colors hover:bg-accent active:scale-[0.97] disabled:opacity-50";

  return (
    <section className="w-full max-w-sm mx-auto rounded-2xl border border-border bg-card p-6" aria-labelledby="tt-pin-title">
      <h2 id="tt-pin-title" className="flex items-center gap-2 text-title font-bold">
        <Lock className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Driver PIN required
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">Enter the 4-digit PIN for {vehicle?.name || "this bus"} to begin your shift.</p>
      <label htmlFor="tt-driver-pin" className="sr-only">Driver PIN</label>
      <Input
        id="tt-driver-pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
        className="mt-4 h-14 text-center font-display text-3xl tracking-[0.6em]"
      />
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={checking}>{d}</button>
        ))}
        <button type="button" className={`${key} text-body font-semibold`} onClick={() => { setPin(""); setError(""); }} disabled={checking || !pin}>Clear</button>
        <button type="button" className={key} onClick={() => press("0")} disabled={checking}>0</button>
        <button type="button" className={`${key} grid place-items-center`} onClick={back} disabled={checking || !pin} aria-label="Delete last digit">
          <Delete className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-3 text-body-sm text-danger" role="alert">{error}</p>}
      <Button size="lg" className="mt-4 w-full" onClick={submit} disabled={pin.length < 4 || checking} loading={checking}>
        <Unlock className="w-5 h-5" aria-hidden="true" /> Unlock
      </Button>
    </section>
  );
}
