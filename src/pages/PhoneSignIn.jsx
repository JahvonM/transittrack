import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Smartphone, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { useAuth } from "@/lib/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import { currentSessionToken } from "@/lib/desktopSignIn";
import { PHONE_PROVIDERS, readPhoneSignIn, phoneSignInPath, sealSessionForPhone, forgetPhoneSignInKey } from "@/lib/phoneSignIn";

function readRequest() {
  let store = null;
  try { store = window.sessionStorage; } catch { /* storage blocked */ }
  const request = readPhoneSignIn(window.location.search, window.location.hash, store);
  // Keep the key out of the address bar and history once it's been read.
  if (window.location.hash) {
    try { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); } catch { /* ignore */ }
  }
  return request;
}

// Opened in the phone's own browser by the TransitTrack phone app when the
// person taps "Continue with Google" (or Apple) there, because Google blocks
// sign-in inside apps. Signs in here as usual, then, only after the person
// taps "Open TransitTrack app", hands the session back to the app, sealed
// with the key only the app has. See src/lib/phoneSignIn.js.
export default function PhoneSignIn() {
  const request = useMemo(readRequest, []);
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const [step, setStep] = useState("ready"); // ready | redirecting | sent | cancelled
  const [appLink, setAppLink] = useState("");
  const [error, setError] = useState("");
  const autoStarted = useRef(false);
  const providerName = request ? PHONE_PROVIDERS[request.provider] : "";
  const usable = !!request?.key;

  const startProvider = () => {
    setStep("redirecting");
    base44.auth.loginWithProvider(request.provider, phoneSignInPath(request));
  };

  // Signed out: go straight to the provider chosen in the app, once per
  // sign-in attempt (coming back still signed out shows the button).
  useEffect(() => {
    if (!usable || isLoadingAuth || isAuthenticated || autoStarted.current) return;
    autoStarted.current = true;
    const key = "tt_phone_signin_started_" + request.state.slice(0, 16);
    let tried = false;
    try {
      tried = window.sessionStorage.getItem(key) === "1";
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still start once */
    }
    if (!tried) startProvider();
  }, [usable, isLoadingAuth, isAuthenticated]);

  // Signed in: prepare the sealed link ahead of the tap, so opening the app
  // is a plain link the browser always lets through.
  useEffect(() => {
    if (!usable || !isAuthenticated) return undefined;
    let alive = true;
    const token = currentSessionToken(window.localStorage, appParams.token);
    if (!token) {
      setError("This browser's sign-in can't be shared with the app. Tap \"Use a different account\" and sign in again.");
      return undefined;
    }
    sealSessionForPhone(request, token)
      .then((link) => { if (alive) setAppLink(link); })
      .catch(() => { if (alive) setError("Couldn't prepare the sign-in for the app. Go back to the TransitTrack app and try again."); });
    return () => { alive = false; };
  }, [usable, isAuthenticated, request]);

  const opened = () => {
    // Let the link open the app first, then forget the key: one use only.
    setTimeout(() => {
      forgetPhoneSignInKey(request.state, window.sessionStorage);
      setStep("sent");
    }, 300);
  };

  const switchAccount = () => {
    setStep("redirecting");
    setAppLink("");
    base44.auth.logout(window.location.origin + phoneSignInPath(request));
  };

  const cancel = () => {
    forgetPhoneSignInKey(request.state, window.sessionStorage);
    setAppLink("");
    setStep("cancelled");
  };

  if (!usable) {
    return (
      <AuthLayout
        title="This sign-in link isn't valid"
        subtitle="Go back to the TransitTrack app and tap Continue with Google again."
      >
        <p className="flex items-start gap-3 text-body-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          Phone sign-in links only work when the TransitTrack app opens them, in the same browser window, for a few minutes.
        </p>
      </AuthLayout>
    );
  }

  if (step === "cancelled") {
    return (
      <AuthLayout title="App sign-in cancelled" subtitle="Nothing was shared with the app. You can close this window.">
        <p className="text-body-sm text-muted-foreground">To try again, go back to the TransitTrack app and tap Continue with {providerName}.</p>
      </AuthLayout>
    );
  }

  if (step === "sent") {
    return (
      <AuthLayout title="Back to the TransitTrack app" subtitle="The app signs in by itself. You can close this window.">
        <p className="text-body-sm text-muted-foreground">If the app didn't open, go back to it and tap Continue with {providerName} again.</p>
      </AuthLayout>
    );
  }

  if (isLoadingAuth || step === "redirecting") {
    return (
      <AuthLayout title="Sign in to the TransitTrack app" subtitle={`Opening ${providerName} sign-in…`}>
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated) {
    const Icon = request.provider === "apple" ? AppleIcon : GoogleIcon;
    return (
      <AuthLayout title="Sign in to the TransitTrack app" subtitle="Sign in here. The app signs in by itself when you finish.">
        <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={startProvider}>
          <Icon className="w-5 h-5 mr-2" />
          Continue with {providerName}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in to the TransitTrack app" subtitle="You started signing in from the TransitTrack app on this phone.">
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
        {appLink ? (
          <Button asChild className="w-full h-12 font-medium">
            <a href={appLink} onClick={opened}>
              <Smartphone className="w-4 h-4 mr-2" aria-hidden="true" />
              Open TransitTrack app
            </a>
          </Button>
        ) : (
          <Button className="w-full h-12 font-medium" disabled>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            Open TransitTrack app
          </Button>
        )}
        <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={switchAccount}>
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
          Use a different account
        </Button>
        <Button variant="ghost" className="w-full h-11 text-sm" onClick={cancel}>
          Cancel
        </Button>
      </div>
      <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
        Only continue if you just tapped Continue with {providerName} in the TransitTrack app on this phone.
        If your phone asks to open TransitTrack, choose Open.
      </p>
    </AuthLayout>
  );
}
