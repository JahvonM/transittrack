import { saveDriverGrant } from "@/lib/deviceAuth";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Lock, Unlock } from "lucide-react";

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

  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader className="text-center pb-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-2">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <CardTitle>Driver PIN required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          Enter the 4-digit PIN assigned to {vehicle?.name} to begin your shift.
        </p>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
          className="text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={pin.length < 4 || checking}>
          <Unlock className="w-4 h-4 mr-2" /> Unlock
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Forgot PIN?</Button>
        {forgot && <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          <p className="text-sm">Your administrator can set a new PIN for {vehicle?.name || "this bus"}. Your current PIN cannot be displayed.</p>
          {requested ? <p role="status" className="text-sm text-primary">Reset request sent. Contact your administrator and wait for a new PIN, then enter it above.</p>
            : <Button variant="outline" className="w-full" onClick={requestReset} disabled={requesting}>{requesting ? "Sending…" : "Request admin reset"}</Button>}
          {resetError && <p role="alert" className="text-sm text-destructive">{resetError}</p>}
        </div>}
      </CardContent>
    </Card>
  );
}