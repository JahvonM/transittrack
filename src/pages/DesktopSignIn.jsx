import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Monitor, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { useAuth } from "@/lib/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import {
  DESKTOP_PROVIDERS,
  readDesktopSignIn,
  desktopSignInPath,
  currentSessionToken,
  sendSessionToDesktop,
} from "@/lib/desktopSignIn";

// Opened in the person's own browser by TransitTrack Desktop when they choose
// "Continue with Google" there (Google blocks sign-in inside app windows).
// Signs in here as usual, then — only after the person confirms — hands the
// session to the desktop app's one-time listener on this computer.
// See src/lib/desktopSignIn.js and desktop/browser-signin.cjs.
export default function DesktopSignIn() {
  const request = useMemo(() => readDesktopSignIn(window.location.search), []);
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const [step, setStep] = useState("ready"); // ready | redirecting | sending | cancelled
  const [error, setError] = useState("");
  const autoStarted = useRef(false);
  const providerName = request ? DESKTOP_PROVIDERS[request.provider] : "";

  const startProvider = () => {
    setStep("redirecting");
    base44.auth.loginWithProvider(request.provider, desktopSignInPath(request));
  };

  // Signed out: go straight to the provider chosen in the desktop app, once
  // per sign-in attempt (coming back still signed out shows the button).
  useEffect(() => {
    if (!request || isLoadingAuth || isAuthenticated || autoStarted.current) return;
    autoStarted.current = true;
    const key = "tt_desktop_signin_" + request.state.slice(0, 16);
    let tried = false;
    try {
      tried = window.sessionStorage.getItem(key) === "1";
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still start once */
    }
    if (!tried) startProvider();
  }, [request, isLoadingAuth, isAuthenticated]);

  const finish = () => {
    setError("");
    const token = currentSessionToken(window.localStorage, appParams.token);
    if (!token) {
      setError("This browser's sign-in can't be shared with the desktop app. Choose \"Use a different account\" and sign in again.");
      return;
    }
    setStep("sending");
    sendSessionToDesktop(request, token);
  };

  const switchAccount = () => {
    setStep("redirecting");
    base44.auth.logout(window.location.origin + desktopSignInPath(request));
  };

  if (!request) {
    return (
      <AuthLayout
        title="This sign-in link isn't valid"
        subtitle="Go back to TransitTrack Desktop and choose Continue with Google again."
      >
        <p className="flex items-start gap-3 text-body-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          Desktop sign-in links only work from the TransitTrack Desktop app on this computer, and only for a few minutes.
        </p>
      </AuthLayout>
    );
  }

  if (step === "cancelled") {
    return (
      <AuthLayout title="Desktop sign-in cancelled" subtitle="Nothing was shared with the desktop app. You can close this tab.">
        <p className="text-body-sm text-muted-foreground">To try again, go back to TransitTrack Desktop and choose Continue with {providerName}.</p>
      </AuthLayout>
    );
  }

  if (step === "sending") {
    return (
      <AuthLayout title="Signing in TransitTrack Desktop…" subtitle="Go back to the desktop app. You can close this tab once it says you're signed in.">
        <div className="flex items-center gap-3 text-body-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          Handing your sign-in to the desktop app…
        </div>
      </AuthLayout>
    );
  }

  if (isLoadingAuth || step === "redirecting") {
    return (
      <AuthLayout title="Sign in to TransitTrack Desktop" subtitle={`Opening ${providerName} sign-in…`}>
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated) {
    const Icon = request.provider === "google" ? GoogleIcon : request.provider === "apple" ? AppleIcon : Monitor;
    return (
      <AuthLayout title="Sign in to TransitTrack Desktop" subtitle="Sign in here in your browser. The desktop app signs in by itself when you finish.">
        <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={startProvider}>
          <Icon className="w-5 h-5 mr-2" />
          Continue with {providerName}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in to TransitTrack Desktop"
      subtitle="You started signing in from the TransitTrack Desktop app on this computer."
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <div className="mb-5 flex items-start gap-3 rounded-xl bg-secondary p-3 text-body-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Signed in as <span className="font-semibold break-all">{user?.email || user?.full_name || "your account"}</span>
        </span>
      </div>
      <div className="grid gap-3">
        <Button className="w-full h-12 font-medium" onClick={finish}>
          <Monitor className="w-4 h-4 mr-2" aria-hidden="true" />
          Open TransitTrack Desktop
        </Button>
        <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={switchAccount}>
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
          Use a different account
        </Button>
        <Button variant="ghost" className="w-full h-11 text-sm" onClick={() => setStep("cancelled")}>
          Cancel
        </Button>
      </div>
      <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
        Only continue if you just chose to sign in on TransitTrack Desktop. If your browser asks to let this site
        connect to apps or devices on this computer, choose Allow.
      </p>
    </AuthLayout>
  );
}
