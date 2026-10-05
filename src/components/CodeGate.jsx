import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// initialCode comes from a company's join QR; it is checked straight away,
// exactly as if the passenger had typed it.
export default function CodeGate({ onUnlock, initialCode = "" }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e, override) => {
    e?.preventDefault();
    const value = (override ?? code).trim().toUpperCase();
    if (!value) return;
    setChecking(true);
    setError("");
    try {
      const response = await base44.functions.invoke("companyAccess", { action: "verify", code: value });
      const { company, grant } = response.data;
      localStorage.removeItem("tt_company_code");
      localStorage.setItem("tt_company_access_grant", grant);
      onUnlock(company);
    } catch (e) {
      setError(e?.response?.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Could not verify. Check your code and connection.");
    } finally { setChecking(false); }
  };

  const autoTried = useRef(false);
  useEffect(() => {
    if (!initialCode || autoTried.current) return;
    autoTried.current = true;
    submit(null, initialCode);
    // Runs once for the QR code it was given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

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