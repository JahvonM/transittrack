import { useSupportCameraReserved } from "@/lib/nativeTabletSupport";
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import createQrScanGate from "@/components/kiosk/qrScanGate";

// Camera lifetime is independent of the parent's clock and request updates.
export default function QrScanner({ onDecode, active, facingMode = "environment", requireFacingMode = false, stableMs = 0, compact = false }) {
  const supportCameraReserved = useSupportCameraReserved();
  const elementId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active || supportCameraReserved) return;
    let stopped = false;
    let delivering = false;
    let lastText="",lastAt=0;
    setError("");
    const gate = createQrScanGate({ stableMs, warmupMs: stableMs > 0 ? 1000 : 0 });
    // Decoder settings belong to the constructor, not start(). Limit this
    // QR scanner to QR codes so ordinary barcodes cannot trigger a lookup.
    const scanner = new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: false,
      verbose: false,
    });
    scannerRef.current = scanner;
    const started = scanner.start(
      { facingMode: requireFacingMode ? { exact: facingMode } : facingMode },
      { fps: 10, qrbox: compact ? ((w, h) => ({width: Math.min(160, Math.floor(Math.min(w,h)*0.7)), height: Math.min(160, Math.floor(Math.min(w,h)*0.7))})) : 220 },
      async (decodedText) => {
        if (stopped || delivering || (decodedText===lastText && Date.now()-lastAt<5000) || !gate.read(decodedText, Date.now())) return;
        lastText=decodedText;lastAt=Date.now();
        // Synchronous lock plus the latest callback: a slow lookup cannot
        // start overlapping requests using an old copy of busy=false.
        delivering = true;
        try { await onDecodeRef.current?.(decodedText); }
        catch { setError("Could not check that QR. Hold it steady and try again."); }
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
  }, [active, supportCameraReserved, facingMode, requireFacingMode, stableMs, elementId, compact]);

  if (!active) return null;
  if (supportCameraReserved) return <p role="status" className="p-3 text-sm">QR camera paused while native camera capture is active. Card taps and keypad remain available.</p>;

  return (
    <div className="space-y-2">
      <div id={elementId} className="rounded-xl overflow-hidden bg-black/80 mx-auto" style={{ width: compact ? "100%" : 260, height: compact ? 180 : 260 }} />
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}