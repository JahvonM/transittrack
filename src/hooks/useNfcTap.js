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
    const reader = new window.NDEFReader();
    readerRef.current = reader;
    reader.scan()
      .then(() => {
        if (cancelled) return;
        setListening(true);
        setNfcError("");
        reader.onreading = (event) => {
          const tag = event.serialNumber && event.serialNumber.replace(/:/g, "").toUpperCase();
          if (tag) onTagRef.current?.(tag);
        };
        reader.onreadingerror = () => setNfcError("Couldn't read that tag — try again.");
      })
      .catch((e) => {
        if (!cancelled) { setNfcError(e?.message || "NFC scan failed to start."); setListening(false); }
      });
    return () => { cancelled = true; setListening(false); };
  }, [supported, active]);

  return { supported, listening, nfcError };
}
