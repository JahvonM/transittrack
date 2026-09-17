import { useEffect, useRef, useState } from "react";

// Web NFC (NDEFReader) is Chrome-on-Android only, needs HTTPS and a user
// gesture to start scanning — a real constraint for a kiosk tablet, but this
// app's kiosks are already Android tablets, so it's a real option rather
// than a dead end. We read the tag's hardware serialNumber as the badge's
// identifier — that's present on every NFC card without needing it to be
// pre-written with NDEF records, which is what makes cheap unformatted
// cards work as badges out of the box.
export function useNfcTap(onTag, active) {
  const [supported] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [listening, setListening] = useState(false);
  const [nfcError, setNfcError] = useState("");
  const readerRef = useRef(null);
  const onTagRef = useRef(onTag);
  onTagRef.current = onTag;

  useEffect(() => {
    if (!supported || !active) { setListening(false); return; }
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
          const tag = event.serialNumber && event.serialNumber.replace(/:/g, "").toUpperCase();
          if (tag) onTagRef.current?.(tag);
        };
        reader.onreadingerror = () => { if (!cancelled) setNfcError("Couldn't read that tag — try again."); };
      })
      .catch((e) => {
        if (!cancelled) { setNfcError(e?.message || "NFC scan failed to start."); setListening(false); }
      });
    return () => { cancelled = true; controller.abort(); setListening(false); };
  }, [supported, active]);

  return { supported, listening, nfcError };
}
