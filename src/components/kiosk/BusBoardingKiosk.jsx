import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, Hash, ChevronLeft, CheckCircle2, LogIn, LogOut, AlertCircle, Delete, HelpCircle } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";
import { parseCodeQrPayload } from "@/lib/qr";
import QrScanner from "./QrScanner";

const CODE_MAX_LEN = 6;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Avatar({ name, photoUrl }) {
  if (photoUrl) return <img src={photoUrl} alt={name} className="w-16 h-16 rounded-full object-cover mx-auto" />;
  const initials = (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-16 h-16 rounded-full bg-primary/15 text-primary grid place-items-center mx-auto text-xl font-bold">
      {initials}
    </div>
  );
}

// bus_boarding kiosk: three ways in (NFC tap, QR scan, keypad code), one
// shared confirm/result flow. "idle" is a welcome screen that auto-listens
// for an NFC tap (when the tablet supports Web NFC); everything else lives
// behind a single "Don't have your badge?" entry point so the primary
// screen stays uncluttered. After identifying someone, they're asked
// explicitly whether they're boarding or exiting — the system's guess
// (based on their last recorded state) is only a highlighted suggestion,
// never the only option, since a missed tap or skipped stop would otherwise
// leave no way to correct it.
export default function BusBoardingKiosk({ invoke, device }) {
  const [mode, setMode] = useState("idle"); // idle | help | qr | code | confirm | result | badge_error
  const [pending, setPending] = useState(null); // { staff, next_status, method, code_type }
  const [result, setResult] = useState(null); // { staff_name, status }
  const [badgeError, setBadgeError] = useState("");
  const [code, setCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const resetTimer = useRef(null);

  const idleListening = mode === "idle";
  const { supported: nfcSupported, listening: nfcListening, nfcError } = useNfcTap(
    (tag) => handleTag(tag),
    idleListening
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const resetSoon = (ms = 2500) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setMode("idle"); setPending(null); setResult(null); setBadgeError(""); setCode("");
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
    const decoded = parseCodeQrPayload(text);
    if (!decoded || busy) return;
    setBusy(true);
    try {
      const res = await invoke("lookup_code", { code: decoded });
      setPending({ staff: res.staff, next_status: res.next_status, method: "qr", code_type: res.code_type });
      setMode("confirm");
    } catch {
      setBadgeError("That QR code isn't recognized — it may have expired or already been used.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code || checkingCode) return;
    setCheckingCode(true);
    try {
      const res = await invoke("lookup_code", { code });
      setPending({ staff: res.staff, next_status: res.next_status, method: "code", code_type: res.code_type });
      setMode("confirm");
      setCode("");
    } catch {
      setBadgeError("That code isn't recognized — check it and try again.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setCheckingCode(false);
    }
  };

  const confirmCheckIn = async (status) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await invoke("check_in", { staff_id: pending.staff.id, method: pending.method, code_type: pending.code_type, status });
      setResult({ staff_name: res.record.staff_name, status: res.record.status });
      setMode("result");
      resetSoon();
    } catch {
      setBadgeError("Something went wrong checking that in — please try again.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setBusy(false);
    }
  };

  if (mode === "confirm" && pending) {
    const suggestBoarding = pending.next_status === "boarded";
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <Avatar name={pending.staff.full_name} photoUrl={pending.staff.photo_url} />
          <p className="text-lg font-semibold">{pending.staff.full_name}</p>
          <p className="text-sm text-muted-foreground">Are you boarding or exiting?</p>
          <div className="flex gap-2">
            <Button
              variant={suggestBoarding ? "default" : "outline"}
              className="flex-1 h-14 flex-col gap-0.5"
              onClick={() => confirmCheckIn("boarded")}
              disabled={busy}
            >
              <LogIn className="w-5 h-5" />
              <span className="text-sm">Boarding</span>
            </Button>
            <Button
              variant={suggestBoarding ? "outline" : "default"}
              className="flex-1 h-14 flex-col gap-0.5"
              onClick={() => confirmCheckIn("off_board")}
              disabled={busy}
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm">Exiting</span>
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setMode("idle"); setPending(null); }}>Cancel</Button>
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
          <Button variant="ghost" size="sm" onClick={() => setMode("help")}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <p className="text-sm text-center text-muted-foreground">Show your QR code to the camera</p>
          <QrScanner active onDecode={handleQrDecode} />
        </CardContent>
      </Card>
    );
  }

  if (mode === "code") {
    const press = (d) => setCode((prev) => (prev.length < CODE_MAX_LEN ? prev + d : prev));
    return (
      <Card>
        <CardContent className="p-5 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setMode("help"); setCode(""); }}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <p className="text-sm text-center text-muted-foreground">Enter your code</p>
          <div className="flex justify-center gap-2">
            {Array.from({ length: Math.max(code.length, 4) }).map((_, i) => (
              <div key={i} className={`w-9 h-11 rounded-lg border-2 grid place-items-center text-xl font-bold ${i < code.length ? "border-primary" : "border-border"}`}>
                {i < code.length ? "•" : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button key={d} variant="outline" className="h-14 text-xl" onClick={() => press(d)} disabled={checkingCode}>{d}</Button>
            ))}
            <Button variant="outline" className="h-14" onClick={() => setCode("")} disabled={checkingCode}>Clear</Button>
            <Button variant="outline" className="h-14 text-xl" onClick={() => press("0")} disabled={checkingCode}>0</Button>
            <Button variant="outline" className="h-14" onClick={() => setCode((prev) => prev.slice(0, -1))} disabled={checkingCode}>
              <Delete className="w-5 h-5" />
            </Button>
          </div>
          <Button className="w-full" onClick={submitCode} disabled={!code || checkingCode}>
            {checkingCode ? "Checking…" : "Submit"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "help") {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <p className="font-semibold">How would you like to check in?</p>
          <div className="grid grid-cols-1 gap-2 max-w-xs mx-auto">
            <Button variant="outline" className="h-14" onClick={() => setMode("code")}>
              <Hash className="w-4 h-4 mr-1.5" /> Enter my code
            </Button>
            <Button variant="outline" className="h-14" onClick={() => setMode("qr")}>
              <QrCode className="w-4 h-4 mr-1.5" /> Scan my QR code
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // idle — the welcome screen
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <p className="text-2xl font-heading font-semibold">
            Welcome{device?.vehicle_name ? ` aboard ${device.vehicle_name}` : ""}
          </p>
        </div>
        <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 grid place-items-center">
          <CreditCard className={`w-11 h-11 text-primary ${nfcListening ? "animate-pulse" : ""}`} />
        </div>
        <div>
          <p className="font-semibold text-lg">
            {nfcSupported ? "Tap your badge to check in" : "Scan your QR code or enter your code to check in"}
          </p>
          {nfcSupported && <p className="text-sm text-muted-foreground">Hold your badge near this tablet</p>}
          {nfcError && <p className="text-xs text-destructive mt-1">{nfcError}</p>}
        </div>
        <Button variant="outline" onClick={() => setMode("help")}>
          <HelpCircle className="w-4 h-4 mr-1.5" /> Don't have your badge?
        </Button>
      </CardContent>
    </Card>
  );
}
