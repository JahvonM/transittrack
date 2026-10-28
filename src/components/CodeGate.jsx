import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanCompanyQrButton, ScanCompanyQrDialog } from "@/components/ScanCompanyQr";
import { clearCompanyLeft } from "@/lib/companyJoin";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { useAuth } from "@/lib/AuthContext";
import { errorData, httpStatus } from "@/lib/requestError";
import { reportError } from "@/lib/reportError";

// A company code is 12 letters and numbers. People copy it with spaces or
// dashes, so only the letters and numbers count.
export const cleanCompanyCode = (value) => String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// What went wrong, in words the passenger can act on. Anything unexpected is
// also noted in Admin → App errors, so it can be looked into.
export function companyCodeProblem(error) {
  const status = httpStatus(error), data = errorData(error);
  if (status === 429) return "Too many attempts. Try again in 15 minutes.";
  if (status === 403 && data.code === "PASSENGER_ROLE_REQUIRED") return "This account can't join a company here. Sign in with your passenger account.";
  if (status === 403) return "That code isn't right. Check it with your company: it's 12 letters and numbers.";
  if (status === 401) return "You're signed out. Sign in again, then enter the code.";
  if (!status) return "No connection. Check your internet, then try again.";
  return "Something went wrong on our side. Try again in a minute.";
}

// initialCode comes from a company's join QR; it is checked straight away,
// exactly as if the passenger had typed it.
export default function CodeGate({ onUnlock, initialCode = "", className = "mt-10 sm:mt-20" }) {
  const { checkUserAuth } = useAuth();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);

  const submit = async (e, override) => {
    e?.preventDefault();
    const value = cleanCompanyCode(override ?? code);
    if (!value) return;
    // Checked here first, so a typo doesn't use up one of the 5 tries.
    if (value.length !== 12) {
      setError(`Company codes are 12 letters and numbers. This one has ${value.length}.`);
      return;
    }
    setChecking(true);
    setError("");
    try {
      // A new device links with several calls at once, and the platform refuses
      // bursts — one rejected call used to read as a wrong code or no signal.
      const response = await withRateLimitRetry(() => base44.functions.invoke("companyAccess", { action: "verify", code: value }));
      const { company, grant } = response.data;
      localStorage.removeItem("tt_company_code");
      localStorage.setItem("tt_company_access_grant", grant);
      clearCompanyLeft();
      onUnlock(company, response.data);
      checkUserAuth();
    } catch (e) {
      setError(companyCodeProblem(e));
      const status = httpStatus(e);
      if (status !== 401 && status !== 403 && status !== 429) reportError(e, { source: "company-code", extra: `status ${status ?? "none"}` });
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

  // Scanning the company's QR checks its code, the same as typing it.
  const onScan = (found) => { setCode(found); submit(null, found); };

  return (
    <div className={`max-w-sm mx-auto ${className}`}>
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
              placeholder="12 letters and numbers"
              aria-label="Company code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              autoFocus
              className="h-12 text-center text-lg font-semibold tracking-[0.3em] placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking || !code.trim()}>
              {checking ? "Checking…" : "View live fleet"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3 text-caption text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <ScanCompanyQrButton className="w-full" onClick={() => { setError(""); setScanning(true); }} disabled={checking} />
          <ScanCompanyQrDialog open={scanning} onOpenChange={setScanning} onCode={onScan} />
        </CardContent>
      </Card>
    </div>
  );
}