import { useEffect, useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { deviceMapInfo } from "@/lib/mapEngine";
import { isOfflineError, pendingJobs } from "@/lib/offlineJobs";

// The last good session is kept on the tablet so the driver app still opens
// (vehicle, PIN, route, stops, staff list) when it starts with no WiFi.
const CACHE_KEY = "tt_driver_session_cache";
const PATCH_EVENT = "tt-driver-session-patch";

function readCache(deviceId) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return c && c.device_id === deviceId ? c.session : null;
  } catch { return null; }
}
function writeCache(deviceId, session) {
  if (!deviceId || !session) return;
  // Chat history and photos are the bulky parts and aren't needed to drive.
  const slim = { ...session, group_messages: (session.group_messages || []).slice(-20) };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ device_id: deviceId, saved_at: new Date().toISOString(), session: slim })); }
  catch { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ device_id: deviceId, session: { ...slim, group_messages: [] } })); } catch { /* storage full */ } }
}
export function clearDriverSessionCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// Lets offline actions (e.g. starting a shift with no signal) update what the
// screen shows, and what the tablet remembers, before the server hears of it.
export function patchDriverSession(patch) {
  try { window.dispatchEvent(new CustomEvent(PATCH_EVENT, { detail: patch })); } catch { /* non-browser */ }
}

const hasQueuedShift = () => pendingJobs().some((j) => j.kind === "driver_shift");

export function useDriverSession(deviceId, { intervalMs = 8000 } = {}) {
  const [session, setSession] = useState(() => (deviceId ? readCache(deviceId) : null));
  const [loading, setLoading] = useState(() => !(deviceId && readCache(deviceId)));
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const timerRef = useRef(null);
  // The first heartbeat also reports how this tablet draws maps.
  const sentInfoRef = useRef(false);

  // A different tablet id (re-pair) starts from that tablet's own cache.
  useEffect(() => {
    const cached = deviceId ? readCache(deviceId) : null;
    setSession(cached);
    setLoading(!!deviceId && !cached);
    sentInfoRef.current = false;
  }, [deviceId]);

  const heartbeat = useCallback(async () => {
    if (!deviceId) return;
    const first = !sentInfoRef.current;
    try {
      sentInfoRef.current = true;
      const res = await base44.functions.invoke("driverSession", {
        device_id: deviceId, action: "heartbeat",
        ...(first ? { device_info: deviceMapInfo() } : {}),
      });
      setSession((prev) => {
        // A shift started/ended offline wins until it has been uploaded.
        const next = hasQueuedShift() && prev ? { ...res.data, open_shift: prev.open_shift } : res.data;
        writeCache(deviceId, next);
        return next;
      });
      setError(null);
      setOffline(false);
    } catch (e) {
      if (first) sentInfoRef.current = false;
      if (isOfflineError(e)) setOffline(true);
      setError(e?.response?.data?.error || e?.message || "Session error");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    heartbeat();
    timerRef.current = setInterval(heartbeat, intervalMs);
    const onUp = () => heartbeat();
    window.addEventListener("online", onUp);
    return () => { clearInterval(timerRef.current); window.removeEventListener("online", onUp); };
  }, [heartbeat, intervalMs, deviceId]);

  useEffect(() => {
    const onPatch = (e) => setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...e.detail };
      writeCache(deviceId, next);
      return next;
    });
    window.addEventListener(PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PATCH_EVENT, onPatch);
  }, [deviceId]);

  const invoke = useCallback(async (action, payload = {}) => {
    const res = await base44.functions.invoke("driverSession", { device_id: deviceId, action, ...payload });
    return res.data;
  }, [deviceId]);

  return { session, loading, error, offline, refresh: heartbeat, invoke };
}
