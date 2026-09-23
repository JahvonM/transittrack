import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, Hash, ChevronLeft, CheckCircle2, LogIn, LogOut, AlertCircle, Delete, HelpCircle, MapPin, CloudUpload } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";
import { parseCodeQrPayload } from "@/lib/qr";
import { base44 } from "@/api/base44Client";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { enqueueCheckIn, queueLength, isNetworkFailure, flushQueue } from "@/lib/offlineQueue";
import QrScanner from "./QrScanner";
import SlideToUnlock from "./SlideToUnlock";

const CODE_MAX_LEN = 6;
const FLUSH_INTERVAL_MS = 15000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Avatar({ name, photoUrl }) {
  if (photoUrl) return <img src={photoUrl} alt={name} className="w-28 h-28 rounded-full object-cover mx-auto shadow-lg ring-4 ring-primary/10" />;
  const initials = (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary/25 to-primary/10 text-primary grid place-items-center mx-auto text-4xl font-bold shadow-lg ring-4 ring-primary/10">
      {initials}
    </div>
  );
}

// Wraps each screen so switching modes gets a soft fade+scale transition
// instead of an abrupt swap — cheap "feels designed" polish with no extra
// libraries, just tailwindcss-animate's utilities keyed on mode.
function Screen({ modeKey, className = "", children }) {
  return (
    <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden">
      <CardContent key={modeKey} className={`animate-in fade-in zoom-in-95 duration-300 ${className}`}>
        {children}
      </CardContent>
    </Card>
  );
}

// Speaks a short confirmation aloud on successful check-in — free, no
// hardware, and genuinely useful in a noisy boarding environment where
// someone might not be looking at the screen the instant they tap in.
function speak(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch { /* speech synthesis is a nice-to-have, never blocks check-in */ }
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
  const [unlocked, setUnlocked] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState("idle"); // idle | help | qr | code | confirm | result | badge_error
  const [pending, setPending] = useState(null); // { staff, next_status, method, code_type }
  const [result, setResult] = useState(null); // { staff_name, status, offline? }
  const [badgeError, setBadgeError] = useState("");
  const [code, setCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => queueLength());
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const resetTimer = useRef(null);

  const idleListening = unlocked && mode === "idle";
  const { supported: nfcSupported, listening: nfcListening, nfcError } = useNfcTap(
    (tag) => handleTag(tag),
    idleListening
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Retries anything queued while offline — on a timer, and immediately when
  // the browser reports connectivity is back, rather than waiting up to 15s.
  useEffect(() => {
    const tryFlush = () => {
      flushQueue(invoke).then((synced) => { if (synced) setPendingSyncCount(queueLength()); });
    };
    const t = setInterval(tryFlush, FLUSH_INTERVAL_MS);
    window.addEventListener("online", tryFlush);
    return () => { clearInterval(t); window.removeEventListener("online", tryFlush); };
  }, [invoke]);

  // Nearest-stop info for the idle screen — turns dead wait time into a
  // small piece of live journey status instead of a static welcome message.
  // This is straight-line distance to the closest stop on the vehicle's
  // assigned route, not a true "next in sequence" calculation (this app has
  // no stop-sequence tracking yet), so it's labeled "Nearest stop" rather
  // than implying route-aware precision it doesn't have.
  useEffect(() => {
    if (!device?.vehicle_id) return;
    const load = () => base44.entities.Vehicle.get(device.vehicle_id).then(setVehicle).catch(() => {});
    load();
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      if (event.data?.id === device.vehicle_id) setVehicle(event.data);
    });
    return unsub;
  }, [device?.vehicle_id]);

  useEffect(() => {
    if (!vehicle?.route_id) { setRoute(null); return; }
    let cancelled = false;
    base44.entities.Route.get(vehicle.route_id).then((r) => { if (!cancelled) setRoute(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [vehicle?.route_id]);

  const nearestStop = (() => {
    if (vehicle?.current_lat == null || !route?.stops?.length) return null;
    let best = null;
    let bestKm = Infinity;
    for (const s of route.stops) {
      if (s.lat == null || s.lng == null) continue;
      const km = haversineKm(vehicle.current_lat, vehicle.current_lng, s.lat, s.lng);
      if (km < bestKm) { bestKm = km; best = s; }
    }
    return best ? { name: best.name, mins: etaMinutes(bestKm) } : null;
  })();

  const resetSoon = (ms = 2500) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setMode("idle"); setPending(null); setResult(null); setBadgeError(""); setCode("");
    }, ms);
  };

  // An admin regenerating this tablet's pairing code (Admin → Kiosk Tablets)
  // revokes it server-side immediately, but this tablet won't notice until
  // its next 30s heartbeat. Recognize that specific failure here so a tap in
  // the gap shows a real explanation and recovers itself, instead of a
  // confusing "badge not registered"/"code not recognized" message.
  const handleUnpaired = (e) => {
    if (e?.response?.data?.error !== "Invalid or unpaired kiosk device") return false;
    setBadgeError("This tablet's pairing was reset — restarting…");
    setMode("badge_error");
    setTimeout(() => window.location.reload(), 2000);
    return true;
  };

  const handleTag = async (tag) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await invoke("lookup_tag", { card_tag: tag });
      setPending({ staff: res.staff, next_status: res.next_status, method: "nfc" });
      setMode("confirm");
    } catch (e) {
      if (handleUnpaired(e)) return;
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
    } catch (e) {
      if (handleUnpaired(e)) return;
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
    } catch (e) {
      if (handleUnpaired(e)) return;
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
    const payload = { staff_id: pending.staff.id, method: pending.method, code_type: pending.code_type, status };
    try {
      const res = await invoke("check_in", payload);
      const record = { staff_name: res.record.staff_name, status: res.record.status };
      setResult(record);
      setMode("result");
      speak(record.status === "boarded" ? `Welcome aboard, ${record.staff_name.split(" ")[0]}` : `See you later, ${record.staff_name.split(" ")[0]}`);
      resetSoon();
    } catch (e) {
      if (handleUnpaired(e)) return;
      // A network failure (never reached the server) doesn't have to cost
      // this person their check-in — queue it and let them walk away as if
      // it worked; a real rejection from the backend still shows the error.
      if (isNetworkFailure(e)) {
        setPendingSyncCount(enqueueCheckIn(payload));
        setResult({ staff_name: pending.staff.full_name, status, offline: true });
        setMode("result");
        speak(status === "boarded" ? `Welcome aboard, ${pending.staff.full_name.split(" ")[0]}` : `See you later, ${pending.staff.full_name.split(" ")[0]}`);
        resetSoon();
        return;
      }
      setBadgeError("Something went wrong checking that in — please try again.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <Screen modeKey="lock" className="p-10 text-center space-y-10">
        <div>
          <p className="text-7xl font-heading font-bold tabular-nums tracking-tight">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-base text-muted-foreground mt-2">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {device?.vehicle_name && <p className="text-xl font-semibold text-muted-foreground">{device.vehicle_name}</p>}
        <SlideToUnlock label="Slide to check in" onUnlock={() => setUnlocked(true)} />
      </Screen>
    );
  }

  if (mode === "confirm" && pending) {
    const suggestBoarding = pending.next_status === "boarded";
    return (
      <Screen modeKey="confirm" className="p-8 text-center space-y-5">
        <Avatar name={pending.staff.full_name} photoUrl={pending.staff.photo_url} />
        <p className="text-2xl font-bold">{pending.staff.full_name}</p>
        <p className="text-base text-muted-foreground">Are you boarding or exiting?</p>
        <div className="flex gap-3">
          <Button
            variant={suggestBoarding ? "default" : "outline"}
            className="flex-1 h-24 flex-col gap-1.5 rounded-2xl text-base"
            onClick={() => confirmCheckIn("boarded")}
            disabled={busy}
          >
            <LogIn className="w-8 h-8" />
            <span>Boarding</span>
          </Button>
          <Button
            variant={suggestBoarding ? "outline" : "default"}
            className="flex-1 h-24 flex-col gap-1.5 rounded-2xl text-base"
            onClick={() => confirmCheckIn("off_board")}
            disabled={busy}
          >
            <LogOut className="w-8 h-8" />
            <span>Exiting</span>
          </Button>
        </div>
        <Button variant="ghost" onClick={() => { setMode("idle"); setPending(null); }}>Cancel</Button>
      </Screen>
    );
  }

  if (mode === "result" && result) {
    const boarded = result.status === "boarded";
    return (
      <Card className={`rounded-3xl shadow-xl border-border/60 overflow-hidden bg-gradient-to-b ${boarded ? "from-emerald-500/15" : "from-sky-500/15"} to-transparent`}>
        <CardContent key="result" className="p-10 text-center space-y-4 animate-in fade-in zoom-in-90 duration-500">
          <div className={`mx-auto w-24 h-24 rounded-full grid place-items-center ${boarded ? "bg-emerald-500/15" : "bg-sky-500/15"} animate-in zoom-in spin-in-6 duration-500`}>
            <CheckCircle2 className={`w-14 h-14 ${boarded ? "text-emerald-500" : "text-sky-500"}`} />
          </div>
          <p className="text-3xl font-bold">{boarded ? `Welcome aboard, ${result.staff_name.split(" ")[0]}!` : `See you later, ${result.staff_name.split(" ")[0]}!`}</p>
          {result.offline && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <CloudUpload className="w-3.5 h-3.5" /> Saved offline — will sync automatically
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (mode === "badge_error") {
    return (
      <Screen modeKey="badge_error" className="p-10 text-center space-y-4">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 grid place-items-center">
          <AlertCircle className="w-11 h-11 text-destructive" />
        </div>
        <p className="text-base text-muted-foreground">{badgeError}</p>
      </Screen>
    );
  }

  if (mode === "qr") {
    return (
      <Screen modeKey="qr" className="p-5 space-y-4">
        <Button variant="ghost" onClick={() => setMode("help")}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
        <p className="text-base text-center text-muted-foreground">Show your QR code to the camera</p>
        <QrScanner active onDecode={handleQrDecode} />
      </Screen>
    );
  }

  if (mode === "code") {
    const press = (d) => setCode((prev) => (prev.length < CODE_MAX_LEN ? prev + d : prev));
    return (
      <Screen modeKey="code" className="p-6 space-y-5">
        <Button variant="ghost" onClick={() => { setMode("help"); setCode(""); }}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
        <p className="text-base text-center text-muted-foreground">Enter your code</p>
        <div className="flex justify-center gap-2.5">
          {Array.from({ length: Math.max(code.length, 4) }).map((_, i) => (
            <div key={i} className={`w-11 h-14 rounded-xl border-2 grid place-items-center text-2xl font-bold transition-colors ${i < code.length ? "border-primary bg-primary/5" : "border-border"}`}>
              {i < code.length ? "•" : ""}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button key={d} variant="outline" className="h-16 text-2xl rounded-2xl" onClick={() => press(d)} disabled={checkingCode}>{d}</Button>
          ))}
          <Button variant="outline" className="h-16 rounded-2xl" onClick={() => setCode("")} disabled={checkingCode}>Clear</Button>
          <Button variant="outline" className="h-16 text-2xl rounded-2xl" onClick={() => press("0")} disabled={checkingCode}>0</Button>
          <Button variant="outline" className="h-16 rounded-2xl" onClick={() => setCode((prev) => prev.slice(0, -1))} disabled={checkingCode}>
            <Delete className="w-6 h-6" />
          </Button>
        </div>
        <Button className="w-full h-14 text-base rounded-2xl" onClick={submitCode} disabled={!code || checkingCode}>
          {checkingCode ? "Checking…" : "Submit"}
        </Button>
      </Screen>
    );
  }

  if (mode === "help") {
    return (
      <Screen modeKey="help" className="p-8 text-center space-y-5">
        <Button variant="ghost" onClick={() => setMode("idle")}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
        <p className="font-semibold text-lg">How would you like to check in?</p>
        <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
          <Button variant="outline" className="h-16 text-base rounded-2xl" onClick={() => setMode("code")}>
            <Hash className="w-5 h-5 mr-2" /> Enter my code
          </Button>
          <Button variant="outline" className="h-16 text-base rounded-2xl" onClick={() => setMode("qr")}>
            <QrCode className="w-5 h-5 mr-2" /> Scan my QR code
          </Button>
        </div>
      </Screen>
    );
  }

  // idle — the welcome screen
  return (
    <Screen modeKey="idle" className="p-10 text-center space-y-8">
      <div>
        <p className="text-base text-muted-foreground">{greeting()}</p>
        <p className="text-3xl font-heading font-bold tracking-tight">
          Welcome{device?.vehicle_name ? ` aboard ${device.vehicle_name}` : ""}
        </p>
        {nearestStop && (
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Nearest stop: {nearestStop.name} · {formatEta(nearestStop.mins)}
          </p>
        )}
      </div>
      <div className="relative mx-auto w-36 h-36 grid place-items-center">
        {nfcListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <span className="absolute inset-3 rounded-full bg-primary/10 animate-ping [animation-delay:150ms]" />
          </>
        )}
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center shadow-inner">
          <CreditCard className={`w-16 h-16 text-primary ${nfcListening ? "animate-pulse" : ""}`} />
        </div>
      </div>
      <div>
        <p className="font-semibold text-xl">
          {nfcSupported ? "Tap your badge to check in" : "Scan your QR code or enter your code to check in"}
        </p>
        {nfcSupported && <p className="text-base text-muted-foreground mt-1">Hold your badge near this tablet</p>}
        {nfcError && <p className="text-sm text-destructive mt-2">{nfcError}</p>}
      </div>
      <Button variant="outline" className="h-14 px-6 text-base rounded-2xl" onClick={() => setMode("help")}>
        <HelpCircle className="w-5 h-5 mr-2" /> Don't have your badge?
      </Button>
      {pendingSyncCount > 0 && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <CloudUpload className="w-3.5 h-3.5" /> {pendingSyncCount} check-in{pendingSyncCount === 1 ? "" : "s"} waiting to sync
        </p>
      )}
    </Screen>
  );
}
