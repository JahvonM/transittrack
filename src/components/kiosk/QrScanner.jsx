import { useSupportCameraReserved } from "@/lib/nativeTabletSupport";
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { startQrCamera } from "./qrCamera";
import createQrScanGate from "@/components/kiosk/qrScanGate";

// Which codes a scanner reads. QR only unless a screen asks for more: the
// Workshop's part scanner also reads the barcodes on parts boxes and labels.
const QR_ONLY = ["QR_CODE"];
export const PART_CODES = ["QR_CODE", "CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF"];

// Camera lifetime is independent of the parent's clock and request updates.
// box "wide" is a short, wide scan box for barcodes; what names the code in
// messages ("QR" or "barcode").
export default function QrScanner({ onDecode, active, facingMode = "environment", requireFacingMode = false, stableMs = 0, compact = false, formats = QR_ONLY, box = "square", what = "QR", keepWhenPaused = false }) {
  const supportCameraReserved = useSupportCameraReserved();
  const elementId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const cameraLifecycle=useRef(Promise.resolve());
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active || supportCameraReserved) return;
    let stopped = false;
    let delivering = false;
    let lastText="",lastAt=0;
    setError("");
    const gate = createQrScanGate({ stableMs, warmupMs: stableMs > 0 ? 1000 : 0, maxGapMs: requireFacingMode ? 350 : 1500 });
    // Decoder settings belong to the constructor, not start(). By default a
    // QR scanner reads QR codes only, so ordinary barcodes cannot trigger a
    // lookup.
    let scanner;
    const wide = box === "wide";
    const started = cameraLifecycle.current.catch(()=>{}).then(()=>{
    if(stopped)return;
    scanner = new Html5Qrcode(elementId, {
      formatsToSupport: formats.map((f) => Html5QrcodeSupportedFormats[f]).filter((f) => f !== undefined),
      useBarCodeDetectorIfSupported: false,
      verbose: false,
    });
    scannerRef.current = scanner;
    // The scanner refuses a scan box under 50px, which a tablet can ask for
    // while its layout is still settling (e.g. switching to full screen).
    return startQrCamera(scanner, facingMode, requireFacingMode,
      { fps: 10, qrbox: wide ? ((w, h) => ({ width: Math.max(50, Math.floor(w * 0.92)), height: Math.max(50, Math.min(160, Math.floor(h * 0.6))) })) : compact ? ((w, h) => ({width: Math.max(50, Math.min(240, Math.floor(Math.min(w,h)*0.85))), height: Math.max(50, Math.min(240, Math.floor(Math.min(w,h)*0.85)))})) : 220 },
      async (decodedText) => {
        if (stopped || delivering || (decodedText===lastText && Date.now()-lastAt<5000) || !gate.read(decodedText, Date.now())) return;
        lastText=decodedText;lastAt=Date.now();
        // Synchronous lock plus the latest callback: a slow lookup cannot
        // start overlapping requests using an old copy of busy=false.
        delivering = true;
        try { await onDecodeRef.current?.(decodedText); }
        catch { setError(`Could not check that ${what}. Hold it steady and try again.`); }
        finally { delivering = false; }
      },
      () => gate.miss(Date.now())
    );
    });
    started.then(() => { if (!stopped) gate.start(Date.now()); }, () => {});
    started.catch((e) => {
      if (stopped) return;
      const raw = e?.message || e?.name || (typeof e === "string" ? e : "");
      setError(/permission|denied|notallowed/i.test(raw)
        ? (what === "QR" ? "Camera access is blocked on this tablet. Allow camera access, then tap Scan QR code again." : "Camera access is blocked on this device. Allow camera access, then tap Try camera again.")
        : requireFacingMode && /constraint|notfound/i.test(raw)
          ? "The screen-facing camera isn't available. Check the tablet's camera settings."
          : raw || "Couldn't start the camera on this device.");
    });

    // stop() throws if the camera never started, so wait for start first;
    // this also turns off a camera that opens after the scanner was closed.
    return () => {
      stopped = true;
      cameraLifecycle.current=started.catch(()=>{}).then(async()=>{if(scanner?.isScanning)await scanner.stop();scanner?.clear();}).catch(()=>{});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, supportCameraReserved, facingMode, requireFacingMode, stableMs, elementId, compact, retry, box, formats.join(",")]);

  // A scanner that is paused (active false, still on the page) keeps its
  // element until the camera has stopped: removing it while the camera is
  // starting interrupts the video's play() with an unhandled error.
  if (!active && !keepWhenPaused) return null;
  if (supportCameraReserved && active) return <p role="status" className="p-3 text-sm">{what === "QR" ? "QR camera paused while native camera capture is active. Card taps and keypad remain available." : "The camera is busy with another recording. Type the number instead."}</p>;

  return (
    <div className="relative" hidden={!active}>
      <div id={elementId} className="rounded-xl overflow-hidden bg-black/80 mx-auto" style={{ width: compact || box === "wide" ? "100%" : 260, height: box === "wide" ? 220 : compact ? 180 : 260 }} />
      {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto rounded-xl bg-background/95 p-3 text-center"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => setRetry(v => v + 1)}>Try camera again</Button></div>}
    </div>
  );
}