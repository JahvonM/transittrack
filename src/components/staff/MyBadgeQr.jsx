import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrCode } from "lucide-react";
import { staffQrDataUrl } from "@/lib/qr";

// Lets a staff member without a physical NFC badge still use the bus
// boarding kiosk's "Scan QR" option — same QR a badge-registry kiosk would
// print/show them, just available any time from their own phone.
export default function MyBadgeQr({ userId }) {
  const [open, setOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    if (open && userId && !qrUrl) staffQrDataUrl(userId).then(setQrUrl);
  }, [open, userId, qrUrl]);

  if (!userId) return null;

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <QrCode className="w-4 h-4 mr-1.5" /> {open ? "Hide my badge" : "My badge QR"}
      </Button>
      {open && (
        <Card className="mt-2">
          <CardContent className="p-4 text-center space-y-2">
            {qrUrl && <img src={qrUrl} alt="Your badge QR code" className="mx-auto rounded-lg border" width={180} height={180} />}
            <p className="text-xs text-muted-foreground">Show this to the bus boarding kiosk to check in or out.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
