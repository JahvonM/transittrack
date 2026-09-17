import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, QrCode, Search, ChevronLeft, CheckCircle2, LogIn, LogOut, AlertCircle } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";
import { parseStaffQrPayload } from "@/lib/qr";
import QrScanner from "./QrScanner";

// bus_boarding kiosk: three ways in, one shared confirm/result flow.
// "idle" mode auto-listens for an NFC tap (when the tablet supports Web
// NFC) while also offering QR and manual-search buttons.
export default function BusBoardingKiosk({ invoke }) {
  const [mode, setMode] = useState("idle"); // idle | qr | manual | confirm | result | badge_error
  const [pending, setPending] = useState(null); // { staff, next_status, method }
  const [result, setResult] = useState(null); // { staff_name, status }
  const [badgeError, setBadgeError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef(null);
  const resetTimer = useRef(null);

  const idleListening = mode === "idle";
  const { supported: nfcSupported, listening: nfcListening, nfcError } = useNfcTap(
    (tag) => handleTag(tag),
    idleListening
  );

  useEffect(() => () => { clearTimeout(searchTimer.current); clearTimeout(resetTimer.current); }, []);

  const resetSoon = (ms = 2500) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setMode("idle"); setPending(null); setResult(null); setBadgeError("");
      setQuery(""); setMatches([]);
    }, ms);
  };

  const handleTag = async (tag) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await invoke("lookup_tag", { card_tag: tag });
      setPending({ staff: res.staff, next_status: res.next_status, method: "nfc" });
      setMode("confirm");
    } catch (e) {
      setBadgeError(e?.response?.data?.error === "badge_not_registered"
        ? "This badge isn't registered yet. Ask an admin to enroll it at the badge registry kiosk."
        : "Couldn't read that badge — try again.");
      setMode("badge_error");
      resetSoon(3500);
    } finally {
      setBusy(false);
    }
  };

  const handleQrDecode = async (text) => {
    const staffId = parseStaffQrPayload(text);
    if (!staffId || busy) return;
    setBusy(true);
    try {
      const res = await invoke("lookup_qr", { staff_id: staffId });
      setPending({ staff: res.staff, next_status: res.next_status, method: "qr" });
      setMode("confirm");
    } catch {
      setBadgeError("That QR code isn't recognized.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setBusy(false);
    }
  };

  const runSearch = (value) => {
    setQuery(value);
    clearTimeout(searchTimer.current);
    if (!value.trim()) { setMatches([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setMatches((await invoke("search_staff", { query: value.trim() })).staff || []); }
      catch { setMatches([]); }
    }, 250);
  };

  const confirmCheckIn = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await invoke("check_in", { staff_id: pending.staff.id, method: pending.method });
      setResult({ staff_name: res.record.staff_name, status: res.record.status });
      setMode("result");
      resetSoon();
    } finally {
      setBusy(false);
    }
  };

  const pickManual = async (staff) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await invoke("check_in", { staff_id: staff.id, method: "manual" });
      setResult({ staff_name: res.record.staff_name, status: res.record.status });
      setMode("result");
      resetSoon();
    } finally {
      setBusy(false);
    }
  };

  if (mode === "confirm" && pending) {
    const checkingIn = pending.next_status === "boarded";
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <div className={`mx-auto w-16 h-16 rounded-full grid place-items-center ${checkingIn ? "bg-emerald-500/15 text-emerald-500" : "bg-sky-500/15 text-sky-500"}`}>
            {checkingIn ? <LogIn className="w-8 h-8" /> : <LogOut className="w-8 h-8" />}
          </div>
          <div>
            <p className="text-lg font-semibold">{pending.staff.full_name}</p>
            <p className="text-sm text-muted-foreground">{checkingIn ? "Check in to this bus?" : "Check out of this bus?"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setMode("idle"); setPending(null); }}>Cancel</Button>
            <Button className="flex-1" onClick={confirmCheckIn} disabled={busy}>{checkingIn ? "Check in" : "Check out"}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === "result" && result) {
    const boarded = result.status === "boarded";
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className={`w-14 h-14 mx-auto ${boarded ? "text-emerald-500" : "text-sky-500"}`} />
          <p className="text-xl font-semibold">{boarded ? `Welcome aboard, ${result.staff_name.split(" ")[0]}!` : `See you later, ${result.staff_name.split(" ")[0]}!`}</p>
        </CardContent>
      </Card>
    );
  }

  if (mode === "badge_error") {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
          <p className="text-sm text-muted-foreground">{badgeError}</p>
        </CardContent>
      </Card>
    );
  }

  if (mode === "qr") {
    return (
      <Card>
        <CardContent className="p-5 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <p className="text-sm text-center text-muted-foreground">Show your badge QR code to the camera</p>
          <QrScanner active onDecode={handleQrDecode} />
        </CardContent>
      </Card>
    );
  }

  if (mode === "manual") {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Input autoFocus value={query} onChange={(e) => runSearch(e.target.value)} placeholder="Type your name…" />
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {matches.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => pickManual(s)}
                className="w-full text-left p-3 rounded-lg border hover:bg-accent flex items-center gap-2"
              >
                <span className="font-medium">{s.full_name}</span>
              </button>
            ))}
            {query.trim() && matches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No matches.</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // idle
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-5">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 grid place-items-center">
          <CreditCard className={`w-9 h-9 text-primary ${nfcListening ? "animate-pulse" : ""}`} />
        </div>
        <div>
          <p className="font-semibold text-lg">
            {nfcSupported ? "Tap your badge" : "Scan your QR badge or enter your name"}
          </p>
          <p className="text-sm text-muted-foreground">
            {nfcSupported ? "Hold your badge near this tablet" : "NFC tap isn't supported on this device"}
          </p>
          {nfcError && <p className="text-xs text-destructive mt-1">{nfcError}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setMode("qr")}>
            <QrCode className="w-4 h-4 mr-1.5" /> Scan QR
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setMode("manual")}>
            <Search className="w-4 h-4 mr-1.5" /> Enter name
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
