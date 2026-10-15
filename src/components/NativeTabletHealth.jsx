import { setNativeNetworkMode } from "@/lib/nativeTabletNetwork";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startNativeTabletHealth } from "@/lib/nativeTabletHealth";
export default function NativeTabletHealth() {
  const { pathname } = useLocation();
  const tablet = /^\/(driver|kiosk)(\/|$)/.test(pathname);
  useEffect(() => tablet ? startNativeTabletHealth() : undefined, [tablet]);
  const mode = /^\/driver(\/|$)/.test(pathname) ? "driver" : /^\/kiosk\/?$/.test(pathname) ? "boarding" : "";
  useEffect(() => { void setNativeNetworkMode(mode).catch(() => {}); }, [mode]);
  return null;
}
