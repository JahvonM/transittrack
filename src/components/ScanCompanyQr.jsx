import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { codeFromJoinQr } from "@/lib/companyJoin";

// The camera scanner is a big download (about a third of what the app used to
// load at start-up, because the sign-in page shows this button). It now loads
// only when someone actually opens the scanner.
const QrScanner = lazy(() => import("@/components/kiosk/QrScanner"));

// A camera pop-up for the company join QR. It closes by itself on the first
// valid company QR and hands the code to onCode; any other QR is refused.
export function ScanCompanyQrDialog({ open, onOpenChange, onCode }) {
  const [error, setError] = useState("");
  const done = useRef(false);
  useEffect(() => { if (open) { done.current = false; setError(""); } }, [open]);

  const onDecode = (text) => {
    if (done.current) return;
    const code = codeFromJoinQr(text);
    if (!code) { setError("That QR code isn't a company code. Try the QR your bus company gave you."); return; }
    done.current = true;
    onOpenChange(false);
    onCode(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan your company QR</DialogTitle>
          <DialogDescription>Point your camera at the QR code from your bus company. It scans by itself.</DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<p role="status" className="py-10 text-center text-body-sm text-muted-foreground">Starting the camera…</p>}>
            <QrScanner active onDecode={onDecode} />
          </Suspense>
        )}
        {error && <p role="alert" className="text-center text-body-sm text-danger">{error}</p>}
        <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}

export function ScanCompanyQrButton({ onClick, className, disabled }) {
  return (
    <Button type="button" variant="outline" className={className} onClick={onClick} disabled={disabled}>
      <QrCode className="h-4 w-4" aria-hidden="true" /> Scan company QR code
    </Button>
  );
}
