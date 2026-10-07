import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import createQrScanGate from "@/components/kiosk/qrScanGate";

// Camera lifetime is independent of the parent's clock and request updates.
export default function QrScanner({ onDecode, active, facingMode = "environment", requireFacingMode = false, stableMs = 0 }) {
  const elementId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let delivering = false;
    setError("");
    const gate = createQrScanGate({ stableMs, warmupMs: stableMs > 0 ? 1000 : 0 });
    // Decoder settings belong to the constructor, not start(). Limit this
    // QR scanner to QR codes so ordinary barcodes cannot trigger a lookup.
    const scanner = new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = scanner;
    const started = scanner.start(
      { facingMode: requireFacingMode ? { exact: facingMode } : facingMode },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        if (stopped || delivering || !gate.read(decodedText, Date.now())) return;
        // Synchronous lock plus the latest callback: a slow lookup cannot
        // start overlapping requests using an old copy of busy=false.
        delivering = true;
        try { await onDecodeRef.current?.(decodedText); }
        finally { delivering = false; }
      },
      () => gate.miss(Date.now())
    );
    started.then(() => { if (!stopped) gate.start(Date.now()); }, () => {});
    started.catch((e) => {
      if (stopped) return;
      const raw = e?.message || e?.name || (typeof e === "string" ? e : "");
      setError(/permission|denied|notallowed/i.test(raw)
        ? "Camera access is blocked on this tablet. Allow camera access, then tap Scan QR code again."
        : requireFacingMode && /constraint|notfound/i.test(raw)
          ? "The screen-facing camera isn't available. Check the tablet's camera settings."
          : raw || "Couldn't start the camera on this device.");
    });

    // stop() throws if the camera never started, so wait for start first;
    // this also turns off a camera that opens after the scanner was closed.
    return () => {
      stopped = true;
      started.then(() => scanner.stop()).then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, facingMode, requireFacingMode, stableMs, elementId]);

  if (!active) return null;

  return (
    <div className="space-y-2">
      <div id={elementId} className="rounded-xl overflow-hidden bg-black/80 mx-auto" style={{ width: 260, height: 260 }} />
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}