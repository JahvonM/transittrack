import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";
import { useIsDark } from "@/lib/useTheme";
import { GOOGLE_WEB_CLIENT_ID, loadGoogleButtonScript, makeNonce, signedInPath } from "@/lib/googleButton";

// Google's own "Continue with Google" button (see src/lib/googleButton.js).
// Until Google's button is ready, and if it never loads, the usual button is
// shown and does the redirect sign-in (onFallback).
//   then:       the page to open once signed in
//   onFallback: the redirect sign-in, for when Google's button can't be used
export default function GoogleSignInButton({ then = "/", onFallback, label = "Continue with Google" }) {
  const slot = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDark = useIsDark();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [google, nonce] = await Promise.all([loadGoogleButtonScript(), makeNonce()]);
        if (!alive || !slot.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
          context: "signin",
          callback: async ({ credential }) => {
            setBusy(true);
            setError("");
            try {
              await base44.auth.loginWithGoogleIdToken(credential, nonce.raw);
              // A fresh page load picks up the new sign-in everywhere at once.
              window.location.assign(signedInPath(then));
            } catch (e) {
              setBusy(false);
              setError(e?.message || "Google sign-in didn't finish. Try again, or use your email and password.");
            }
          },
        });
        const box = slot.current.parentElement?.getBoundingClientRect().width || 320;
        const width = Math.max(200, Math.min(400, Math.round(box)));
        slot.current.replaceChildren();
        google.accounts.id.renderButton(slot.current, {
          type: "standard", theme: isDark ? "filled_black" : "outline", size: "large",
          text: "continue_with", shape: "rectangular", logo_alignment: "center", width,
        });
        if (alive) setReady(true);
      } catch {
        if (alive) setReady(false);
      }
    })();
    return () => { alive = false; };
  }, [then, isDark]);

  return (
    <div className="w-full">
      {/* Google draws its button in here; it stays hidden until it has. */}
      <div ref={slot} className={ready && !busy ? "flex h-12 w-full items-center justify-center" : "hidden"} aria-busy={busy || undefined} />
      {(!ready || busy) && (
        <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={() => onFallback?.()} disabled={busy}>
          <GoogleIcon className="w-5 h-5 mr-2" />
          {busy ? "Signing in…" : label}
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
