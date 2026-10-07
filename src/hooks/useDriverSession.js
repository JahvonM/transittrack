import { deviceRequest } from "@/lib/deviceAuth";
import { cleanTabletSession } from "@/lib/tabletSession";
import { useEffect, useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { deviceMapInfo } from "@/lib/mapEngine";
import { isOfflineError, pendingJobs } from "@/lib/offlineJobs";
import { helperHealthPayload } from "@/lib/helperHealth";
import { appHealthPayload } from "@/lib/appHealth";
import { httpStatus, errorData } from '@/lib/requestError';
import { forgetUnlockDay } from '@/lib/localDay';

// The last good session is kept on the tablet so the driver app still opens
// (vehicle summary, route, stops, staff list) when it starts with no WiFi.
const CACHE_KEY = "tt_driver_session_cache";
const PATCH_EVENT = "tt-driver-session-patch";

function readCache(deviceId) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || c.device_id !== deviceId) return null;
    const clean = cleanTabletSession(c.session);
    // Rewrite legacy storage immediately, even when the tablet starts offline.
    writeCache(deviceId, clean);
    return clean;
  } catch { return null; }
}
function writeCache(deviceId, session) {
  if (!deviceId || !session) return;
  // Chat history and photos are the bulky parts and aren't needed to drive.
  const slim = cleanTabletSession({ ...session, group_messages: (session.group_messages || []).slice(-20) });
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
  const [loading, setLoading] = useState(() => !!deviceId && !session);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const timerRef = useRef(null);
  const heartbeatBusy = useRef(false);
  const currentDevice = useRef(deviceId);
  currentDevice.current = deviceId;
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
    if (!deviceId || heartbeatBusy.current) return;
    heartbeatBusy.current = true;
    const first = !sentInfoRef.current;
    try {
      sentInfoRef.current = true;
      const res = await base44.functions.invoke("driverSession", deviceRequest(deviceId, {
        action: "heartbeat",
        ...(first ? { device_info: deviceMapInfo() } : {}),
        ...helperHealthPayload(),
        ...appHealthPayload("driver"),
      }));
      if (currentDevice.current !== deviceId) return;
      setSession((prev) => {
        // A shift started/ended offline wins until it has been uploaded.
        const next = cleanTabletSession(hasQueuedShift() && prev ? { ...res.data, open_shift: prev.open_shift } : res.data);
        writeCache(deviceId, next);
        return next;
      });
      setError(null);
      setOffline(false);
    } catch (e) {
      if (currentDevice.current !== deviceId) return;
      if (first) sentInfoRef.current = false;
      if (isOfflineError(e)) setOffline(true);
      setError(errorData(e).error || e?.message || "Session error");
    } finally {
      heartbeatBusy.current = false;
      if (currentDevice.current === deviceId) setLoading(false);
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
      const next = cleanTabletSession({ ...prev, ...e.detail });
      writeCache(deviceId, next);
      return next;
    });
    window.addEventListener(PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PATCH_EVENT, onPatch);
  }, [deviceId]);

  const invoke = useCallback(async (action, payload = {}) => {
    try {
      const res = await base44.functions.invoke("driverSession", deviceRequest(deviceId, { ...payload, action }));
      return res.data;
    } catch (error) {
      const data = errorData(error);
      if (httpStatus(error) === 401 && (['DRIVER_PIN_REQUIRED', 'DEVICE_ACCESS_REQUIRED'].includes(data.code) || ['Driver PIN verification required', 'Invalid or unpaired driver device'].includes(data.error))) {
        forgetUnlockDay();
        window.dispatchEvent(new Event('tt-driver-locked'));
      }
      throw error;
    }
  }, [deviceId]);

  return { session, loading, error, offline, refresh: heartbeat, invoke };
}