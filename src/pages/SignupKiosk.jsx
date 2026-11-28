import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Lock, MapPin, QrCode } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JoinQrImage } from "@/components/admin/signup/SignupDialogs";
import { IDLE_MS, KIOSK_KEY, POLL_MS, liveDraft, readKiosk, screenChanged } from "@/lib/signupKiosk";

const LocationPicker = lazy(() => import("@/components/directory/LocationPicker"));
const QrScanner = lazy(() => import("@/components/kiosk/QrScanner"));

// A sign-up day iPad (Admin → Sign-up day → Sign-up iPads). Staff sign
// themselves up: their details, their two codes, their pickup spot. What they
// type shows on the admin's screen as they type, and the admin decides what
// the iPad shows (functions signupKiosk).

const errorText = (e, fallback) => e?.response?.data?.error || e?.message || fallback;
const EMPTY = { name: "", email: "", phone: "", employee_id: "" };

function Shell({ hotel, children }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        {hotel?.logo_url && <img src={hotel.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />}
        <p className="text-title-sm font-semibold">{hotel?.name ? `${hotel.name} · Staff transport sign-up` : "Staff transport sign-up"}</p>
      </header>
      <main className="mx-auto w-full max-w-2xl px-6 py-8">{children}</main>
    </div>
  );
}

// Not connected yet: scan the QR on the admin's screen (or open its link).
function Connect({ onPaired }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pair = useCallback(async (raw) => {
    const code = String(raw || "").match(/pair=([A-Z0-9]{12})/i)?.[1] || String(raw || "").trim();
    if (!/^[A-Z0-9]{12}$/i.test(code) || busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await base44.functions.invoke("pairKioskDevice", { pairing_code: code.toUpperCase(), expected_type: "kiosk" });
      if (data?.kiosk_type !== "signup") throw new Error("That QR is for a different kind of tablet. Use the one under Sign-up iPads.");
      onPaired({ device_id: data.device_id, device_token: data.device_token });
    } catch (e) { setError(errorText(e, "That QR didn't work. Make a new one on the admin screen.")); }
    finally { setBusy(false); }
  }, [busy, onPaired]);
  // Opened from the QR's link: connect straight away.
  useEffect(() => {
    const m = window.location.hash.match(/pair=([A-Z0-9]{12})/i);
    if (m) { try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ } pair(m[1]); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell>
      <h1 className="text-display-sm font-bold">Connect this iPad</h1>
      <p className="mt-2 text-body-lg text-muted-foreground">On the admin computer, open Sign-up day, choose Sign-up iPads, then Add an iPad. Scan the QR it shows.</p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <Suspense fallback={<div className="h-72 animate-pulse bg-muted" />}><QrScanner active={!busy} onDecode={pair} what="QR" /></Suspense>
      </div>
      {busy && <p className="mt-4 flex items-center gap-2" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Connecting…</p>}
      {error && <p className="mt-4 text-danger" role="alert">{error}</p>}
    </Shell>
  );
}

// What the admin has put on screen, over everything else.
function AdminScreen({ screen, hotel }) {
  if (!screen || screen.kind === "none" || screen.kind === "start") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background p-8 text-center" role="dialog" aria-modal="true" aria-label="Message from the sign-up desk">
      {screen.kind === "company_code" && (
        <div>
          <p className="text-title-md text-muted-foreground">{hotel?.name || "Your company"} code</p>
          <p className="mt-4 font-mono text-[clamp(40px,9vw,96px)] font-bold tracking-[0.15em]">{screen.company_code}</p>
          {screen.text && <p className="mt-6 text-title-sm">{screen.text}</p>}
        </div>
      )}
      {screen.kind === "join_qr" && screen.company_code && (
        <div className="grid justify-items-center gap-4">
          <p className="text-title-lg font-semibold">Scan with your phone's camera</p>
          <JoinQrImage code={screen.company_code} hotel={hotel?.name} className="h-80 w-80" />
          <p className="text-title-sm text-muted-foreground">{screen.text || "It opens the app and joins you to your company."}</p>
        </div>
      )}
      {screen.kind === "message" && <p className="max-w-xl text-display-sm font-semibold">{screen.text || "Please see the sign-up desk."}</p>}
      {screen.kind === "lock" && (
        <div className="grid justify-items-center gap-4"><Lock className="h-16 w-16 text-muted-foreground" aria-hidden="true" /><p className="text-display-sm font-semibold">{screen.text || "Please wait. Someone will be with you shortly."}</p></div>
      )}
    </div>
  );
}

export default function SignupKiosk() {
  const [kiosk, setKiosk] = useState(() => readKiosk());
  const [hotel, setHotel] = useState(null);
  const [screen, setScreen] = useState(null);
  const [step, setStep] = useState("welcome"); // welcome | details | codes | pickup | done
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [pickup, setPickup] = useState({ lat: null, lng: null, name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastTouch = useRef(Date.now());
  const lastStart = useRef(null);

  const call = useCallback(async (action, extra = {}) => (await base44.functions.invoke("signupKiosk", { action, ...kiosk, ...extra })).data, [kiosk]);
  const reset = useCallback(() => { setStep("welcome"); setForm(EMPTY); setResult(null); setPickup({ lat: null, lng: null, name: "" }); setError(""); }, []);
  const paired = (k) => { try { localStorage.setItem(KIOSK_KEY, JSON.stringify(k)); } catch { /* private mode: this visit only */ } setKiosk(k); };

  // What the admin has put on screen, every couple of seconds.
  useEffect(() => {
    if (!kiosk) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const data = await call("state");
        if (stop) return;
        setHotel(data.hotel);
        // "Back to start" from the admin clears whoever was half-way through.
        if (data.screen?.kind === "start" && screenChanged(lastStart.current, data.screen)) reset();
        if (data.screen?.kind === "start") lastStart.current = data.screen.at;
        setScreen(data.screen);
      } catch (e) {
        if (e?.response?.data?.code === "NOT_PAIRED") { try { localStorage.removeItem(KIOSK_KEY); } catch { /* ignore */ } setKiosk(null); }
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [kiosk, call, reset]);

  // The admin's live view: the step and what is typed, a moment after typing stops.
  useEffect(() => {
    if (!kiosk) return undefined;
    const id = setTimeout(() => { call("live", liveDraft(step, form, pickup)).catch(() => {}); }, 400);
    return () => clearTimeout(id);
  }, [kiosk, call, step, form, pickup]);

  // Walked away: clear their details for the next person.
  useEffect(() => {
    const touch = () => { lastTouch.current = Date.now(); };
    window.addEventListener("pointerdown", touch); window.addEventListener("keydown", touch);
    const id = setInterval(() => { if (step !== "welcome" && Date.now() - lastTouch.current > IDLE_MS) reset(); }, 5000);
    return () => { window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); clearInterval(id); };
  }, [step, reset]);
  // The done screen goes back to the start by itself.
  useEffect(() => { if (step !== "done") return undefined; const id = setTimeout(reset, 25_000); return () => clearTimeout(id); }, [step, reset]);

  if (!kiosk) return <Connect onPaired={paired} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const register = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { setResult(await call("register", form)); setStep("codes"); }
    catch (err) { setError(errorText(err, "That didn't save. Check your details and try again.")); }
    finally { setBusy(false); }
  };
  const savePickup = async () => {
    setBusy(true); setError("");
    try { await call("pickup", { person_ref: result.person_ref, pickup_name: pickup.name, pickup_lat: pickup.lat, pickup_lng: pickup.lng }); setStep("done"); }
    catch (err) { setError(errorText(err, "That didn't save. Try again.")); }
    finally { setBusy(false); }
  };
  const first = form.name.trim().split(/\s+/)[0] || "";

  return (
    <Shell hotel={hotel}>
      <AdminScreen screen={screen} hotel={hotel} />
      {step === "welcome" && (
        <button type="button" onClick={() => setStep("details")} className="grid min-h-[60vh] w-full place-items-center rounded-3xl border-2 border-dashed border-border p-8 text-center">
          <span>
            <span className="block text-display-md font-bold">Get your staff bus</span>
            <span className="mt-3 block text-title-md text-muted-foreground">Tap here to sign up. It takes about two minutes.</span>
          </span>
        </button>
      )}

      {step === "details" && (
        <form onSubmit={register} className="space-y-5">
          <h1 className="text-display-sm font-bold">Your details</h1>
          {[["name", "Full name", "text", "name"], ["email", "Email address", "email", "email"], ["phone", "Phone number", "tel", "tel"], ["employee_id", "Staff number (if you have one)", "text", "off"]].map(([k, label, type, auto]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`kiosk-${k}`} className="text-title-sm">{label}</Label>
              <Input id={`kiosk-${k}`} type={type} autoComplete={auto} value={form[k]} onChange={set(k)} className="h-14 text-title-sm" required={k === "name" || k === "email"} />
            </div>
          ))}
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" className="h-14 px-8 text-title-sm" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null} Next</Button>
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={reset}>Start again</Button>
          </div>
        </form>
      )}

      {step === "codes" && result && (
        <div className="space-y-6">
          <h1 className="text-display-sm font-bold">{first ? `Thanks, ${first}` : "Thanks"}</h1>
          {result.sign_in_code ? (
            <div className="rounded-2xl border border-border p-5">
              <p className="text-title-sm">Your sign-in code</p>
              <p className="mt-2 font-mono text-[clamp(36px,8vw,72px)] font-bold tracking-[0.12em]">{result.sign_in_code}</p>
              <p className="mt-2 text-body-lg text-muted-foreground">On your phone, open the app, tap <b>I have a code from the sign-up iPad</b> and type this. Write it down or take a photo. It works once, for 7 days.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border p-5">
              <p className="text-title-sm">{result.existing ? "You already have an account" : "Your account"}</p>
              <p className="mt-2 text-body-lg text-muted-foreground">{result.existing ? <>Sign in on your phone with <b>{form.email}</b>.</> : <>Make your account on your phone with <b>{form.email}</b>.</>} You're on the hotel's list already.</p>
            </div>
          )}
          {result.company_code && (
            <div className="rounded-2xl border border-border p-5">
              <p className="text-title-sm">Company code</p>
              <p className="mt-2 font-mono text-[clamp(28px,6vw,52px)] font-bold tracking-[0.12em]">{result.company_code}</p>
              <p className="mt-2 text-body-lg text-muted-foreground">If the app asks for your company code, type this.</p>
            </div>
          )}
          <Button size="lg" className="h-14 px-8 text-title-sm" onClick={() => setStep("pickup")}><MapPin className="h-5 w-5" aria-hidden="true" /> Next: your pickup spot</Button>
        </div>
      )}

      {step === "pickup" && (
        <div className="space-y-4">
          <h1 className="text-display-sm font-bold">Where should the bus pick you up?</h1>
          <p className="text-body-lg text-muted-foreground">Search your area or tap the map, then give the spot a name, like "Shop by the church".</p>
          <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
            <LocationPicker lat={pickup.lat} lng={pickup.lng} showCoordinates={false}
              onChange={(lat, lng) => setPickup((p) => ({ ...p, lat, lng }))}
              onPlace={(place) => setPickup((p) => ({ ...p, name: p.name || place.name || "" }))} />
          </Suspense>
          <div className="space-y-1.5">
            <Label htmlFor="kiosk-pickup-name" className="text-title-sm">Name for this spot</Label>
            <Input id="kiosk-pickup-name" value={pickup.name} onChange={(e) => setPickup((p) => ({ ...p, name: e.target.value }))} className="h-14 text-title-sm" />
          </div>
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="h-14 px-8 text-title-sm" disabled={busy || pickup.lat == null || !pickup.name.trim()} onClick={savePickup}>Save my pickup spot</Button>
            <Button variant="outline" size="lg" className="h-14" onClick={() => setStep("done")}>Skip for now</Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="grid justify-items-center gap-5 text-center">
          <CheckCircle2 className="h-20 w-20 text-success" aria-hidden="true" />
          <h1 className="text-display-sm font-bold">You're signed up{first ? `, ${first}` : ""}</h1>
          {result?.sign_in_code && <p className="text-title-md">Your sign-in code: <span className="font-mono font-bold tracking-[0.12em]">{result.sign_in_code}</span></p>}
          {result?.company_code && (
            <>
              <p className="flex items-center gap-2 text-title-sm text-muted-foreground"><QrCode className="h-5 w-5" aria-hidden="true" /> Scan to get the app on your phone</p>
              <JoinQrImage code={result.company_code} hotel={hotel?.name} className="h-56 w-56" />
            </>
          )}
          <Button size="lg" variant="outline" className="h-14" onClick={reset}>Finish</Button>
        </div>
      )}
    </Shell>
  );
}
