import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companyJoinUrl } from "@/lib/companyJoin";

// "Show QR" for a company's passenger access code. Scanning it opens the
// app's /join page with the code filled in; anyone holding the QR can join,
// exactly as with the code itself.
export default function CompanyJoinQr({ code, companyName, size = "sm" }) {
  const [open, setOpen] = useState(false);
  const [png, setPng] = useState("");

  useEffect(() => {
    if (!open || !code) return;
    QRCode.toDataURL(companyJoinUrl(code), { width: 560, margin: 2 }).then(setPng).catch(() => setPng(""));
  }, [open, code]);

  const fileName = `${(companyName || "company").replace(/[^a-z0-9]+/gi, "-")}-passenger-QR.png`;
  const print = () => {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const title = String(companyName || "Your bus company").replace(/[<>&"]/g, "");
    w.document.write(`<!doctype html><title>${title} QR</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0 0 8px">${title}</h1><p style="margin:0 0 24px;font-size:18px">Scan with your phone camera to see when your bus arrives.</p>
      <img src="${png}" width="420" height="420" alt="" /><p style="margin-top:16px;color:#555">TransitTrack</p>
      <script>window.onload=()=>{window.print();}</script></body>`);
    w.document.close();
  };

  if (!code) return null;
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4" /> Show QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Passenger QR code</DialogTitle>
            <DialogDescription>
              Passengers scan this with their phone camera, sign in, and join {companyName || "your company"} without typing the code. Anyone with this QR can join, the same as with the code.
            </DialogDescription>
          </DialogHeader>
          <div className="grid place-items-center rounded-xl bg-white p-4">
            {png ? <img src={png} alt={`QR code to join ${companyName || "the company"}`} className="h-64 w-64" /> : <div className="h-64 w-64 animate-pulse rounded-lg bg-muted" />}
          </div>
          <p className="text-center text-caption text-muted-foreground">Making a new access code makes this QR stop working.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" disabled={!png}>
              <a href={png || undefined} download={fileName}><Download className="h-4 w-4" /> Download</a>
            </Button>
            <Button onClick={print} disabled={!png}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
