import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/AuthLayout";
import { captureJoinCode, hasPendingJoinCode } from "@/lib/companyJoin";

const STAFF_ROLES = new Set(["admin", "driver", "company", "mechanic"]);
const RETURN = "?returnTo=" + encodeURIComponent("/join");

// Where a company's join QR lands. It keeps the code for this tab, then sends
// a signed-in passenger to their home, which checks the code like a typed one.
export default function JoinCompany() {
  const { user, isAuthenticated } = useAuth();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    const captured = captureJoinCode();
    setValid(captured || hasPendingJoinCode());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (valid && isAuthenticated && user && !STAFF_ROLES.has(user.role)) return <Navigate to="/staff" replace />;

  if (!valid) {
    return (
      <AuthLayout title="This QR code didn't work" subtitle="Ask your bus company for a new QR code, or type their company code instead.">
        <Button asChild className="w-full"><Link to={isAuthenticated ? "/staff" : "/login"}>{isAuthenticated ? "Enter a company code" : "Sign in"}</Link></Button>
      </AuthLayout>
    );
  }

  if (isAuthenticated && user && STAFF_ROLES.has(user.role)) {
    return (
      <AuthLayout title="This QR code is for passengers" subtitle="You're signed in with a staff account, so it can't join you to a company as a passenger.">
        <Button asChild variant="outline" className="w-full"><Link to="/">Go to my dashboard</Link></Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join your bus company"
      subtitle="Sign in or create a free account. We'll add you to the company that gave you this QR code."
    >
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-secondary p-3 text-body-sm">
        <QrCode className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Company code received. You won't need to type it.
      </div>
      <div className="grid gap-2">
        <Button asChild className="w-full"><Link to={"/register" + RETURN}>Create an account</Link></Button>
        <Button asChild variant="outline" className="w-full"><Link to={"/login" + RETURN}>I already have an account</Link></Button>
      </div>
    </AuthLayout>
  );
}
