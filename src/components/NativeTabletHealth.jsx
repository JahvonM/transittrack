import { stopBackgroundGps } from "@/lib/driverBackground";
import { stopTabletSupport } from "@/lib/nativeTabletSupport";
import { refreshNativeControl } from "@/lib/nativeTabletControl";
import { setNativeNetworkMode } from "@/lib/nativeTabletNetwork";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startNativeTabletHealth } from "@/lib/nativeTabletHealth";
export default function NativeTabletHealth() {
  const { pathname } = useLocation();
  const tablet = /^\/(driver|kiosk)(\/|$)/.test(pathname);
  useEffect(() => tablet ? startNativeTabletHealth() : undefined, [tablet]);
  const mode = /^\/driver(\/|$)/.test(pathname) ? "driver" : /^\/kiosk\/?$/.test(pathname) ? "boarding" : "";
  useEffect(() => { if (mode === "boarding") void stopBackgroundGps().catch(() => {}); void setNativeNetworkMode(mode).catch(() => {}); }, [mode]);
  useEffect(() => {
    if (!tablet) return undefined;
    const tick = () => {
      let id = "";
      try { id = localStorage.getItem(mode === "driver" ? "tt_driver_device_id" : "tt_kiosk_device_id") || ""; } catch { /* unavailable storage blocks safety */ }
      void refreshNativeControl(id).catch(() => {});
    };
    tick(); const timer = setInterval(tick, 5000);
    return () => { clearInterval(timer); void stopTabletSupport().catch(() => {}); void refreshNativeControl("").catch(() => {}); };
  }, [tablet, mode]);
  return null;
}
