import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, ChevronLeft, CheckCircle2, LogIn, LogOut, AlertCircle, Delete, MapPin, CloudUpload, PartyPopper, Bus, Users } from "lucide-react";
import { useNfcTap } from "@/hooks/useNfcTap";
import { parseCodeQrPayload } from "@/lib/qr";
import { base44 } from "@/api/base44Client";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { computeOccupancy } from "@/lib/occupancy";
import { enqueueCheckIn, queueLength, isNetworkFailure, flushQueue } from "@/lib/offlineQueue";
import WeatherWidget from "@/components/WeatherWidget";
import QrScanner from "./QrScanner";
import SlideToUnlock from "./SlideToUnlock";
import KioskMascot from "./KioskMascot";

const CODE_MAX_LEN = 6;
const FLUSH_INTERVAL_MS = 15000;
const ATTRACT_INTERVAL_MS = 7000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// A single static (non-interactive) map image centered on the vehicle, used
// purely as ambient backdrop texture on big-tablet layouts — deliberately
// NOT the full interactive MapboxMap component, which renders its own
// zoom/satellite/fullscreen controls that would float uselessly (and
// confusingly) over a background nobody can actually tap.
function staticMapBackgroundUrl(lat, lng) {
  if (lat == null || lng == null || !MAPBOX_TOKEN) return null;
  const styleId = MAPBOX_STYLE.replace("mapbox://styles/", "");
  // Mapbox's Static Images API caps width/height at 1280 each (the @2x
  // modifier then doubles the actual rendered resolution to 2560x1600).
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${lng},${lat},13,0/1280x800@2x?access_token=${MAPBOX_TOKEN}`;
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

// Persistent header across every mode — company identity, vehicle, live
// clock, occupancy, and sync status always visible instead of being buried
// inside whichever card happens to be showing.
function TopStatusBar({ device, vehicle, now, occupancy, pendingSyncCount }) {
  return (
    <div className="w-full flex items-center gap-3 px-5 sm:px-8 py-3 bg-card/70 backdrop-blur-md border-b border-border/60">
      {device?.company_logo_url ? (
        <img src={device.company_logo_url} alt="" className="w-10 h-10 rounded-xl object-cover shadow shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center shadow shrink-0">
          <Bus className="w-5 h-5 text-primary-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate">{device?.company_name || "Bus boarding"}</p>
        {device?.vehicle_name && <p className="text-xs text-muted-foreground truncate">{device.vehicle_name}</p>}
      </div>
      <div className="flex-1" />
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
        <Users className="w-4 h-4" /> {occupancy}{vehicle?.capacity ? `/${vehicle.capacity}` : ""}
      </div>
      {pendingSyncCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
          <CloudUpload className="w-3.5 h-3.5" /> {pendingSyncCount}
        </div>
      )}
      <p className="font-bold tabular-nums shrink-0">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

// Persistent right-hand rail on big screens only — occupancy, nearest stop,
// weather, and any active company ads, all visible at once instead of
// rotating through a single line inside the action card. Hidden below the
// `lg` breakpoint, where the idle screen's own attract-mode rotation covers
// the same ground since there's no room for a separate column.
function InfoRail({ occupancy, vehicle, nearestStop, ads, todayCount }) {
  return (
    <div className="hidden lg:flex lg:w-80 xl:w-96 flex-col gap-4 shrink-0 max-h-full overflow-y-auto">
      <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
          <Users className="w-4 h-4" /> Occupancy
        </div>
        <p className="text-4xl font-bold">
          {occupancy}
          {vehicle?.capacity ? <span className="text-lg text-muted-foreground font-normal"> / {vehicle.capacity}</span> : null}
        </p>
        {todayCount > 0 && <p className="text-xs text-muted-foreground mt-1">{todayCount} rider{todayCount === 1 ? "" : "s"} today so far</p>}
      </div>
      {nearestStop && (
        <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
            <MapPin className="w-4 h-4" /> Nearest stop
          </div>
          <p className="text-lg font-bold truncate">{nearestStop.name}</p>
          <p className="text-sm text-muted-foreground">{formatEta(nearestStop.mins)}</p>
        </div>
      )}
      <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5 flex justify-center">
        <WeatherWidget variant="hero" />
      </div>
      {ads.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md p-5 space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Announcements</p>
          {ads.map((ad) => (
            <div key={ad.id} className="flex items-center gap-3">
              {ad.image_url && <img src={ad.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{ad.title}</p>
                {ad.message && <p className="text-xs text-muted-foreground truncate">{ad.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

// bus_boarding kiosk: three ways in, all reachable without a click-through
// chooser screen — NFC tap keeps listening in the background the whole time
// idle, the keypad is always on-screen (not hidden behind a "don't have
// your badge?" step), and QR scanning is one tap away via a small link.
// After identifying someone, they're asked
// explicitly whether they're boarding or exiting — the system's guess
// (based on their last recorded state) is only a highlighted suggestion,
// never the only option, since a missed tap or skipped stop would otherwise
// leave no way to correct it.
//
// Layout: this component owns the full viewport (see Kiosk.jsx) rather than
// sitting in a small centered card, so a big tablet doesn't end up mostly
// empty space — a persistent top bar and, on large screens, a live info
// rail (occupancy/weather/ads) fill the room around the actual check-in card.
export default function BusBoardingKiosk({ invoke, device }) {
  const [unlocked, setUnlocked] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState("idle"); // idle | qr | confirm | result | badge_error
  const [pending, setPending] = useState(null); // { staff, next_status, method, code_type }
  const [result, setResult] = useState(null); // { staff_name, status, offline?, riderNumber? }
  const [badgeError, setBadgeError] = useState("");
  const [code, setCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => queueLength());
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [ads, setAds] = useState([]);
  const [todayCount, setTodayCount] = useState(null);
  const [occupancy, setOccupancy] = useState(0);
  const [attractSlide, setAttractSlide] = useState(0);
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

  // Vehicle + route power the nearest-stop line, the map backdrop, and the
  // occupancy capacity fraction — one live subscription feeds all three.
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

  // Live headcount for this vehicle — same aggregation the admin/driver
  // views use, so the number always agrees everywhere it's shown.
  useEffect(() => {
    if (!device?.vehicle_id) return;
    const load = () => {
      base44.entities.StaffCheckIn.filter({ vehicle_id: device.vehicle_id }, "-created_date", 300).then((list) => {
        setOccupancy(computeOccupancy(list, device.vehicle_id));
      }).catch(() => {});
    };
    load();
    const unsub = base44.entities.StaffCheckIn.subscribe((event) => {
      if (event.data?.vehicle_id === device.vehicle_id) load();
    });
    return unsub;
  }, [device?.vehicle_id]);

  // Active ads for the idle screen's attract-mode rotation (small screens)
  // and the info rail (large screens) — same Advertisement entity the
  // passenger home screen already uses.
  useEffect(() => {
    base44.entities.Advertisement.list("order").then((list) => setAds((list || []).filter((a) => a.active))).catch(() => setAds([]));
  }, []);

  // Today's boarded-so-far count for this vehicle — powers the "N riders
  // today" line and the playful "you're rider #N!" on a successful boarding.
  const refreshTodayCount = () => {
    if (!device?.vehicle_id) return;
    base44.entities.StaffCheckIn.filter({ vehicle_id: device.vehicle_id, status: "boarded" }, "-created_date", 300)
      .then((list) => setTodayCount((list || []).filter((r) => new Date(r.created_date) >= startOfToday()).length))
      .catch(() => {});
  };
  useEffect(() => {
    if (!device?.vehicle_id) return;
    refreshTodayCount();
    const unsub = base44.entities.StaffCheckIn.subscribe((event) => {
      if (event.data?.vehicle_id === device.vehicle_id) refreshTodayCount();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.vehicle_id]);

  // Attract mode (small screens only — large screens have the permanent
  // info rail instead): while nobody's interacting, the top of the idle
  // screen slowly rotates through the welcome message, live weather, and
  // any active company ads. Never touches the tap-to-check-in icon or the
  // help button below it, so it can't get in the way of actually checking
  // in. Resets to the welcome slide every time the kiosk returns to idle.
  useEffect(() => {
    if (mode !== "idle") return;
    setAttractSlide(0);
    const t = setInterval(() => setAttractSlide((s) => s + 1), ATTRACT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [mode]);

  const attractSlides = [
    { type: "welcome" },
    { type: "weather" },
    ...ads.map((ad) => ({ type: "ad", ad })),
  ];
  const currentAttractSlide = attractSlides[attractSlide % attractSlides.length];

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
      // Rider number is a fun extra, never a blocker — computed only for a
      // confirmed, synchronous success, and only for boarding (an exit isn't
      // "rider #N").
      if (record.status === "boarded" && device?.vehicle_id) {
        base44.entities.StaffCheckIn.filter({ vehicle_id: device.vehicle_id, status: "boarded" }, "-created_date", 300)
          .then((list) => {
            const n = (list || []).filter((r) => new Date(r.created_date) >= startOfToday()).length;
            setResult((prev) => (prev && prev.staff_name === record.staff_name ? { ...prev, riderNumber: n } : prev));
          })
          .catch(() => {});
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

  let actionContent;

  if (!unlocked) {
    actionContent = (
      <Screen modeKey="lock" className="p-10 text-center space-y-10">
        <div>
          <p className="text-7xl lg:text-8xl font-heading font-bold tabular-nums tracking-tight">
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
  } else if (mode === "confirm" && pending) {
    const suggestBoarding = pending.next_status === "boarded";
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
  } else if (mode === "result" && result) {
    const boarded = result.status === "boarded";
    actionContent = (
      <Card className={`rounded-3xl shadow-xl border-border/60 overflow-hidden bg-gradient-to-b ${boarded ? "from-emerald-500/15" : "from-sky-500/15"} to-transparent`}>
        <CardContent key="result" className="p-10 text-center space-y-4 animate-in fade-in zoom-in-90 duration-500">
          <div className="flex items-center justify-center gap-3">
            <div className={`w-24 h-24 rounded-full grid place-items-center ${boarded ? "bg-emerald-500/15" : "bg-sky-500/15"} animate-in zoom-in spin-in-6 duration-500`}>
              <CheckCircle2 className={`w-14 h-14 ${boarded ? "text-emerald-500" : "text-sky-500"}`} />
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
  } else if (mode === "qr") {
    actionContent = (
      <Screen modeKey="qr" className="p-5 space-y-4">
        <Button variant="ghost" onClick={() => setMode("idle")}><ChevronLeft className="w-5 h-5 mr-1" /> Back</Button>
        <p className="text-base text-center text-muted-foreground">Show your QR code to the camera</p>
        <QrScanner active onDecode={handleQrDecode} facingMode="user" />
      </Screen>
    );
  } else {
    // idle — the home screen. NFC tap keeps listening in the background the
    // whole time; the keypad below is always visible instead of hidden
    // behind a chooser step, and QR scanning is one tap away via a small
    // link. Large screens keep the header simple (the info rail covers
    // weather/ads/nearest-stop); small screens rotate the same info through
    // here instead, since there's no room for a side rail.
    const vehicleName = device?.vehicle_name;
    const press = (d) => setCode((prev) => (prev.length < CODE_MAX_LEN ? prev + d : prev));
    actionContent = (
      <Screen modeKey="idle" className="p-8 lg:p-10 text-center space-y-6">
        <div className="min-h-[60px] flex flex-col items-center justify-center">
          <div className="hidden lg:block animate-in fade-in duration-500">
            <p className="text-sm text-muted-foreground">{greeting()}</p>
            <p className="text-2xl xl:text-3xl font-heading font-bold tracking-tight">
              Welcome{vehicleName ? ` aboard ${vehicleName}` : ""}
            </p>
          </div>
          <div key={attractSlide} className="lg:hidden animate-in fade-in duration-500">
            {currentAttractSlide.type === "welcome" && (
              <>
                <p className="text-base text-muted-foreground">{greeting()}</p>
                <p className="text-3xl font-heading font-bold tracking-tight">
                  Welcome{vehicleName ? ` aboard ${vehicleName}` : ""}
                </p>
                {nearestStop && (
                  <p className="text-sm text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Nearest stop: {nearestStop.name} · {formatEta(nearestStop.mins)}
                  </p>
                )}
                {todayCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{todayCount} rider{todayCount === 1 ? "" : "s"} today so far</p>
                )}
              </>
            )}
            {currentAttractSlide.type === "weather" && (
              <div className="scale-125">
                <WeatherWidget variant="hero" />
              </div>
            )}
            {currentAttractSlide.type === "ad" && (
              <div className="flex items-center gap-3">
                {currentAttractSlide.ad.image_url && (
                  <img src={currentAttractSlide.ad.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shadow" />
                )}
                <div className="text-left">
                  <p className="font-semibold">{currentAttractSlide.ad.title}</p>
                  {currentAttractSlide.ad.message && <p className="text-sm text-muted-foreground">{currentAttractSlide.ad.message}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative w-20 h-20 lg:w-24 lg:h-24 grid place-items-center">
            {nfcListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <span className="absolute inset-2 rounded-full bg-primary/10 animate-ping [animation-delay:150ms]" />
              </>
            )}
            <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center shadow-inner">
              <CreditCard className={`w-9 h-9 lg:w-10 lg:h-10 text-primary ${nfcListening ? "animate-pulse" : ""}`} />
            </div>
            <div className="absolute -bottom-1 -right-1">
              <KioskMascot mood="wave" size={32} />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {nfcSupported ? "Tap your badge, or enter your code below" : "Enter your code below"}
          </p>
          {nfcError && <p className="text-xs text-destructive">{nfcError}</p>}
        </div>

        <div className="space-y-3">
          <div className="flex justify-center gap-2">
            {Array.from({ length: Math.max(code.length, 4) }).map((_, i) => (
              <div key={i} className={`w-10 h-12 lg:w-11 lg:h-14 rounded-xl border-2 grid place-items-center text-xl lg:text-2xl font-bold transition-colors ${i < code.length ? "border-primary bg-primary/5" : "border-border"}`}>
                {i < code.length ? "•" : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button key={d} variant="outline" className="h-14 text-xl rounded-2xl" onClick={() => press(d)} disabled={checkingCode}>{d}</Button>
            ))}
            <Button variant="outline" className="h-14 rounded-2xl" onClick={() => setCode("")} disabled={checkingCode}>Clear</Button>
            <Button variant="outline" className="h-14 text-xl rounded-2xl" onClick={() => press("0")} disabled={checkingCode}>0</Button>
            <Button variant="outline" className="h-14 rounded-2xl" onClick={() => setCode((prev) => prev.slice(0, -1))} disabled={checkingCode}>
              <Delete className="w-5 h-5" />
            </Button>
          </div>
          <Button className="w-full max-w-xs mx-auto h-12 text-base rounded-2xl" onClick={submitCode} disabled={!code || checkingCode}>
            {checkingCode ? "Checking…" : "Submit code"}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMode("qr")}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <QrCode className="w-4 h-4" /> Scan QR code instead
        </button>

        {pendingSyncCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <CloudUpload className="w-3.5 h-3.5" /> {pendingSyncCount} check-in{pendingSyncCount === 1 ? "" : "s"} waiting to sync
          </p>
        )}
      </Screen>
    );
  }

  const bgUrl = staticMapBackgroundUrl(vehicle?.current_lat, vehicle?.current_lng);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-primary/15 via-background to-background">
      {bgUrl && (
        <div className="absolute inset-0">
          <img src={bgUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-background/85 backdrop-blur-md" />
        </div>
      )}
      <div className="relative z-10 flex flex-col min-h-screen">
        <TopStatusBar device={device} vehicle={vehicle} now={now} occupancy={occupancy} pendingSyncCount={pendingSyncCount} />
        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 p-6 lg:p-10">
          <div className="w-full max-w-md lg:max-w-xl">
            {actionContent}
          </div>
          <InfoRail occupancy={occupancy} vehicle={vehicle} nearestStop={nearestStop} ads={ads} todayCount={todayCount} />
        </div>
      </div>
    </div>
  );
}
