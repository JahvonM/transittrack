import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { codeQrDataUrl } from "@/lib/qr";

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// "I forgot my badge" — generates a code good for one check-in at the bus
// boarding kiosk, shown both as digits (for the keypad) and a QR (for the
// scanner) since they're the same underlying one-time code either way.
// Separate from the permanent access_code the badge registry kiosk assigns.
export default function OneTimeCode() {
  const [state, setState] = useState(null); // { code, expires_at } | "error" | null
  const [qrUrl, setQrUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state && state !== "error") codeQrDataUrl(state.code).then(setQrUrl);
  }, [state]);

  const generate = async () => {
    setLoading(true);
    setQrUrl("");
    try {
      const res = await base44.functions.invoke("generateOneTimeCode", {});
      setState(res.data);
    } catch {
      setState("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
        <KeyRound className="w-4 h-4 mr-1.5" /> {loading ? "Generating…" : "Forgot your badge?"}
      </Button>
      {state === "error" && (
        <p className="text-xs text-destructive mt-1.5">Couldn't generate a code — try again.</p>
      )}
      {state && state !== "error" && (
        <Card className="mt-2">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">{state.code}</p>
            {qrUrl && <img src={qrUrl} alt="Check-in QR code" className="mx-auto rounded-lg border" width={160} height={160} />}
            <p className="text-xs text-muted-foreground">
              Type this or scan the QR at the bus boarding kiosk. Good until {formatTime(state.expires_at)}, one use only.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
