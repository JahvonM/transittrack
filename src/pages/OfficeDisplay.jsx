import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CloudOff, Link2, Loader2, MonitorOff, Pause, Play, Radio, TriangleAlert, WifiOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatAge } from "@/components/system/status";
import {
  LAYOUT_NAMES, baseFontPx, clock, connection, forgetToken, readStoredToken, retryDelay, rotation, storeToken,
} from "@/lib/officeDisplay";
import { BigButton, Chip, ScreenMessage, useNow } from "@/components/display/DisplayParts";
import { DispatchLayout, FleetLayout, MaintenanceLayout } from "@/components/display/DisplayLayouts";
import { CamerasLayout } from "@/components/display/DisplayCameras";
import { cn } from "@/lib/utils";

// /display and /display/pair: an office monitor or TV.
//
// A display never uses anyone's sign-in. On a monitor connected to the
// Windows app, the app hands this page a display credential through its own
// bridge (window.transittrackDisplay); on another computer or a TV browser,
// pairing with a code from Office displays stores one here. Either way the
// server decides what the screen receives (officeDisplay function).

const fnCall = async (action, extra = {}) => (await base44.functions.invoke("officeDisplay", { action, ...extra })).data;
const statusOf = (e) => e?.status || e?.response?.status || 0;
const storage = () => { try { return window.localStorage; } catch { return null; } };
const desktop = () => (typeof window !== "undefined" ? window.transittrackDisplay || null : null);

// The page's text size follows the screen (and the display's Text size).
function useScreenScale(textSize) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    const apply = () => { root.style.fontSize = `${baseFontPx(window.innerWidth, window.innerHeight, textSize)}px`; };
    apply();
    window.addEventListener("resize", apply);
    return () => { window.removeEventListener("resize", apply); root.style.fontSize = before; };
  }, [textSize]);
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

// One request per screen covers every panel. Retries back off; waking up,
// coming back online or the window regaining focus checks straight away.
function useDisplayFeed(token) {
  const [s, setS] = useState({ feed: null, lastOkAt: 0, failures: 0, ended: "" });
  const kick = useRef(() => {});
  useEffect(() => {
    setS({ feed: null, lastOkAt: 0, failures: 0, ended: "" });
    if (!token) return undefined;
    let alive = true, timer = null, busy = false, failures = 0;
    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(run, ms); };
    async function run() {
      if (!alive || busy) return;
      busy = true;
      try {
        const data = await fnCall("feed", { display_token: token });
        if (!alive) return;
        failures = 0;
        setS({ feed: data, lastOkAt: Date.now(), failures: 0, ended: "" });
        schedule(Math.min(60_000, Math.max(5_000, Number(data?.next_feed_ms) || 15_000)));
      } catch (e) {
        if (!alive) return;
        if (statusOf(e) === 401) {
          setS({ feed: null, lastOkAt: 0, failures: 0, ended: e?.data?.error || e?.response?.data?.error || "This screen is no longer connected." });
          return;
        }
        failures += 1;
        setS((p) => ({ ...p, failures }));
        schedule(statusOf(e) === 429 ? 30_000 : retryDelay(failures));
      } finally { busy = false; }
    }
    const wake = () => { if (document.visibilityState !== "hidden") schedule(0); };
    kick.current = () => schedule(0);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    run();
    return () => {
      alive = false; clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [token]);
  return { ...s, refresh: useCallback(() => kick.current(), []) };
}

function useCredential() {
  const [token, setToken] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const bridge = desktop();
    if (bridge?.credential) {
      Promise.resolve(bridge.credential()).then((t) => { if (alive) setToken(typeof t === "string" && /^[a-f0-9]{64}$/.test(t) ? t : null); }).catch(() => { if (alive) setToken(null); });
    } else setToken(readStoredToken(storage()));
    return () => { alive = false; };
  }, []);
  return token;
}

function ThemeRoot({ theme = "dark", density, children }) {
  return (
    <div className={cn("tt-display-root fixed inset-0 z-[55] flex flex-col overflow-hidden bg-background text-foreground", theme === "light" ? "light" : "dark", density === "compact" ? "tt-display-compact" : "")}>
      {children}
    </div>
  );
}

function ConnectionChip({ conn }) {
  if (conn.state === "live") return <Chip tone="live" icon={Radio}>Updated {formatAge(conn.ageMs)}</Chip>;
  if (conn.state === "delayed") return <Chip tone="warning">Last update {formatAge(conn.ageMs)}</Chip>;
  if (conn.state === "offline") return <Chip tone="offline" icon={WifiOff}>Offline{conn.ageMs != null ? ` · last update ${formatAge(conn.ageMs)}` : ""}</Chip>;
  return <Chip tone="neutral" icon={Loader2}>Connecting</Chip>;
}

function Header({ feed, conn, layout, layouts, paused, onPause, controls, now }) {
  const companies = feed?.companies || [];
  const logo = companies.find((c) => c.logo_url)?.logo_url;
  return (
    <header className="flex shrink-0 items-center justify-between gap-6 px-5 pb-3 pt-4">
      <div className="flex min-w-0 items-center gap-4">
        {logo && <img src={logo} alt="" className="h-[2.6rem] w-auto max-w-[8rem] object-contain" />}
        <div className="min-w-0">
          <p className="truncate text-[1.5rem] font-bold leading-tight">{companies.map((c) => c.name).join(" · ") || "TransitTrack"}</p>
          <p className="truncate text-[1rem] text-muted-foreground">{feed?.display?.name}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="text-[1.25rem] font-semibold">{LAYOUT_NAMES[layout]}</p>
        {layouts.length > 1 && (
          <span className="flex items-center gap-1.5" aria-label={`Layout ${layouts.indexOf(layout) + 1} of ${layouts.length}${paused ? ", rotation paused" : ""}`}>
            {layouts.map((l) => <span key={l} className={cn("h-[0.6rem] w-[0.6rem] rounded-full", l === layout ? "bg-primary" : "bg-muted-foreground/40")} />)}
          </span>
        )}
        {layouts.length > 1 && (controls || paused) && (
          <button type="button" onClick={onPause} className="flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-border bg-card px-3 text-[1rem] font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring">
            {paused ? <Play className="h-[1em] w-[1em]" aria-hidden="true" /> : <Pause className="h-[1em] w-[1em]" aria-hidden="true" />}
            {paused ? "Resume rotation" : "Pause rotation"}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <ConnectionChip conn={conn} />
        <p className="font-display text-[2.2rem] font-bold leading-none tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      </div>
    </header>
  );
}

function DisplayScreen() {
  const navigate = useNavigate();
  const token = useCredential();
  const { feed, lastOkAt, failures, ended, refresh } = useDisplayFeed(token);
  const online = useOnline();
  const now = useNow(5_000);
  const display = feed?.display;
  useScreenScale(display?.text_size || "large");
  const conn = connection({ lastOkAt, failures, now, online });

  // Rotation between approved layouts; Space pauses, arrows step.
  const layouts = useMemo(() => rotation(display), [display?.layout, display?.rotate, (display?.rotate_layouts || []).join()]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setIndex(0); }, [layouts.join()]);
  useEffect(() => {
    if (layouts.length < 2 || paused) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % layouts.length), Math.max(20, display?.rotate_seconds || 60) * 1000);
    return () => clearInterval(t);
  }, [layouts.join(), paused, display?.rotate_seconds]);
  const layout = layouts[index % layouts.length] || "fleet";

  // Controls appear when someone moves the mouse or presses a key, then hide.
  const [controls, setControls] = useState(false);
  useEffect(() => {
    let t;
    const show = () => { setControls(true); clearTimeout(t); t = setTimeout(() => setControls(false), 5000); };
    const key = (e) => {
      show();
      if (layouts.length < 2) return;
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % layouts.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + layouts.length) % layouts.length);
    };
    window.addEventListener("pointermove", show);
    window.addEventListener("keydown", key);
    return () => { clearTimeout(t); window.removeEventListener("pointermove", show); window.removeEventListener("keydown", key); };
  }, [layouts.join()]);

  // The Windows app calls this before closing the window: camera views stop now.
  useEffect(() => {
    if (!token) return undefined;
    window.__ttDisplayClose = () => fnCall("camera_end", { display_token: token, reason: "closed" }).catch(() => {});
    window.__ttDisplayRefresh = refresh;
    return () => { delete window.__ttDisplayClose; delete window.__ttDisplayRefresh; };
  }, [token, refresh]);

  // When access ends, a paired screen forgets its credential.
  useEffect(() => { if (ended && !desktop()) forgetToken(storage()); }, [ended]);

  if (token === undefined) return <ThemeRoot><ScreenMessage icon={Loader2} title="Starting the display…" /></ThemeRoot>;
  if (!token) {
    return (
      <ThemeRoot>
        <ScreenMessage icon={Link2} title="This screen isn't set up yet" action={!desktop() && <BigButton onClick={() => navigate("/display/pair")}>Pair this screen</BigButton>}>
          {desktop()
            ? "Close this window and open it again from Office displays in the main TransitTrack window."
            : "Pair it with a code: an administrator enters the code in Office displays and chooses what this screen shows."}
        </ScreenMessage>
      </ThemeRoot>
    );
  }
  if (ended) {
    return (
      <ThemeRoot theme={display?.theme}>
        <ScreenMessage icon={MonitorOff} title="This screen is no longer connected" action={!desktop() && <BigButton onClick={() => navigate("/display/pair")}>Pair this screen again</BigButton>}>
          {ended}
        </ScreenMessage>
      </ThemeRoot>
    );
  }
  if (!feed) {
    return (
      <ThemeRoot>
        {failures > 0
          ? <ScreenMessage icon={CloudOff} tone="warning" title="Can't reach TransitTrack">{online ? "Trying again…" : "This screen is offline. It will connect again by itself."}</ScreenMessage>
          : <ScreenMessage icon={Loader2} title="Connecting to TransitTrack…" />}
      </ThemeRoot>
    );
  }
  // Bounded offline: after 15 minutes without an update the screen stops
  // showing what may no longer be true.
  if (conn.state === "hidden") {
    return (
      <ThemeRoot theme={display?.theme}>
        <ScreenMessage icon={CloudOff} tone="warning" title="Connection lost">
          No update since {clock(new Date(lastOkAt).toISOString())}. The information is hidden until this screen reconnects; it keeps trying by itself.
        </ScreenMessage>
      </ThemeRoot>
    );
  }
  if (feed.blanked) {
    return (
      <ThemeRoot theme="dark">
        <div className="flex h-full items-end justify-end p-6 text-[0.95rem] text-muted-foreground/60">Paused from Office displays</div>
      </ThemeRoot>
    );
  }
  const dark = display?.theme !== "light";
  return (
    <ThemeRoot theme={display?.theme} density={display?.density}>
      <Header feed={feed} conn={conn} layout={layout} layouts={layouts} paused={paused} onPause={() => setPaused((p) => !p)} controls={controls} now={now} />
      {["delayed", "offline"].includes(conn.state) && (
        <p role="status" className="mx-5 mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-[1.1rem] font-semibold text-warning">
          <TriangleAlert className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
          Not updating. Showing the last update from {clock(new Date(lastOkAt).toISOString())}; reconnecting.
        </p>
      )}
      <main className={cn("min-h-0 flex-1 px-5 pb-5", display?.density === "compact" && "px-4 pb-4")}>
        {layout === "fleet" && <FleetLayout feed={feed} dark={dark} now={now} />}
        {layout === "dispatch" && <DispatchLayout feed={feed} now={now} />}
        {layout === "maintenance" && <MaintenanceLayout feed={feed} />}
        {layout === "cameras" && <CamerasLayout feed={feed} token={token} dark={dark} now={now} />}
      </main>
    </ThemeRoot>
  );
}

// Another computer or a TV browser: show a short code, wait for approval.
function PairScreen() {
  const navigate = useNavigate();
  useScreenScale("large");
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState("");
  const [renewals, setRenewals] = useState(0);
  const now = useNow(5_000);
  const already = useMemo(() => !!readStoredToken(storage()), []);

  const start = useCallback(async () => {
    setError("");
    try { setPairing(await fnCall("pair_start")); }
    catch (e) { setPairing(null); setError(statusOf(e) === 429 ? "Too many codes from this network. Try again in an hour." : "Can't reach TransitTrack. Check this screen's internet connection."); }
  }, []);
  useEffect(() => { start(); }, [start]);

  useEffect(() => {
    if (!pairing?.poll_secret) return undefined;
    let alive = true, timer;
    const poll = async () => {
      try {
        const r = await fnCall("pair_poll", { poll_secret: pairing.poll_secret });
        if (!alive) return;
        if (r?.status === "paired" && r.display_token) {
          storeToken(storage(), r.display_token);
          navigate("/display", { replace: true });
          return;
        }
        timer = setTimeout(poll, 4000);
      } catch (e) {
        if (!alive) return;
        if (statusOf(e) === 410) {
          // A fresh code a few times by itself; then a button.
          if (renewals < 5) { setRenewals((n) => n + 1); start(); } else { setPairing(null); setError("The code expired."); }
          return;
        }
        timer = setTimeout(poll, statusOf(e) === 429 ? 30_000 : 8000);
      }
    };
    timer = setTimeout(poll, 4000);
    return () => { alive = false; clearTimeout(timer); };
  }, [pairing?.poll_secret]);

  const left = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expires_at) - now) / 60_000)) : 0;
  return (
    <ThemeRoot>
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-[60rem] text-center">
          <h1 className="text-[2.2rem] font-bold">Pair this screen as an office display</h1>
          {pairing ? (
            <>
              <p className="mt-8 font-display text-[9rem] font-bold leading-none tracking-[0.18em] tabular-nums" aria-label={`Pairing code ${pairing.code.split("").join(" ")}`}>{pairing.code}</p>
              <p className="mt-6 text-[1.35rem] leading-relaxed text-muted-foreground">
                On a computer signed in to TransitTrack as an administrator, open <span className="font-semibold text-foreground">Admin → Office displays</span>, choose the display and select <span className="font-semibold text-foreground">Pair a screen</span>, then enter this code.
              </p>
              <p className="mt-4 text-[1.1rem] text-muted-foreground">Code works for {left} more minute{left === 1 ? "" : "s"} and only once. This page updates by itself.</p>
            </>
          ) : error ? (
            <div className="mt-8">
              <p role="alert" className="text-[1.35rem] font-semibold text-warning">{error}</p>
              <div className="mt-6"><BigButton onClick={() => { setRenewals(0); start(); }}>Get a new code</BigButton></div>
            </div>
          ) : (
            <p className="mt-8 text-[1.35rem] text-muted-foreground">Getting a code…</p>
          )}
          {already && <div className="mt-8"><BigButton variant="secondary" onClick={() => navigate("/display")}>This screen is already paired: open the display</BigButton></div>}
        </div>
      </div>
    </ThemeRoot>
  );
}

export default function OfficeDisplay() {
  const { pathname } = useLocation();
  return pathname.startsWith("/display/pair") ? <PairScreen /> : <DisplayScreen />;
}
