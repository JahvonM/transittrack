import React, { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Sign in with the personal code a sign-up day iPad showed (like K7QM-4P2X).
// It works once; their company and pickup spot come with it.
export default function KioskCodeSignIn({ onSignedIn }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return (
    <Button type="button" variant="ghost" className="w-full h-12 text-sm font-medium" onClick={() => setOpen(true)}>
      <KeyRound className="w-4 h-4 mr-2" aria-hidden="true" /> I have a code from the sign-up iPad
    </Button>
  );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await base44.auth.signInWithKioskCode(code); onSignedIn(); }
    catch (err) { setError(err?.response?.data?.error || "That code didn't work. Check it, or sign in with your email."); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border p-3">
      <Label htmlFor="kiosk-code">Code from the sign-up iPad</Label>
      <Input id="kiosk-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7QM-4P2X"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="one-time-code" className="h-12 font-mono tracking-widest" required />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full h-12" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 8}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null} Sign in with this code
      </Button>
    </form>
  );
}
