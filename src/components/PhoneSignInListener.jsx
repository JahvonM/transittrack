import { useEffect } from "react";
import { isKioskInstall } from "@/lib/kioskApp";
import { base44 } from "@/api/base44Client";
import { phoneSignInAvailable, isPhoneSignInLink, openPhoneSignInLink, afterPhoneSignInPath } from "@/lib/phoneSignIn";

// Phone app only: receives the sign-in the phone's browser hands back
// (com.transittrack.app://signin?...), checks it is the one this app started,
// and signs in. See src/lib/phoneSignIn.js. Renders nothing.
export async function acceptPhoneSignInLink(url, { storage, setToken, go, closeBrowser }) {
  if (!isPhoneSignInLink(url)) return "ignored";
  try { await closeBrowser?.(); } catch { /* Android keeps its own tab */ }
  try {
    const { token, returnTo } = await openPhoneSignInLink(url, { storage });
    await setToken(token);
    go(afterPhoneSignInPath(returnTo));
    return "signed-in";
  } catch (error) {
    if (error?.name === "NotOurs") return "ignored";
    go(`/login?phoneSignIn=${error?.name === "Expired" ? "expired" : "failed"}`);
    return "failed";
  }
}

export default function PhoneSignInListener() {
  useEffect(() => {
    if (isKioskInstall() || !phoneSignInAvailable()) return undefined;
    let stopped = false;
    let handle = null;
    const accept = async (url) => {
      if (!isPhoneSignInLink(url)) return;
      const { Browser } = await import("@capacitor/browser");
      await acceptPhoneSignInLink(url, {
        storage: window.localStorage,
        setToken: (token) => base44.auth.setToken(token),
        go: (path) => window.location.replace(path),
        closeBrowser: () => Browser.close(),
      });
    };
    (async () => {
      const { App } = await import("@capacitor/app");
      if (stopped) return;
      handle = await App.addListener("appUrlOpen", ({ url }) => { accept(url); });
      if (stopped) { handle.remove(); return; }
      // The app was closed while the browser was open and the link started it.
      try {
        const launch = await App.getLaunchUrl();
        if (launch?.url) accept(launch.url);
      } catch { /* no launch link */ }
    })();
    return () => {
      stopped = true;
      handle?.remove();
    };
  }, []);
  return null;
}
