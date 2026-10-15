import { Capacitor, registerPlugin } from "@capacitor/core";
const UsbNfc = registerPlugin("UsbNfc");
export const nativeNfcAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("UsbNfc");
export async function nativeNfcState() {
  if (!nativeNfcAvailable()) return { available: false, enabled: false };
  try { return await UsbNfc.getState(); } catch { return { available: false, enabled: false }; }
}
export const setNativeNfcEnabled = enabled => UsbNfc.setEnabled({ enabled: !!enabled });
export async function setNativeNfcReady(ready) {
  if (nativeNfcAvailable()) await UsbNfc.setReady({ ready: !!ready });
}
export async function retryNativeNfc() { if (nativeNfcAvailable()) await UsbNfc.rescan(); }
export const onNativeNfcState = callback => listen("readerState", callback);
function listen(name, callback) {
  let stopped = false, handle;
  if (nativeNfcAvailable()) UsbNfc.addListener(name, value => { if (!stopped) callback(value); })
    .then(h => { if (stopped) void h.remove(); else handle = h; }).catch(() => {});
  return () => { stopped = true; void handle?.remove(); };
}

// Results and card IDs live in memory only. No raw card UID enters logs/storage.
const completed = new Map();
export async function acknowledgeNativeTap(tapId, accepted) {
  if (!nativeNfcAvailable() || !validTapId(tapId)) return;
  completed.set(tapId, { accepted: !!accepted, at: Date.now() });
  while (completed.size > 64) completed.delete(completed.keys().next().value);
  await UsbNfc.acknowledge({ tapId, accepted: !!accepted });
}
const validTapId = value => typeof value === "string" && /^native-[a-z0-9-]{16,64}$/i.test(value);
export function nativeTap(raw, now = Date.now()) {
  if (!validTapId(raw?.tapId) || !Number.isFinite(raw?.at) ||
      now - raw.at >= 30000 || raw.at > now + 2000 ||
      typeof raw.uid !== "string" || !/^(?:[0-9a-f]{2}){2,16}$/i.test(raw.uid)) return null;
  return { uid: raw.uid.toUpperCase(), id: raw.tapId, at: raw.at, source: "native" };
}

// Each hook shares one native subscription to avoid double delivery during remounts.
let clients = 0, detach = null;
export function bridgeNativeNfc(target = window) {
  if (!nativeNfcAvailable()) return () => {};
  clients++;
  if (!detach) {
    const announce = state => {
      target.__ttNativeNfcState = { ...state, at: Date.now() };
      if (state.enabled) {
        try { target.localStorage.setItem("tt_badge_reader", "1"); } catch { /* status flag only */ }
        target.dispatchEvent(new Event("tt-badge-reader"));
      }
    };
    const stopState = onNativeNfcState(announce);
    void nativeNfcState().then(announce);
    const stopCard = listen("card", raw => {
      const tap = nativeTap(raw);
      if (!tap) return;
      const done = completed.get(tap.id);
      if (done && Date.now() - done.at < 30000) {
        void acknowledgeNativeTap(tap.id, done.accepted).catch(() => {});
        return;
      }
      const inbox = Array.isArray(target.__ttBadgeInbox) ? target.__ttBadgeInbox : [];
      target.__ttBadgeInbox = [...inbox.filter(t => Date.now() - t.at < 30000), tap].slice(-8);
      const event = new CustomEvent("tt-badge", { detail: tap.uid });
      event.ttTapId = tap.id; event.ttTapAt = tap.at; event.ttSource = "native";
      target.dispatchEvent(event);
    });
    detach = () => { stopState(); stopCard(); };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--clients === 0) {
      detach?.(); detach = null;
      void setNativeNfcReady(false).catch(() => {});
    }
  };
}
