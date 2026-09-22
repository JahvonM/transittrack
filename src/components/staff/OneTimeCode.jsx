import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// "I forgot my badge" — generates a code good for one check-in at the bus
// boarding kiosk's keypad, in place of an NFC tap or QR scan. Separate from
// MyBadgeQr's code, which is permanent; this one expires and is single-use.
export default function OneTimeCode() {
  const [state, setState] = useState(null); // { code, expires_at } | "error" | null
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
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
          <CardContent className="p-4 text-center space-y-1.5">
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">{state.code}</p>
            <p className="text-xs text-muted-foreground">
              Type this on the bus boarding kiosk's keypad. Good until {formatTime(state.expires_at)}, one use only.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
