import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CodeGate({ onUnlock }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    setChecking(true);
    setError("");
    const companies = await base44.entities.Company.list();
    const match = companies.find((c) => (c.access_code || "").toUpperCase() === value);
    setChecking(false);
    if (!match) {
      setError("That code doesn't match any company. Check with your operator.");
      return;
    }
    localStorage.setItem("tt_company_code", match.access_code);
    // Persist which company this account belongs to server-side (not just in
    // localStorage) so RLS-backed features — like the per-bus group chat —
    // can actually scope data by company instead of trusting the client.
    if (user?.id && user.company_id !== match.id) {
      try { await base44.entities.User.update(user.id, { company_id: match.id }); } catch { /* best-effort */ }
    }
    onUnlock(match);
  };

  return (
    <div className="max-w-sm mx-auto mt-10 sm:mt-20">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-2">
            <Bus className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl">Enter your company code</CardTitle>
          <CardDescription>Your operator gave you a code to see their live fleet and arrival times.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB3D9K"
              maxLength={12}
              autoFocus
              className="h-12 text-center text-lg font-semibold tracking-[0.3em]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking || !code.trim()}>
              {checking ? "Checking…" : "View live fleet"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}