import React, { useCallback, useEffect, useRef, useState } from "react";
import { Hourglass, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/AuthContext";

// A signed-in account nobody has set up yet (no company, no role from an
// admin). It used to get only the company code box, which left a future
// manager, mechanic or anyone without a code with nothing to do and no idea
// they were waiting. The code box stays underneath (`children`) for
// passengers who have one.
export default function AccountWaiting({ onCheck, children }) {
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const busy = useRef(false);
  const onCheckRef = useRef(onCheck);
  onCheckRef.current = onCheck;

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try { await onCheckRef.current?.(); }
    finally { busy.current = false; setChecking(false); setCheckedAt(new Date()); }
  }, []);

  // Coming back to the app checks again, so access shows up without a tap.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);

  // Not accountName(): that falls back to the email, shown just below.
  const name = String(user?.display_name || user?.full_name || "").trim();
  return (
    <div className="mx-auto mt-10 max-w-sm space-y-4 sm:mt-20">
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-secondary" aria-hidden="true">
            <Hourglass className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-title font-bold">Your account is waiting to be set up</h1>
            <p className="text-body-sm text-muted-foreground">An administrator needs to finish setting up your account. You&apos;ll get in as soon as they do.</p>
          </div>
          {(name || user?.email) && (
            <p className="rounded-xl bg-secondary px-3 py-2 text-left text-body-sm">
              {name && <span className="block font-semibold">{name}</span>}
              {user?.email && <span className="block break-all text-muted-foreground">{user.email}</span>}
            </p>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={check} disabled={checking}>
            <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            {checking ? "Checking…" : "Check again"}
          </Button>
          {checkedAt && !checking && (
            <p role="status" className="text-caption text-muted-foreground">
              Still waiting · checked at {checkedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </CardContent>
      </Card>
      {children && (
        <>
          <p className="text-center text-body-sm text-muted-foreground">Have a company code? Enter it below to join on your own.</p>
          {children}
        </>
      )}
    </div>
  );
}
