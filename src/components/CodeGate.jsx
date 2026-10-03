import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CodeGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
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