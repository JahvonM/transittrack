import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { RENEW_MS, call, desktopDisplays, renewOpenDisplays } from "@/lib/officeDisplayDesktop";

// Runs in McSween Transport Desktop only (renders nothing): keeps this
// computer's office display windows' access renewed while an administrator
// is signed in, and closes them when that stops (src/lib/officeDisplayDesktop.js).
export default function DesktopDisplayKeeper() {
  const { user, isLoadingAuth } = useAuth();
  const bridge = desktopDisplays();
  const known = useRef(new Set());
  const admin = user?.role === "admin";
  useEffect(() => {
    if (!bridge || isLoadingAuth) return undefined;
    if (!admin) {
      // Signed out or not an administrator: no display windows from here.
      Promise.resolve(bridge.list()).then((l) => { if (l?.length) bridge.closeAll(); }).catch(() => {});
      return undefined;
    }
    let alive = true;
    void renewOpenDisplays(bridge);
    const t = setInterval(() => { if (alive) void renewOpenDisplays(bridge); }, RENEW_MS);
    // A display window closed (by its own X, or with the main window): end its access now.
    Promise.resolve(bridge.list()).then((l) => { known.current = new Set((l || []).map((w) => w.id)); }).catch(() => {});
    const off = bridge.onChange?.((list) => {
      const now = new Set((list || []).map((w) => w.id));
      for (const id of known.current) if (!now.has(id)) void call("window_close", { display_id: id }).catch(() => {});
      known.current = now;
    });
    return () => { alive = false; clearInterval(t); off?.(); };
  }, [bridge, admin, isLoadingAuth, user?.id]);
  return null;
}
