import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// Thin wrapper around html5-qrcode's camera-based decoder. Renders into a
// fixed-id div (the library owns that element's DOM) and reports every
// decoded payload upward — the caller decides what a valid payload means.
export default function QrScanner({ onDecode, active }) {
  const elementId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      (decodedText) => { if (!stopped) onDecode?.(decodedText); },
      () => { /* per-frame no-QR-found noise — ignore */ }
    ).catch((e) => setError(e?.message || "Couldn't start the camera."));

    return () => {
      stopped = true;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <div className="space-y-2">
      <div id={elementId} className="rounded-xl overflow-hidden bg-black/80 mx-auto" style={{ width: 260, height: 260 }} />
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
