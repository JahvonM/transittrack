import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LockKeyhole, Loader2 } from "lucide-react";

// The server rejects ALL driver-phone actions while a temporary password is set.
// This page never stores passwords, including in app state beyond this form.
export default function DriverPassword() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    base44.functions.invoke("driverAccounts", { action: "status" })
      .then(({ data }) => {
        if (!active) return;
        if (!data?.is_driver) { navigate("/login", { replace: true }); return; }
        if (!data.must_change_password) navigate("/driver-phone", { replace: true });
      })
      .catch(() => { if (active) setError("Unable to check the driver account. Try again."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (next !== confirm) return setError("The new passwords do not match.");
    if (next.length < 12 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/[0-9]/.test(next)) {
      return setError("Use at least 12 characters, with uppercase, lowercase and a number.");
    }
    if (next === current) return setError("Your new password must be different.");
    setSaving(true);
    try {
      const result = await base44.functions.invoke("driverAccounts", {
        action: "change_password", current_password: current, new_password: next,
      });
      if (!result.data?.ok) throw new Error("Password change was not confirmed.");
      setCurrent(""); setNext(""); setConfirm("");
      window.location.replace("/driver-phone");
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold">Secure your driver account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Change the temporary password issued by your administrator before using the driver phone app.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-driver-password">Temporary password</Label>
            <Input id="current-driver-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} minLength={12} required disabled={saving || checking} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-driver-password">New password</Label>
            <Input id="new-driver-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} required disabled={saving || checking} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-driver-password">Confirm new password</Label>
            <Input id="confirm-driver-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} required disabled={saving || checking} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={checking || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {checking ? "Checking account…" : saving ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </section>
    </main>
  );
}
