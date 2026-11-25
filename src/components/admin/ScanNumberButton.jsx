import React, { Suspense, lazy, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ScanLine } from "lucide-react";

// The camera is a big download, so it loads only when the scanner opens.
const QrScanner = lazy(() => import("@/components/kiosk/QrScanner"));
// The same list as PART_CODES in QrScanner.jsx (copied to keep it lazy).
const PART_CODES = ["QR_CODE", "CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF"];

// A Scan button beside a part number box: the barcode or QR on a parts box
// or label fills the number in (onScan gets the text), so a part already on
// the shelf becomes a restock, the same as typing its number.
export default function ScanNumberButton({ onScan, className, compact = false }) {
  const [open, setOpen] = useState(false);
  const done = useRef(false);
  const start = () => { done.current = false; setOpen(true); };
  const decoded = (text) => {
    if (done.current) return;
    done.current = true;
    setOpen(false);
    onScan(text);
  };
  return (
    <>
      <Button type="button" variant="secondary" className={cn("shrink-0", className)} onClick={start} aria-label="Scan a barcode" title="Scan a barcode">
        <ScanLine className="h-5 w-5" aria-hidden="true" />{!compact && <span className="ml-1.5">Scan</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan the part's barcode</DialogTitle>
            <DialogDescription>Hold the barcode or QR on the box or label inside the box. It scans by itself.</DialogDescription>
          </DialogHeader>
          {open && (
            <Suspense fallback={<p role="status" className="py-10 text-center text-body-sm text-muted-foreground">Starting the camera…</p>}>
              <QrScanner active onDecode={decoded} formats={PART_CODES} box="wide" what="barcode" />
            </Suspense>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)}>Cancel</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
