import { useEffect, useRef, useState } from "react";

// Two ways a badge tap can arrive:
//
// 1. Web NFC (NDEFReader) — Chrome-on-Android only, needs HTTPS and a user
//    gesture to start scanning. We read the tag's hardware serialNumber as the
//    badge's identifier — that's present on every NFC card without needing it
//    to be pre-written with NDEF records, which is what makes cheap
//    unformatted cards work as badges out of the box.
//
// 2. An external USB reader (ACR122U) on a kiosk tablet. Web NFC can't see
//    USB readers and doesn't run inside the kiosk app's WebView, so a small
//    bridge program on the tablet reads the card and hands the UID to the page
//    by firing a `tt-badge` window event (detail = UID hex string). The bridge
//    also sets localStorage "tt_badge_reader" = "1" and fires
//    `tt-badge-reader` so screens know a reader is attached and enable their
//    "tap your badge" options. UIDs arrive in the same format as Web NFC's
//    serialNumber (uppercase hex, no separators), so badges registered either
//    way match.
const EXTERNAL_READER_KEY = "tt_badge_reader";

export function hasExternalReader() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(EXTERNAL_READER_KEY) === "1";
  } catch {
    return false;
  }
}

function normalizeTag(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

// Tells the USB reader bridge whether the app accepted the badge it just
// sent, so the reader can flash green (accepted) or red + 3 beeps (rejected).
// The bridge listens only on the tablet itself (127.0.0.1). Fire-and-forget:
// if it isn't reachable, the reader just falls back to its default flash.
export function reportBadgeResult(ok) {
  if (!hasExternalReader()) return;
  const url = `http://127.0.0.1:8765/result?ok=${ok ? 1 : 0}&t=${Date.now()}`;
  const viaImage = () => { try { new Image().src = url; } catch { /* ignore */ } };
  try {
    fetch(url, { mode: "no-cors", cache: "no-store" }).catch(viaImage);
  } catch {
    viaImage();
  }
}

export function useNfcTap(onTag, active) {
  const [webNfc] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [external, setExternal] = useState(hasExternalReader);
  const [listening, setListening] = useState(false);
  const [nfcError, setNfcError] = useState("");
  const readerRef = useRef(null);
  const onTagRef = useRef(onTag);
  onTagRef.current = onTag;

  // The bridge announces itself when it starts (and a tap also proves it's there).
  useEffect(() => {
    const onReader = () => setExternal(true);
    window.addEventListener("tt-badge-reader", onReader);
    return () => window.removeEventListener("tt-badge-reader", onReader);
  }, []);

  // External USB reader taps — only acted on while this screen is listening,
  // same as Web NFC, so a tap on a confirm/result screen doesn't re-trigger.
  useEffect(() => {
    const onBadge = (event) => {
      setExternal(true);
      if (!active) return;
      const tag = normalizeTag(event?.detail);
      if (tag) onTagRef.current?.(tag);
    };
    window.addEventListener("tt-badge", onBadge);
    return () => window.removeEventListener("tt-badge", onBadge);
  }, [active]);

  useEffect(() => {
    if (!webNfc || !active) { setListening(false); return; }
    let cancelled = false;
    // Without an AbortSignal, a scan started here keeps running (and
    // `onreading` keeps firing) even after this effect's cleanup runs —
    // e.g. once a tap has moved the caller on to a confirm/result screen,
    // a second tap would otherwise silently re-trigger the tag handler.
    const controller = new AbortController();
    const reader = new window.NDEFReader();
    readerRef.current = reader;
    reader.scan({ signal: controller.signal })
      .then(() => {
        if (cancelled) return;
        setListening(true);
        setNfcError("");
        reader.onreading = (event) => {
          if (cancelled) return;
          const tag = event.serialNumber && normalizeTag(event.serialNumber);
          if (tag) onTagRef.current?.(tag);
        };
        reader.onreadingerror = () => { if (!cancelled) setNfcError("Couldn't read that tag — try again."); };
      })
      .catch((e) => {
        // On a kiosk with a USB reader, a Web NFC failure isn't worth showing.
        if (!cancelled && !hasExternalReader()) { setNfcError(e?.message || "NFC scan failed to start."); }
        if (!cancelled) setListening(false);
      });
    return () => { cancelled = true; controller.abort(); setListening(false); };
  }, [webNfc, active]);

  return {
    supported: webNfc || external,
    listening: listening || (!!active && external),
    nfcError,
  };
}
