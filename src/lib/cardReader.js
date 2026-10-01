import { useCallback, useEffect, useRef, useState } from "react";

// Link to the "TransitTrack Card Reader" helper — a small Windows program
// (public/tools/TransitTrack-Card-Reader.bat) that talks to a USB ACS ACR122U
// reader through Windows' smart-card service. Browsers can't open that reader
// themselves (WebUSB blocks smart-card devices and it isn't a HID device), so
// the helper reads each card and streams it to this page from
// http://127.0.0.1:8765 (this computer only). The page sends back
// success / error so the reader flashes and beeps.
export const HELPER_URL = "http://127.0.0.1:8765";
export const HELPER_DOWNLOAD = "/tools/TransitTrack-Card-Reader.bat";
const HELPER_FLAG = "tt_reader_helper"; // "1" once this computer has used the helper

export const normalizeUid = (v) => String(v || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
export const formatUid = (uid) => (normalizeUid(uid).match(/.{1,2}/g) || []).join(":");

// Ask the reader to flash / beep. Fire-and-forget; a missing helper is fine.
export function readerFeedback(kind, { beep = true, led = true } = {}) {
  const url = `${HELPER_URL}/feedback?kind=${kind}&beep=${beep ? 1 : 0}&led=${led ? 1 : 0}&t=${Date.now()}`;
  return fetch(url, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
}

/**
 * Card taps from the helper (USB reader) or, on Android, the device's own NFC.
 *   onTap({ uid, cardType, atr, source })
 *   active: only deliver taps while true (e.g. while waiting for a card)
 * Returns helper/reader status and a live log for the console panel.
 */
// Chrome asks "allow this site to access apps and services on this device?"
// the first time a website talks to a program on the same PC. We only ask
// after the operator clicks Connect (then remember it for this PC).
async function localAccessState() {
  if (!navigator.permissions?.query) return "unknown";
  for (const name of ["loopback-network", "local-network-access", "local-network"]) {
    try { return (await navigator.permissions.query({ name })).state; } catch { /* not supported */ }
  }
  return "unknown";
}

function helperRemembered() {
  try { return localStorage.getItem(HELPER_FLAG) === "1"; } catch { return false; }
}

export function useCardReader(onTap, { active = true } = {}) {
  const [enabled, setEnabled] = useState(helperRemembered);
  const [attempt, setAttempt] = useState(0);
  const [helper, setHelper] = useState(() => (helperRemembered() ? "connecting" : "idle")); // idle | connecting | connected | offline
  const [access, setAccess] = useState("unknown"); // Chrome local-network permission: granted | prompt | denied | unknown
  const [reader, setReader] = useState(null); // reader name when plugged in
  const [log, setLog] = useState([]);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const activeRef = useRef(active);
  activeRef.current = active;

  const addLog = useCallback((text, level = "info") => {
    setLog((prev) => [...prev.slice(-199), { t: new Date(), text, level }]);
  }, []);

  // USB reader via the helper (Server-Sent Events). EventSource reconnects by
  // itself; if the helper isn't running at all we retry every few seconds.
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined" || !("EventSource" in window)) { setHelper("offline"); return undefined; }
    let es = null;
    let retry = null;
    let closed = false;
    let announcedOffline = false;
    const open = () => {
      if (closed) return;
      let wasOpen = false;
      es = new EventSource(`${HELPER_URL}/events`);
      es.onopen = () => {
        wasOpen = true;
        setHelper("connected");
        announcedOffline = false;
        try { localStorage.setItem(HELPER_FLAG, "1"); } catch { /* ignore */ }
      };
      es.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "status") {
          setReader(msg.reader || null);
          addLog(msg.reader ? `Reader ready: ${msg.reader}` : "Helper running — no reader plugged in", msg.reader ? "ok" : "warn");
        } else if (msg.type === "log") {
          addLog(msg.text, msg.level || "apdu");
        } else if (msg.type === "card") {
          addLog(`Card detected · UID ${formatUid(msg.uid)} · ${msg.cardType || "unknown type"}`, "ok");
          if (activeRef.current) onTapRef.current?.({ uid: normalizeUid(msg.uid), cardType: msg.cardType || "", atr: msg.atr || "", source: "usb" });
        } else if (msg.type === "removed") {
          addLog("Card removed");
        }
      };
      // EventSource quietly retries forever when nothing answers, so take
      // over: a stream that never opened means the helper isn't reachable
      // (not running, or the browser blocked it) - say so and try again
      // every few seconds. A stream that dropped reconnects straight away.
      es.onerror = () => {
        es.close();
        setReader(null);
        if (wasOpen) {
          setHelper("connecting");
          retry = setTimeout(open, 1000);
          return;
        }
        setHelper("offline");
        localAccessState().then(setAccess);
        if (!announcedOffline) { addLog("Can't reach the reader helper on this computer", "warn"); announcedOffline = true; }
        retry = setTimeout(open, 5000);
      };
    };
    // A plain request first: this is what makes Chrome show its one-time
    // "allow access to this device" prompt.
    setHelper("connecting");
    fetch(`${HELPER_URL}/status`, { cache: "no-store" })
      .then(() => setAccess("granted"))
      .catch(() => localAccessState().then(setAccess))
      .finally(open);
    return () => { closed = true; clearTimeout(retry); es?.close(); };
  }, [enabled, attempt, addLog]);

  const connect = useCallback(() => {
    addLog("Connecting to the reader helper…");
    setEnabled(true);
    setAttempt((a) => a + 1);
  }, [addLog]);

  // Built-in NFC (Chrome on Android) — reads the same UID, no helper needed.
  const [webNfc] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  useEffect(() => {
    if (!webNfc || !active) return undefined;
    const controller = new AbortController();
    const r = new window.NDEFReader();
    r.scan({ signal: controller.signal })
      .then(() => {
        addLog("Phone/tablet NFC listening", "ok");
        r.onreading = (ev) => {
          const uid = normalizeUid(ev.serialNumber);
          if (!uid) return;
          addLog(`Card detected (built-in NFC) · UID ${formatUid(uid)}`, "ok");
          if (activeRef.current) onTapRef.current?.({ uid, cardType: "", atr: "", source: "webnfc" });
        };
      })
      .catch((e) => addLog(`Built-in NFC unavailable: ${e?.message || e}`, "warn"));
    return () => controller.abort();
  }, [webNfc, active, addLog]);

  const feedback = useCallback(async (kind, opts) => {
    if (helper !== "connected") {
      if (navigator.vibrate) navigator.vibrate(kind === "error" ? [120, 80, 120] : 80);
      return;
    }
    const res = await readerFeedback(kind, opts);
    if (res?.apdu) addLog(`> ${res.apdu}  ${res.ok ? "90 00" : "(" + (res.error || "no response") + ")"}`, "apdu");
  }, [helper, addLog]);

  return { helper, reader, webNfc, log, addLog, feedback, connect, access };
}

// Kiosk pages on a PC that has used the helper: turn its card taps into the
// `tt-badge` events the boarding/badge screens already listen for.
let bridged = false;
export function bridgeHelperToBadgeEvents() {
  if (bridged || typeof window === "undefined") return;
  let flag = null;
  try { flag = localStorage.getItem(HELPER_FLAG); } catch { /* ignore */ }
  if (flag !== "1" || !("EventSource" in window)) return;
  bridged = true;
  const es = new EventSource(`${HELPER_URL}/events`);
  es.onopen = () => {
    try { localStorage.setItem("tt_badge_reader", "1"); } catch { /* ignore */ }
    window.dispatchEvent(new Event("tt-badge-reader"));
  };
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "card" && msg.uid) window.dispatchEvent(new CustomEvent("tt-badge", { detail: normalizeUid(msg.uid) }));
    } catch { /* ignore */ }
  };
}
