import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// Thin wrapper around html5-qrcode's camera-based decoder. Renders into a
// fixed-id div (the library owns that element's DOM) and reports every
// decoded payload upward — the caller decides what a valid payload means.
export default function QrScanner({ onDecode, active, facingMode = "environment" }) {
  const elementId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;
    const started = scanner.start(
      { facingMode },
      {
        fps: 10,
        qrbox: 220,
        // Chrome and Android ship a hardware-accelerated barcode decoder. The
        // library's own JavaScript decoder is far slower and drops codes that
        // are angled, moving or under glare — which is most of them on a
        // tablet held at arm's length.
        useBarCodeDetectorIfSupported: true,
      },
      (decodedText) => { if (!stopped) onDecode?.(decodedText); },
      () => { /* per-frame no-QR-found noise — ignore */ }
    );
    started.catch((e) => {
      if (stopped) return;
      const raw = e?.message || (typeof e === "string" ? e : "");
      setError(/permission|denied|notallowed/i.test(raw)
        ? "Camera access is blocked on this tablet. Allow camera access, then tap Scan QR code again."
        : raw || "Couldn't start the camera on this device.");
    });

    // stop() throws if the camera never started, so wait for start first;
    // this also turns off a camera that opens after the scanner was closed.
    return () => {
      stopped = true;
      started.then(() => scanner.stop()).then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, facingMode]);

  if (!active) return null;

  return (
    <div className="space-y-2">
      <div id={elementId} className="rounded-xl overflow-hidden bg-black/80 mx-auto" style={{ width: 260, height: 260 }} />
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}