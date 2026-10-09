import "./boardingShowcase.css";
import BusArtwork from "@/components/BusArtwork";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useRef, useState } from "react";
import { helperLink } from "@/lib/helperHealth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, ChevronLeft, CheckCircle2, LogIn, LogOut, AlertCircle, Delete, MapPin, CloudUpload, PartyPopper, Bus, Users, Loader2 } from "lucide-react";
import { useNfcTap, reportBadgeResult } from "@/hooks/useNfcTap";
import { parseCodeQrPayload } from "@/lib/qr";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { submitSavedCheckIn, hasSavedCheckIn, queueLength, queueSyncError, isNetworkFailure, flushQueue } from "@/lib/offlineQueue";
import { noteStatus, burnOneTimeCode } from "@/lib/kioskOffline";
import { boardingDirectoryNames } from "@/lib/boardingDirectory";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WeatherWidget from "@/components/WeatherWidget";
import QrScanner from "./QrScanner";
import SlideToUnlock from "./SlideToUnlock";
import KioskMascot from "./KioskMascot";
import KioskConnectionBadge from "./KioskConnectionBadge";

const CODE_MAX_LEN = 12;
const FLUSH_INTERVAL_MS = 15000;

function safely(read, fallback) {
  try { return read(); } catch (e) { return typeof fallback === "string" ? e.message : fallback; }
}

function Avatar({ name, photoUrl }) {
  if (photoUrl) return <img src={photoUrl} alt={name} className="tt-passenger-photo w-28 h-28 rounded-2xl object-cover mx-auto shadow-lg ring-4 ring-primary/10" />;
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
    <Card data-mode={modeKey} className="rounded-3xl shadow-xl border-border/60 overflow-hidden">
      <CardContent key={modeKey} className={`animate-in fade-in zoom-in-95 duration-300 ${className}`}>
        {children}
      </CardContent>
    </Card>
  );
}

function TopStatusBar({ device, vehicle, route, now, online }) {
  return <header className="tt-board-header">
    <div className="tt-board-company" role="group" aria-label="Company banner">
      {device?.company_logo_url ? <img src={device.company_logo_url} alt="" /> : <Bus aria-hidden="true" />}
      <div><strong>{device?.company_name || "Bus boarding"}</strong><small>Welcome aboard</small></div>
    </div>
    <div className="tt-board-brand">TRANSIT<span>TRACK</span><small>YOUR JOURNEY, CONNECTED</small></div>
    <div className="tt-board-trip"><strong>{vehicle?.name || device?.vehicle_name || "Your bus"}</strong>
      {route?.name && <small>{route.name}</small>}
      <span>{now.toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "2-digit", minute: "2-digit" })}</span>
      <small>{now.toLocaleDateString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "short", month: "short", day: "numeric" })}</small>
      <KioskConnectionBadge online={online} />
    </div>
  </header>;
}

function InfoRail({ occupancy, vehicle, nearestStop, ads, todayCount, directoryInfo, now, onList, pendingSyncCount, syncError }) {
  return <aside className="tt-board-rail" aria-label="Bus information">
    <section className="tt-board-panel tt-board-occupancy"><p><Users size={16} /> Occupancy</p>
      <strong>{occupancy}<small>{vehicle?.capacity ? " / " + vehicle.capacity : ""}</small></strong>
      <div className="tt-board-meter"><i style={{width: vehicle?.capacity ? Math.min(100, occupancy / vehicle.capacity * 100) + "%" : "0%"}} /></div>
      <span>{todayCount ?? "—"} riders today</span>
    </section>
    <section className="tt-board-panel">
      {directoryInfo?.expires ? <button type="button" onClick={onList} aria-label={"Passenger list: " + directoryInfo.count + " cards"}>
        <p><CreditCard size={16} /> Passenger list</p>
        <strong>{directoryInfo.count} cards saved</strong>
        <small>{Date.parse(directoryInfo.expires) > now.getTime() ? "Ready for offline taps" : "Expired, connect to refresh"}</small>
        <small>Updated {new Date(directoryInfo.updated).toLocaleString([], {timeZone: TRANSIT_TIME_ZONE, month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} · See names</small>
      </button> : <><p><CreditCard size={16} /> Passenger list</p><small>Not downloaded. Connect to WiFi.</small></>}
    </section>
    <section className="tt-board-panel"><p>Local weather</p><WeatherWidget variant="hero" /></section>
    <section className="tt-board-panel"><p><MapPin size={16} /> Nearest stop</p><strong>{nearestStop?.name || "No stop location yet"}</strong>{nearestStop && <small>{formatEta(nearestStop.mins)}</small>}</section>
    <section className="tt-board-panel" role="status"><p><CloudUpload size={16} /> Saved check-ins</p><strong>{pendingSyncCount} waiting to sync</strong>{syncError && <small className="text-warning">{syncError}</small>}</section>
    {ads.length > 0 && <section className="tt-board-panel"><p>Announcements</p>{ads.map(ad => <div key={ad.id} className="tt-board-ad">{ad.image_url && <img src={ad.image_url} alt="" />}<div><strong>{ad.title}</strong>{ad.message && <small>{ad.message}</small>}</div></div>)}</section>}
  </aside>;
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

// The names saved on this tablet for offline card taps (no card numbers).
// Closes itself after a minute so it isn't left open for the next rider.
function PassengerListDialog({ open, onOpenChange, vehicleName }) {
  const names = open ? boardingDirectoryNames() : [];
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => onOpenChange(false), 60000);
    return () => clearTimeout(t);
  }, [open, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Cards saved on this tablet</DialogTitle>
          <DialogDescription>{names.length} passenger{names.length === 1 ? "" : "s"} can tap in on {vehicleName || "this bus"}, even without WiFi.</DialogDescription>
        </DialogHeader>
        {names.length ? (
          <ol className="max-h-[60vh] list-none space-y-1 overflow-y-auto p-0" aria-label="Passengers with cards">
            {names.map((n, i) => <li key={`${n}-${i}`} className="rounded-lg bg-secondary/60 px-3 py-2 text-body">{n}</li>)}
          </ol>
        ) : (
          <p className="text-body-sm text-muted-foreground">No passengers with cards for this bus yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// The boarding home keeps NFC, QR and code entry beside live bus information.
export default function BusBoardingKiosk({ invoke, device, directoryInfo, online }) {
  useFutureAppearance();
  const [unlocked, setUnlocked] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState("idle"); // idle | qr | confirm | result | badge_error
  const [qrHint, setQrHint] = useState("");
  const [qrRetryAt, setQrRetryAt] = useState(0);
  const qrCooldown = Math.max(0, Math.ceil((qrRetryAt - Date.now()) / 1000));
  const [pending, setPending] = useState(null); // { staff, next_status, method, code_type }
  const [result, setResult] = useState(null); // { staff_name, status, offline?, riderNumber? }
  const [badgeError, setBadgeError] = useState("");
  const [code, setCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  // True from the moment a card is tapped until the lookup answers, so the
  // screen reacts instantly even when the bus's connection is slow.
  const [checkingCard, setCheckingCard] = useState(false);
  // A damaged saved-check-ins list must not crash the boarding screen: the
  // error shows on the sync line and taps keep working.
  const [syncError, setSyncError] = useState(() => safely(queueSyncError, ""));
  const [pendingSyncCount, setPendingSyncCount] = useState(() => safely(queueLength, 0));
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [ads, setAds] = useState([]);
  const [todayCount, setTodayCount] = useState(null);
  const [occupancy, setOccupancy] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  // The reader helper stops reaching this screen when FreeKiosk's REST API
  // key or setting changes; say so instead of cards silently doing nothing.
  const [readerLink, setReaderLink] = useState(() => helperLink());
  useEffect(() => {
    const t = setInterval(() => setReaderLink(helperLink()), 30_000);
    return () => clearInterval(t);
  }, []);
  const resetTimer = useRef(null);
  // When the current card lookup started (0 = none). A lookup that never
  // answers (weak bus signal) must not block every tap after it.
  const lookupStarted = useRef(0);
  const qrMode = useRef(mode);
  qrMode.current = mode;

  // Web NFC needs the slide-to-unlock gesture before it can scan, but a USB
  // badge reader doesn't — so with one attached, a tap works straight from the
  // attract screen too. A new tap is also taken on the confirm, welcome and
  // error screens (it replaces what's showing), so a person who walks away
  // without pressing Boarding/Exiting can't leave the reader dead for the next.
  const idleListening = true;
  const { listening: nfcListening, nfcError } = useNfcTap(
    (tag) => handleTag(tag),
    idleListening,
    { webActive: unlocked && idleListening }
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  // Never leave "Checking your card" up if the connection hangs: a new tap is
  // accepted again after 12 s anyway (see handleTag).
  useEffect(() => {
    if (!checkingCard) return undefined;
    const t = setTimeout(() => setCheckingCard(false), 13000);
    return () => clearTimeout(t);
  }, [checkingCard]);

  // Nobody pressed Boarding/Exiting (or closed the QR camera)? Go back to
  // the start screen on its own.
  useEffect(() => {
    if (mode !== "confirm" && mode !== "qr") return undefined;
    const t = setTimeout(() => { setUnlocked(false); setMode("idle"); setPending(null); }, mode === "confirm" ? 25000 : 60000);
    return () => clearTimeout(t);
  }, [mode, pending]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Retries anything queued while offline — on a timer, and immediately when
  // the browser reports connectivity is back, rather than waiting up to 15s.
  useEffect(() => {
    const tryFlush = () => {
      // A storage problem while syncing in the background is shown on the
      // sync line, never as a full-screen error that would block the next
      // passenger (that screen has no button and never cleared itself).
      flushQueue(invoke).then(() => { setPendingSyncCount(queueLength()); setSyncError(queueSyncError()); }).catch((e) => { setSyncError(e.message); });
    };
    const t = setInterval(tryFlush, FLUSH_INTERVAL_MS);
    // Also on open: check-ins saved offline before a restart go up right away.
    const first = setTimeout(tryFlush, 3000);
    window.addEventListener("online", tryFlush);
    return () => { clearInterval(t); clearTimeout(first); window.removeEventListener("online", tryFlush); };
  }, [invoke]);

  // The paired heartbeat supplies only this bus's display context.
  useEffect(() => {
    const context = device?.context;
    if (!context) return;
    setVehicle(context.vehicle || null);
    setRoute(context.route || null);
    setAds(context.ads || []);
    setOccupancy(context.occupancy || 0);
    setTodayCount(context.today_count || 0);
  }, [device?.context]);

  // This is straight-line distance to the closest stop on the vehicle's
  // assigned route, not a true "next in sequence" calculation (this app has
  // no stop-sequence tracking yet), so it's labeled "Nearest stop" rather
  // than implying route-aware precision it doesn't have.
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
      setUnlocked(false); setMode("idle"); setPending(null); setResult(null); setBadgeError(""); setCode("");
    }, ms);
  };

  // An admin regenerating this tablet's pairing code (Admin → Kiosk Tablets)
  // revokes it server-side immediately, but this tablet won't notice until
  // its next 30s heartbeat. Recognize that specific failure here so a tap in
  // the gap shows a real explanation and recovers itself, instead of a
  // confusing "badge not registered"/"code not recognized" message.
  const handleUnpaired = (e) => {
    if (e?.response?.data?.error !== "Invalid or unpaired kiosk device") return false;
    // A tap can arrive on the lock screen; show the message over it.
    setUnlocked(true);
    setBadgeError("This tablet's pairing was reset — restarting…");
    setMode("badge_error");
    setTimeout(() => window.location.reload(), 2000);
    return true;
  };

  // "Wrong bus" / "no bus yet" from the server or the saved list.
  const busMessage = (e) => {
    // 429 counts as a "network failure" for queueing, so check it first.
    if (e?.response?.status === 429) return "Too many attempts. Try again in a minute.";
    if (e?.response?.data?.error === "verification_requires_connection" || isNetworkFailure(e)) return "Connect to WiFi to verify your card or code.";
    return ["wrong_bus", "no_bus"].includes(e?.response?.data?.error) ? e.response.data.message : "";
  };

  const handleTag = async (tag) => {
    if (lookupStarted.current && Date.now() - lookupStarted.current < 12000) return;
    lookupStarted.current = Date.now();
    setCheckingCard(true);
    clearTimeout(resetTimer.current);
    setResult(null);
    setBadgeError("");
    setBusy(true);
    try {
      const res = await invoke("lookup_tag", { card_tag: tag });
      setUnlocked(true);
      setPending({ staff: res.staff, next_status: res.next_status, method: "nfc", verification_grant: res.verification_grant, directory_grant:res.directory_grant, card_fingerprint:res.card_fingerprint });
      setMode("confirm");
      reportBadgeResult(true);
    } catch (e) {
      reportBadgeResult(false);
      if (handleUnpaired(e)) return;
      setUnlocked(true);
      setBadgeError(busMessage(e) || (e?.response?.data?.error === "badge_not_registered"
        ? "This card isn't registered yet. Ask an admin to issue it in Card issuing."
        : isNetworkFailure(e)
          ? "No connection, and this tablet hasn't saved the passenger list yet. Connect to WiFi once."
          : "Couldn't read that badge — try again."));
      setMode("badge_error");
      resetSoon(busMessage(e) ? 5000 : 3500);
    } finally {
      lookupStarted.current = 0;
      setCheckingCard(false);
      setBusy(false);
    }
  };

  const handleQrDecode = async (text) => {
    if (busy || mode !== "qr" || Date.now() < qrRetryAt || lookupStarted.current) return;
    const decoded = parseCodeQrPayload(text);
    if (!decoded) {
      // Anything that isn't a personal boarding code — a company join code, a
      // poster, another phone in the queue — is a code the scanner happened to
      // see, not the one being presented. Say so without leaving the camera,
      // so the scanner keeps waiting for the passenger's own code.
      setQrHint("That isn't a boarding QR. Open My Account → Bus boarding and show your permanent QR.");
      return;
    }
    lookupStarted.current = Date.now();
    setQrHint("");
    setBusy(true);
    try {
      const res = await invoke("lookup_code", { code: decoded });
      if (qrMode.current !== "qr") return;
      setUnlocked(true);
      setPending({ staff: res.staff, next_status: res.next_status, method: "qr", code_type: res.code_type, verification_grant: res.verification_grant });
      setMode("confirm");
    } catch (e) {
      if (qrMode.current !== "qr" || handleUnpaired(e)) return;
      // Keep the camera open on a rejected code or a connection failure.
      // Only a verified passenger should move this screen to confirmation.
      if (e?.response?.status === 429) setQrRetryAt(Date.now() + 60000);
      setQrHint(busMessage(e) || "That QR code isn't recognized. Show your boarding QR from My Account.");
    } finally {
      lookupStarted.current = 0;
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code || checkingCode) return;
    setCheckingCode(true);
    try {
      const res = await invoke("lookup_code", { code });
      setPending({ staff: res.staff, next_status: res.next_status, method: "code", code_type: res.code_type, verification_grant: res.verification_grant });
      setMode("confirm");
      setCode("");
    } catch (e) {
      if (handleUnpaired(e)) return;
      setBadgeError(busMessage(e) || "That code isn't recognized — check it and try again.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setCheckingCode(false);
    }
  };

  const confirmCheckIn = async (status) => {
    if (!pending || busy) return;
    setBusy(true);
    const payload = { expected_device_id:device.device_id||device.id, expected_company_id:device.company_id, expected_vehicle_id:device.vehicle_id, client_request_id: crypto.randomUUID(), occurred_at: new Date().toISOString(), staff_id: pending.staff.id, method: pending.method, code_type: pending.code_type, verification_grant: pending.verification_grant, directory_grant:pending.directory_grant, card_fingerprint:pending.card_fingerprint, status };
    try {
      const res = await submitSavedCheckIn(invoke, payload);
      const record = { staff_name: res.record.staff_name, status: res.record.status };
      noteStatus(payload.staff_id,status);
      if (Number.isFinite(res.occupancy)) setOccupancy(res.occupancy);
      if (Number.isFinite(res.today_count)) {
        setTodayCount(res.today_count);
        if (record.status === "boarded") record.riderNumber = res.today_count;
      }
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
        try {
          setPendingSyncCount(queueLength());
          if (!hasSavedCheckIn(payload.client_request_id)) throw new Error("This check-in couldn't be saved on the tablet. Please try again.");
        } catch (storageError) { setBadgeError(storageError.message); setMode("badge_error"); resetSoon(5000); return; }
        noteStatus(payload.staff_id, status);
        if (payload.code_type === "one_time") burnOneTimeCode(payload.staff_id);
        setResult({ staff_name: pending.staff.full_name, status, offline: true });
        setMode("result");
        speak(status === "boarded" ? `Welcome aboard, ${pending.staff.full_name.split(" ")[0]}` : `See you later, ${pending.staff.full_name.split(" ")[0]}`);
        resetSoon();
        return;
      }
      setBadgeError(busMessage(e) || "Something went wrong checking that in — please try again.");
      setMode("badge_error");
      resetSoon(3000);
    } finally {
      setBusy(false);
    }
  };

  let actionContent;

  if ((!unlocked && mode === "idle") || mode === "qr") {
    actionContent = <section className="tt-board-home" aria-label="Boarding home">
      <div className="tt-board-scene">
        <div className="tt-board-welcome"><h1>Welcome aboard</h1><p>Tap your card to begin</p></div>
        <BusArtwork vehicle={vehicle} fallbackUrl="/images/boarding-coaster.webp" width={650} className="tt-board-bus" />
        <div className="tt-board-nfc"><div className="tt-board-nfc-ring"><CreditCard aria-hidden="true" /></div><strong>NFC CARD TAP</strong><small>{nfcListening ? "Ready to scan" : "Tap your NFC card"}</small></div>
        {nfcError && <p className="tt-board-reader-note">{nfcError}</p>}
      </div>
      <div className="tt-board-entry">
        <div className="tt-board-slide"><p>Prefer to use your code?</p><SlideToUnlock label="Slide to enter a code" onUnlock={() => { setUnlocked(true); setMode("idle"); }} /></div>
        <section className="tt-board-qr" aria-label="Home QR scanner">
          {mode === "qr" ? <><QrScanner compact active={qrCooldown === 0} onDecode={handleQrDecode} facingMode="user" requireFacingMode stableMs={800} />
            <button type="button" onClick={() => {setMode("idle"); setUnlocked(false); setQrHint("");}}>Close camera</button>
            {qrCooldown > 0 && <p role="status">Scanning paused. Try again in {qrCooldown} seconds with your boarding QR.</p>}
            {busy ? <p role="status">Checking your code…</p> : qrHint && <p role="status">{qrHint}</p>}
          </> : <button type="button" className="tt-board-qr-start" onClick={() => {clearTimeout(resetTimer.current); setQrHint(""); setMode("qr");}}><QrCode aria-hidden="true" /><span><strong>Scan QR code</strong><small>Show your boarding QR to the camera</small></span></button>}
        </section>
      </div>
    </section>;
  } else if (mode === "confirm" && pending) {
    // Highlight the suggested action while keeping both existing choices.
    const boarding = pending.next_status === "boarded";
    actionContent = (
      <Screen modeKey="confirm" className="p-8 text-center space-y-4">
        {/* A little card flies in and "taps" down before the person's info
            appears — reinforces the physical action that just happened
            instead of jumping straight to a static result. Only for a real
            NFC tap; QR/code entry has no physical tap to echo. */}
        {pending.method === "nfc" && (
          <div className="mx-auto w-16 h-11 rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-lg grid place-items-center animate-in slide-in-from-top-20 fade-in duration-500">
            <CreditCard className="w-6 h-6 text-primary-foreground" />
          </div>
        )}
        <p className="tt-board-id-label">PASSENGER IDENTIFICATION</p><Avatar name={pending.staff.full_name} photoUrl={pending.staff.photo_url} />
        <p className="text-2xl font-bold">{pending.staff.full_name}</p><p className="tt-board-id-bus">Passenger · {device?.vehicle_name || "This bus"}</p>
        <p className="text-base text-muted-foreground">
          {boarding ? "You're not on this bus yet." : `You're recorded as being on ${device?.vehicle_name || "this bus"}.`}
        </p>
        <p className="text-sm text-muted-foreground">Are you boarding or exiting?</p>
        <div className="flex gap-3">
          <Button variant={boarding ? "default" : "outline"} className="flex-1 h-28 flex-col gap-1.5 rounded-2xl text-lg" onClick={() => confirmCheckIn("boarded")} disabled={busy}><LogIn className="w-9 h-9" /><span>Boarding</span></Button>
          <Button variant={boarding ? "outline" : "default"} className="flex-1 h-28 flex-col gap-1.5 rounded-2xl text-lg" onClick={() => confirmCheckIn("off_board")} disabled={busy}><LogOut className="w-9 h-9" /><span>Exiting</span></Button>
        </div>
        <Button variant="ghost" onClick={() => { setUnlocked(false); setMode("idle"); setPending(null); }}>Cancel</Button>
      </Screen>
    );
  } else if (mode === "result" && result) {
    const boarded = result.status === "boarded";
    actionContent = (
      <Card className={`rounded-3xl shadow-xl border-border/60 overflow-hidden bg-gradient-to-b ${boarded ? "from-success/15" : "from-info/15"} to-transparent`}>
        <CardContent key="result" className="p-10 text-center space-y-4 animate-in fade-in zoom-in-90 duration-500">
          {boarded && (
            <div className="flex justify-center -mb-2">
              <BusArtwork vehicle={vehicle} width={220} className="h-32 tt-bus-arrive" />
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <div className={`w-24 h-24 rounded-full grid place-items-center ${boarded ? "bg-success/15" : "bg-info/15"} animate-in zoom-in spin-in-6 duration-500`}>
              <CheckCircle2 className={`w-14 h-14 ${boarded ? "text-success" : "text-info"}`} />
            </div>
            {boarded && <KioskMascot mood="cheer" size={72} />}
          </div>
          <p className="text-3xl font-bold">{boarded ? `Welcome aboard, ${result.staff_name.split(" ")[0]}!` : `See you later, ${result.staff_name.split(" ")[0]}!`}</p>
          {boarded && result.riderNumber > 0 && (
            <p className="text-sm font-medium text-primary flex items-center justify-center gap-1.5">
              <PartyPopper className="w-4 h-4" /> You're rider #{result.riderNumber} today!
            </p>
          )}
          {result.offline && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <CloudUpload className="w-3.5 h-3.5" /> Saved offline — will sync automatically
            </p>
          )}
        </CardContent>
      </Card>
    );
  } else if (mode === "badge_error") {
    actionContent = (
      <Screen modeKey="badge_error" className="p-10 text-center space-y-4">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 grid place-items-center">
          <AlertCircle className="w-11 h-11 text-destructive" />
        </div>
        <p className="text-base text-muted-foreground">{badgeError}</p>
      </Screen>
    );
  } else {
    const press = (d) => setCode(prev => prev.length < CODE_MAX_LEN ? prev + d : prev);
    actionContent = <Screen modeKey="idle" className="tt-board-keypad p-5 text-center space-y-3">
      <Button variant="ghost" onClick={() => {setUnlocked(false); setCode(""); setMode("idle");}}><ChevronLeft size={18} /> Back</Button>
      <h1 className="text-xl font-bold">Enter your boarding code</h1>
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-1 max-w-xs mx-auto">
            {Array.from({ length: Math.max(code.length, 4) }).map((_, i) => (
              <div key={i} className={`w-10 h-12 lg:w-11 lg:h-14 [@media(max-height:700px)]:!h-10 rounded-xl border-2 grid place-items-center text-xl lg:text-2xl font-bold transition-colors ${i < code.length ? "border-primary bg-primary/5" : "border-border"}`}>
                {i < code.length ? "•" : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button key={d} variant="outline" className="h-14 [@media(max-height:700px)]:h-11 text-xl rounded-2xl" onClick={() => press(d)} disabled={checkingCode}>{d}</Button>
            ))}
            <Button variant="outline" className="h-14 [@media(max-height:700px)]:h-11 rounded-2xl" onClick={() => setCode("")} disabled={checkingCode}>Clear</Button>
            <Button variant="outline" className="h-14 [@media(max-height:700px)]:h-11 text-xl rounded-2xl" onClick={() => press("0")} disabled={checkingCode}>0</Button>
            <Button variant="outline" className="h-14 [@media(max-height:700px)]:h-11 rounded-2xl" onClick={() => setCode((prev) => prev.slice(0, -1))} disabled={checkingCode} aria-label="Delete last digit">
              <Delete className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
          <Button className="w-full max-w-xs mx-auto h-12 text-base rounded-2xl" onClick={submitCode} disabled={!code || checkingCode}>
            {checkingCode ? "Checking…" : "Submit code"}
          </Button>
        </div>

    </Screen>;
  }

  return <div className="tt-boarding-future tt-boarding-showcase">
    <TopStatusBar device={device} vehicle={vehicle} route={route} now={now} online={online} />
    <PassengerListDialog open={listOpen} onOpenChange={setListOpen} vehicleName={device?.vehicle_name} />
    {readerLink === "lost" && <div className="tt-board-reader-warning" role="alert"><strong>Card reader isn't connected to this screen.</strong> Use your code on the keypad instead.<small>Staff: run Update in the tablet setup tool for this tablet.</small></div>}
    <main className="tt-board-layout"><div className="tt-board-action">{actionContent}</div>
      <InfoRail occupancy={occupancy} vehicle={vehicle} nearestStop={nearestStop} ads={ads} todayCount={todayCount} directoryInfo={directoryInfo} now={now} onList={() => setListOpen(true)} pendingSyncCount={pendingSyncCount} syncError={syncError} />
    </main>
    {checkingCard && <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm" role="status" aria-live="polite"><div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-10 py-8 shadow-lg"><Loader2 className="w-12 h-12 animate-spin text-primary" /><p className="text-2xl font-semibold">Checking your card…</p></div></div>}
  </div>;
}
