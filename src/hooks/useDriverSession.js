import { handleTabletSupport, handleTabletRecordings } from "@/lib/nativeTabletSupport";
import { handleTabletControl } from "@/lib/nativeTabletControl";
import { createPollBudget, startTabletPoll } from "@/lib/tabletPolling";
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
import { handleNetworkCommand, networkAckPayload, withoutNetworkCommand } from '@/lib/tabletNetwork';

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

// The passenger list, road stops, inspection forms and company details rarely
// change, so they come with a full check-in once a minute (and straight after
// an unlock or lock); the check-ins in between ask only for what changes
// quickly. Asking for everything every time went over Base44's request limit.
const FULL_EVERY_MS = 60_000;
const grantOf = (deviceId) => { try { return localStorage.getItem("tt_driver_grant_" + deviceId) || ""; } catch { return ""; } };
// A busy server (429) or a server error still answered: that isn't "offline".
const serverAnswered = (e) => { const status = httpStatus(e); return status === 429 || status >= 500; };

export function useDriverSession(deviceId, { intervalMs = 15000, chatActive = false } = {}) {
  const [session, setSession] = useState(() => (deviceId ? readCache(deviceId) : null));
  const [loading, setLoading] = useState(() => !!deviceId && !session);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const timerRef = useRef(null);
  const heartbeatBusy = useRef(false);
  const pollBudget=useRef(createPollBudget());
  const currentDevice = useRef(deviceId);
  currentDevice.current = deviceId;
  // The first heartbeat also reports how this tablet draws maps.
  const sentInfoRef = useRef(false);
  const lastFull = useRef({ at: 0, grant: null });
  const forceFull = useRef(true);
  const chatRevision = useRef(0);

  // A different tablet id (re-pair) starts from that tablet's own cache.
  useEffect(() => {
    const cached = deviceId ? readCache(deviceId) : null;
    setSession(cached);
    setLoading(!!deviceId && !cached);
    sentInfoRef.current = false;
    pollBudget.current.succeeded();
    forceFull.current = true;
  }, [deviceId]);

  const heartbeat = useCallback(async () => {
    if (!deviceId || heartbeatBusy.current || !pollBudget.current.allowed()) return;
    heartbeatBusy.current = true;
    const first = !sentInfoRef.current;
    const chatStamp = ++chatRevision.current;
    const grant = grantOf(deviceId);
    const full = first || forceFull.current || grant !== lastFull.current.grant || Date.now() - lastFull.current.at >= FULL_EVERY_MS;
    try {
      sentInfoRef.current = true;
      const res = await base44.functions.invoke("driverSession", deviceRequest(deviceId, {
        action: "heartbeat",
        ...(full ? {} : { light: true }),
        ...(first ? { device_info: deviceMapInfo() } : {}),
        ...helperHealthPayload(),
        ...appHealthPayload("driver"),
        ...networkAckPayload(),
      }));
      if (currentDevice.current !== deviceId) return;
      // The hotspot switch from Admin → Kiosk tablets goes to the helper app.
      handleNetworkCommand(res.data?.network_command).catch(() => {});
      void handleTabletControl(deviceId, res.data?.control_notice).catch(() => {});
      void handleTabletRecordings(deviceId, res.data?.recordings_notice).catch(() => {});
      void handleTabletSupport(deviceId, res.data?.support_notice).catch(() => {});
      const reply = withoutNetworkCommand(res.data);
      const light = reply?.light === true;
      if (light) delete reply.light;
      if (full) { lastFull.current = { at: Date.now(), grant }; forceFull.current = false; }
      setSession((prev) => {
        // A light check-in leaves out the slow-changing parts: keep ours.
        const data = light && prev ? { ...prev, ...reply } : { ...reply };
        // A newer chat read or acknowledged write wins over an older heartbeat.
        if (prev && reply?.driver_unlocked !== false && chatStamp !== chatRevision.current)
          data.group_messages = prev.group_messages;
        // A shift started/ended offline wins until it has been uploaded.
        const next = cleanTabletSession(hasQueuedShift() && prev ? { ...data, open_shift: prev.open_shift } : data);
        writeCache(deviceId, next);
        return next;
      });
      pollBudget.current.succeeded();
      setError(null);
      setOffline(false);
    } catch (e) {
      if (currentDevice.current !== deviceId) return;
      pollBudget.current.failed(e);
      if (first) sentInfoRef.current = false;
      if (isOfflineError(e) && !serverAnswered(e)) setOffline(true);
      setError(errorData(e).error || e?.message || "Session error");
    } finally {
      heartbeatBusy.current = false;
      if (currentDevice.current === deviceId) setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    heartbeat();
    timerRef.current = startTabletPoll(heartbeat, intervalMs);
    const onUp = () => heartbeat();
    window.addEventListener("online", onUp);
    return () => { timerRef.current?.(); window.removeEventListener("online", onUp); };
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
      const result = res.data;
      if (currentDevice.current === deviceId && ["send_group_message", "send_chat_media", "edit_group_message", "delete_group_message"].includes(action)) {
        chatRevision.current++;
        setSession(previous => {
          if (!previous) return previous;
          const rows = previous.group_messages || [];
          const message = result?.message;
          const nextRows = action === "delete_group_message" ? rows.filter(m => m.id !== payload.message_id)
            : message?.id ? [...new Map([...rows, message].map(m => [m.id, m])).values()]
            : action === "edit_group_message" ? rows.map(m => m.id === payload.message_id ? { ...m, text: payload.text, edited: true } : m) : rows;
          const next = { ...previous, group_messages: nextRows };
          writeCache(deviceId, next);
          return next;
        });
      }
      return result;
    } catch (error) {
      // Only this tablet's own backend can say the PIN is needed again. A
      // request that never reached it (no signal, a platform-level 401) says
      // nothing about the driver, so it must never raise the PIN screen.
      if (httpStatus(error) === 401 && ['DRIVER_PIN_REQUIRED', 'DEVICE_ACCESS_REQUIRED'].includes(errorData(error).code)) {
        forgetUnlockDay();
        window.dispatchEvent(new Event('tt-driver-locked'));
      }
      throw error;
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || !chatActive) return undefined;
    let busy = false, stopped = false;
    const budget = createPollBudget();
    const read = async () => {
      if (busy || stopped || document.visibilityState === "hidden" || !budget.allowed() || !grantOf(deviceId)) return;
      busy = true;
      const stamp = ++chatRevision.current;
      try {
        const result = await invoke("messages");
        budget.succeeded();
        if (!stopped && currentDevice.current === deviceId && stamp === chatRevision.current) setSession(previous => previous ? { ...previous, group_messages: result.group_messages || [] } : previous);
      } catch (error) { budget.failed(error); }
      finally { busy = false; }
    };
    read();
    const stop = startTabletPoll(read, 8000);
    return () => { stopped = true; stop(); };
  }, [deviceId, chatActive, invoke]);

  // Asked for on purpose (after an unlock, "Try again"): everything, now.
  const refresh = useCallback(() => { forceFull.current = true; return heartbeat(); }, [heartbeat]);

  return { session, loading, error, offline, refresh, invoke };
}
