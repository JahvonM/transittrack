import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BoardingCodeForm({ hasCode, saving, onSave, error }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setInvalid(""); setMessage("");
    if (!/^\d{6}$/.test(code)) { setInvalid("Choose exactly six digits."); return; }
    if (code !== confirm) { setInvalid("The two codes don't match."); return; }
    if (await onSave(code)) {
      setCode(""); setConfirm(""); setEditing(false);
      setMessage("Boarding code saved. Your previous code no longer works; your QR stays the same.");
    }
  };
  return (
    <div className="space-y-3 border-t pt-4 text-left">
      <h3 className="font-semibold">My boarding code</h3>
      <p className="text-sm text-muted-foreground">Choose a six-digit code for the bus keypad. It stays valid until you change it.</p>
      {editing || !hasCode ? <form onSubmit={submit} className="space-y-3">
        <Label className="block space-y-1"><span>New boarding code</span><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={saving} required /></Label>
        <Label className="block space-y-1"><span>Confirm boarding code</span><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ""))} disabled={saving} required /></Label>
        {(invalid || error) && <p role="alert" className="text-sm text-destructive">{invalid || error}</p>}
        <div className="flex gap-2"><Button type="submit" loading={saving}>Save code</Button>{hasCode && <Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditing(false); setCode(""); setConfirm(""); }}>Cancel</Button>}</div>
        <p className="text-xs text-muted-foreground">Forgot the old code? Set a new one here while signed in. No old code is needed.</p>
      </form> : <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setEditing(true); setMessage(""); }}>Change code</Button>
        <Button variant="ghost" onClick={() => { setEditing(true); setMessage(""); }}>Forgot code?</Button>
      </div>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
    </div>
  );
}