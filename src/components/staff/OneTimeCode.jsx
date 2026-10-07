import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound, RefreshCw } from "lucide-react";
import { codeQrDataUrl } from "@/lib/qr";
import { errorData, httpStatus } from "@/lib/requestError";

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Only one code is ever live per person and it stays good for half an hour, so
// the sheet shows the code already issued instead of asking for a fresh one
// every time it opens. Opening it three times used to use up the whole
// allowance, and after that no code could be made at all.
const heldKey = (userId) => `tt_checkin_code_${userId}`;

function heldCode(userId) {
  try {
    const held = JSON.parse(sessionStorage.getItem(heldKey(userId)) || "null");
    return held?.code && Date.parse(held.expires_at) > Date.now() ? held : null;
  } catch { return null; }
}

function holdCode(userId, code) {
  try { sessionStorage.setItem(heldKey(userId), JSON.stringify(code)); } catch { /* ignore */ }
}

// The server explains itself ("Too many code requests. Try again later."),
// which is more use than a blanket line about the connection.
function reason(error) {
  return errorData(error)?.error
    || (httpStatus(error) === 429 ? "Too many code requests just now. Please wait a few minutes." : "Couldn't get a code. Check your connection.");
}

// "I forgot my badge" — generates a code good for one check-in at the bus
// boarding kiosk, shown both as digits (for the keypad) and a QR (for the
// scanner) since they're the same underlying one-time code either way.
// Separate from the permanent access_code the badge registry kiosk assigns.
export default function OneTimeCode({ autoGenerate = false }) {
  const { user } = useAuth();
  const [state, setState] = useState(null); // { code, expires_at } | null
  const [problem, setProblem] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (state) codeQrDataUrl(state.code).then(setQrUrl); }, [state]);

  const generate = async () => {
    if (!user?.id) return;
    setLoading(true);
    setQrUrl("");
    setProblem("");
    try {
      const res = await base44.functions.invoke("generateOneTimeCode", {});
      setState(res.data);
      holdCode(user.id, res.data);
    } catch (error) {
      setProblem(reason(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const held = heldCode(user.id);
    if (held) setState(held);
    else if (autoGenerate) generate();
  }, [autoGenerate, user?.id]);

  return (
    <div>
      {!state && (autoGenerate ? (
        loading && <p className="text-sm text-muted-foreground text-center py-6">Getting your code…</p>
      ) : (
        <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
          <KeyRound className="w-4 h-4 mr-1.5" /> {loading ? "Generating…" : "Forgot your badge?"}
        </Button>
      ))}
      {problem && (
        <div className="text-center space-y-2 py-2">
          <p className="text-sm text-destructive">{problem}</p>
          <Button size="sm" variant="outline" onClick={generate} disabled={loading}>Try again</Button>
        </div>
      )}
      {state && (
        <Card className="mt-2">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">{state.code}</p>
            {qrUrl && <img src={qrUrl} alt="Check-in QR code" className="mx-auto rounded-lg border" width={160} height={160} />}
            <p className="text-xs text-muted-foreground">
              Type this or scan the QR at the bus boarding kiosk. Good until {formatTime(state.expires_at)}, one use only.
            </p>
            <Button size="sm" variant="ghost" onClick={generate} disabled={loading}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {loading ? "Getting a new one…" : "New code"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}