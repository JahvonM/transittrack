import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { Loader2, Mail } from "lucide-react";

// Someone who signed up but never typed the 6-digit code comes back to sign
// in: the sign-in page sends them a new code and they finish here, signed in.
export default function ConfirmEmailCode({ email, onConfirmed, onBack }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode: code });
      if (result?.access_token) await base44.auth.setToken(result.access_token);
      onConfirmed();
    } catch (e) {
      setError(e?.message || "That code didn't work. Check it, or send another one.");
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setNote("");
    try {
      await base44.auth.resendOtp(email);
      setCode("");
      setNote("A new code is on its way. Check your email.");
    } catch (e) {
      setError(e?.message || "Couldn't send a code. Try again in a minute.");
    }
  };

  return (
    <AuthLayout icon={Mail} title="Confirm your email" subtitle={`We sent a 6-digit code to ${email}`}>
      {error && <div role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {note && !error && <div role="status" className="mb-4 rounded-lg bg-secondary p-3 text-sm">{note}</div>}
      <div className="mb-6 flex justify-center">
        <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code" aria-label="6-digit code">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button className="h-12 w-full font-medium" onClick={verify} disabled={busy || code.length < 6}>
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Checking…</> : "Confirm and sign in"}
      </Button>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button type="button" onClick={resend} className="font-medium text-primary hover:underline">Send another code</button>
        <button type="button" onClick={onBack} className="text-muted-foreground hover:underline">Back to sign in</button>
      </div>
    </AuthLayout>
  );
}
