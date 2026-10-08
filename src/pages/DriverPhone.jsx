import useFutureAppearance from "@/hooks/useFutureAppearance";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, LogOut, MessageSquare, TriangleAlert, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import BusLoader from "@/components/BusLoader";
import Logo from "@/components/Logo";
import { useToast } from "@/components/ui/use-toast";
import { requestPushToken, onForegroundMessage } from "@/lib/firebase";
import { PUSH_FAILURE } from "@/hooks/usePushNotifications";
import { callDriverPhone, nextDrivingState, notADriver } from "@/lib/driverPhone";
import TodayTab from "@/components/driverPhone/TodayTab";
import MessagesTab from "@/components/driverPhone/MessagesTab";
import ReportTab from "@/components/driverPhone/ReportTab";
import MeTab from "@/components/driverPhone/MeTab";
import DrivingScreen from "@/components/driverPhone/DrivingScreen";
import StartShift from "@/components/driverPhone/StartShift";
import Walkaround from "@/components/driverPhone/Walkaround";
import Requests from "@/components/driverPhone/Requests";
import { confirmAction } from "@/components/ConfirmHost";
import { GPS_INTERVAL_MS } from "@/lib/mapbox";

const TABS = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "report", label: "Report", icon: TriangleAlert },
  { id: "me", label: "Me", icon: UserIcon },
];
const BUS_KEY = "tt_phone_bus";
const SEEN_KEY = "tt_phone_seen";
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

// Refused accounts get one clear way out, never a half-loaded app.
function NotADriver({ email, message, onSignOut }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Logo />
      <h1 className="text-headline">This account isn't set up for the driver app</h1>
      <p className="text-body text-muted-foreground">{message}</p>
      {email && <p className="rounded-xl bg-secondary px-3 py-2 text-body-sm">Signed in as <span className="font-semibold">{email}</span></p>}
      <button type="button" onClick={onSignOut} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-accent">
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out and use another account
      </button>
    </main>
  );
}

export default function DriverPhone() {
  useFutureAppearance();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const [searchParams] = useSearchParams();
  // Start shift and the walk-around are screens of their own under Today.
  const screen = ["start", "walkaround", "requests"].includes(tabParam) ? tabParam : null;
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : screen === "requests" ? "me" : "today";
  const [shifts, setShifts] = useState(null);
  const [startAfterWalk, setStartAfterWalk] = useState(false);
  const [status, setStatus] = useState("loading");
  const [refusal, setRefusal] = useState("");
  const [me, setMe] = useState(null);
  const [today, setToday] = useState(null);
  const [busId, setBusId] = useState(() => store.get(BUS_KEY));
  const [messages, setMessages] = useState([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [seen, setSeen] = useState(() => store.get(SEEN_KEY));
  const [notifications, setNotifications] = useState("off");
  const [driving, setDriving] = useState(false);
  const busRef = useRef(busId);
  busRef.current = busId;

  const refused = useCallback((error) => {
    if (!notADriver(error)) return false;
    setRefusal(error.message);
    setStatus("refused");
    return true;
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const data = await callDriverPhone("today", busRef.current ? { vehicle_id: busRef.current } : {});
      setToday(data);
      if (data.bus && data.bus.id !== busRef.current) { setBusId(data.bus.id); store.set(BUS_KEY, data.bus.id); }
      return data;
    } catch (error) {
      if (refused(error)) return null;
      // A bus that was taken off this driver: fall back to their first bus.
      if (error.status === 403 && busRef.current) { busRef.current = ""; setBusId(""); store.set(BUS_KEY, ""); return loadToday(); }
      throw error;
    }
  }, [refused]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await callDriverPhone("messages", busRef.current ? { vehicle_id: busRef.current } : {});
      setMessages(data.messages || []);
      setMessagesLoaded(true);
    } catch (error) {
      refused(error);
    }
  }, [refused]);

  const loadDocs = useCallback(async () => {
    try {
      const data = await callDriverPhone("documents");
      setDocuments(data.documents || []);
      return data.documents || [];
    } catch (error) {
      if (!refused(error)) toast({ title: "Couldn't load your documents", description: error.message, variant: "destructive" });
      return null;
    } finally {
      setDocsLoaded(true);
    }
  }, [refused, toast]);

  // First load.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profile = await callDriverPhone("me");
        if (!alive) return;
        setMe(profile);
        await Promise.all([loadToday(), loadMessages()]);
        if (alive) setStatus((s) => (s === "refused" ? s : "ready"));
      } catch (error) {
        if (alive && !refused(error)) setStatus("error");
      }
    })();
    return () => { alive = false; };
  }, [loadToday, loadMessages, refused]);

  // Keep things fresh without hammering the server: messages every 20 s while
  // they're on screen, otherwise once a minute; nothing while the screen is off.
  useEffect(() => {
    if (status !== "ready") return undefined;
    const fast = tab === "messages";
    const id = setInterval(() => { if (visible()) loadMessages(); }, fast ? 20_000 : 60_000);
    const id2 = setInterval(() => { if (visible()) loadToday().catch(() => {}); }, 60_000);
    const onShow = () => { if (visible()) { loadMessages(); loadToday().catch(() => {}); } };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(id); clearInterval(id2); document.removeEventListener("visibilitychange", onShow); };
  }, [status, tab, loadMessages, loadToday]);

  // Unread: messages from others since the Messages tab was last open.
  const latest = messages.length ? messages[messages.length - 1].created_date || "" : "";
  useEffect(() => {
    if (tab !== "messages" || !latest) return;
    setSeen(latest);
    store.set(SEEN_KEY, latest);
  }, [tab, latest]);
  const unread = messages.filter((m) => !m.mine && (m.created_date || "") > seen).length;

  // Push: re-register quietly if this phone already allowed notifications.
  const registerPush = useCallback(async ({ prompt }) => {
    const { token, reason } = await requestPushToken({ prompt });
    if (!token) return reason || "error";
    try { await callDriverPhone("register_push", { token }); } catch { return "not_saved"; }
    setNotifications("on");
    return "";
  }, []);
  useEffect(() => {
    if (status !== "ready" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    registerPush({ prompt: false }).catch(() => {});
  }, [status, registerPush]);
  useEffect(() => onForegroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    toast({ title: title || "New message", description: body });
    loadMessages();
  }), [toast, loadMessages]);
  const enableNotifications = async () => {
    const failure = await registerPush({ prompt: true }).catch(() => "error");
    if (failure) toast({ ...(PUSH_FAILURE[failure] || PUSH_FAILURE.error), variant: "destructive" });
    else toast({ title: "Notifications on", description: "Dispatch messages will alert this phone." });
  };

  // Backup GPS: only while dispatch has switched it on for this driver's open
  // shift (the bus tablet has failed), the phone sends the bus position at the
  // tablet's pace and keeps the screen awake. The server checks both again.
  const backupOn = !!today?.backup_gps && !!today?.shift?.mine;
  const [backupSentAt, setBackupSentAt] = useState(null);
  useEffect(() => {
    if (!backupOn || !navigator.geolocation?.watchPosition) return undefined;
    let last = 0;
    let lock = null;
    const wake = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch { /* not supported */ } };
    const onShow = () => { if (visible()) wake(); };
    wake();
    document.addEventListener("visibilitychange", onShow);
    const id = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - last < GPS_INTERVAL_MS) return;
      last = now;
      const { latitude: lat, longitude: lng, speed } = pos.coords;
      callDriverPhone("backup_location", {
        vehicle_id: busRef.current || undefined, lat, lng, recorded_at: new Date(pos.timestamp || now).toISOString(),
        ...(Number.isFinite(speed) && speed >= 0 && speed <= 100 ? { speed } : {}),
      }).then(() => setBackupSentAt(new Date())).catch((error) => { if (error.status === 409) loadToday().catch(() => {}); });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => {
      navigator.geolocation.clearWatch(id);
      document.removeEventListener("visibilitychange", onShow);
      lock?.release?.().catch(() => {});
    };
  }, [backupOn, loadToday]);

  // Driving screen: the phone's GPS is read only while a shift is open on the
  // bus. These readings stay on the phone (backup GPS above is separate).
  const onShift = !!today?.shift;
  useEffect(() => {
    if (!onShift || !navigator.geolocation?.watchPosition) { setDriving(false); return undefined; }
    let state = {};
    const id = navigator.geolocation.watchPosition(
      (pos) => { state = nextDrivingState(state, { speed: pos.coords.speed, at: pos.timestamp || Date.now() }); setDriving(state.driving); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [onShift]);

  const pickBus = (id) => {
    busRef.current = id; setBusId(id); store.set(BUS_KEY, id);
    setMessagesLoaded(false);
    loadToday().catch(() => {});
    loadMessages();
  };
  const send = async (channel, text) => {
    const { message } = await callDriverPhone("send", { vehicle_id: busRef.current || undefined, channel, text });
    setMessages((all) => [...all, message]);
  };
  const report = (body) => callDriverPhone("report", { vehicle_id: busRef.current || undefined, ...body });
  const loadHours = async () => {
    try { setShifts((await callDriverPhone("hours")).shifts || []); }
    catch (error) { if (!refused(error)) setShifts([]); }
  };
  const claim = async (code) => {
    const res = await callDriverPhone("claim_bus", { code });
    if (res.bus?.id) { busRef.current = res.bus.id; setBusId(res.bus.id); store.set(BUS_KEY, res.bus.id); }
    loadToday().catch(() => {});
    return res;
  };
  const walkaround = async (items) => {
    const res = await callDriverPhone("walkaround", { vehicle_id: busRef.current || undefined, items });
    loadToday().catch(() => {});
    return res;
  };
  const endShift = async () => {
    const ok = await confirmAction({ title: "End your shift?", description: `This ends your shift on ${today?.bus?.name || "the bus"} now. Anyone still checked in on the bus is checked out.`, confirmLabel: "End shift" });
    if (!ok) return;
    try {
      const { shift } = await callDriverPhone("end_shift", { vehicle_id: busRef.current || undefined });
      const mins = shift?.duration_minutes ?? 0;
      toast({ title: "Shift ended", description: `${Math.floor(mins / 60)} h ${mins % 60} min. Thanks, drive home safe.` });
      loadToday().catch(() => {});
      if (shifts) loadHours();
    } catch (error) {
      toast({ title: "Couldn't end your shift", description: error.message, variant: "destructive" });
    }
  };
  const signOut = () => logout(true);
  const go = (id) => navigate(id === "today" ? "/driver-phone" : `/driver-phone/${id}`);

  if (status === "loading") return <div className="grid min-h-[100dvh] place-items-center bg-background"><BusLoader /></div>;
  if (status === "refused") return <NotADriver email={user?.email} message={refusal} onSignOut={signOut} />;
  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-headline">Couldn't reach TransitTrack</h1>
        <p className="text-muted-foreground">Check your signal, then try again.</p>
        <button type="button" onClick={() => window.location.reload()} className="min-h-[48px] rounded-xl bg-primary font-semibold text-primary-foreground">Try again</button>
      </main>
    );
  }

  return (
    <div className="tt-phone-future min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md safe-area-top">
        <div className="flex min-w-0 items-center gap-2">
          {me?.company?.logo_url ? <img src={me.company.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <Logo />}
          <span className="truncate font-semibold">{me?.company?.name || "TransitTrack"}</span>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-caption font-semibold">Driver</span>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        {screen === "start" && (
          <StartShift today={today} initialCode={searchParams.get("code") || ""} onClaim={claim}
            onWalkaround={() => { setStartAfterWalk(true); navigate("/driver-phone/walkaround"); }} onBack={() => navigate("/driver-phone")} />
        )}
        {screen === "walkaround" && (
          <Walkaround busName={today?.bus?.name} onSubmit={walkaround}
            onBack={() => { const back = startAfterWalk; setStartAfterWalk(false); navigate(back ? "/driver-phone/start" : "/driver-phone"); }} />
        )}
        {screen === "requests" && (
          <Requests load={() => callDriverPhone("requests")} onCreate={(body) => callDriverPhone("request", body)}
            onCancel={(id) => callDriverPhone("cancel_request", { request_id: id })} onBack={() => navigate("/driver-phone/me")} />
        )}
        {!screen && tab === "today" && (
          <TodayTab today={today} driverName={me?.driver?.name} onPickBus={pickBus} backupSentAt={backupSentAt}
            onStartShift={() => navigate("/driver-phone/start")} onEndShift={endShift} onWalkaround={() => navigate("/driver-phone/walkaround")} />
        )}
        {tab === "messages" && <MessagesTab messages={messages} loaded={messagesLoaded} hasBus={!!today?.bus} onSend={send} />}
        {tab === "report" && <ReportTab busName={today?.bus?.name} onSend={report} />}
        {tab === "me" && (
          <MeTab me={me} documents={documents} docsLoaded={docsLoaded} onLoadDocs={loadDocs} shifts={shifts} onLoadHours={loadHours} onOpenRequests={() => navigate("/driver-phone/requests")}
            notifications={notifications} onEnableNotifications={enableNotifications} onSignOut={signOut} />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom" aria-label="Driver app sections">
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <li key={id}>
                <button type="button" onClick={() => go(id)} aria-current={active ? "page" : undefined}
                  className={cn("relative flex min-h-[64px] w-full flex-col items-center justify-center gap-1 text-caption font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                  {active && <span className="absolute left-1/2 top-0 h-[3px] w-10 -translate-x-1/2 rounded-b-full bg-primary" aria-hidden="true" />}
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                    {id === "messages" && unread > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}<span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {driving && <DrivingScreen busName={today?.bus?.name} waiting={unread} sendingGps={backupOn} />}
    </div>
  );
}
