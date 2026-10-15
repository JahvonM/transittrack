import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { isKioskInstall } from "@/lib/kioskApp";

// Phone app only: tapping a notification opens the page it is about
// (the server sends that page as data.link). Renders nothing.
export default function NativeNotificationTaps() {
  const navigate = useNavigate();
  useEffect(() => {
    let native = false;
    try { native = Capacitor.isNativePlatform(); } catch { native = false; }
    if (!native || isKioskInstall()) return undefined;
    let stop = null;
    let cancelled = false;
    import("@/lib/nativePush").then(({ onNativeNotificationTap }) => {
      if (cancelled) return;
      stop = onNativeNotificationTap((link) => navigate(link));
    }).catch(() => {});
    return () => { cancelled = true; stop?.(); };
  }, [navigate]);
  return null;
}
