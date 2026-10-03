import { saveDeviceToken, forgetDeviceToken } from "@/lib/deviceAuth";
import React, { useState, useEffect, useRef, useCallback } from "react";
import BusLoader from "@/components/BusLoader";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDriverSession, clearDriverSessionCache } from "@/hooks/useDriverSession";
import { shiftAction } from "@/lib/driverShift";
import { clearGpsQueue } from "@/lib/gpsQueue";
import { getFcmToken } from "@/lib/firebase";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import DriverPairing from "@/components/driver/DriverPairing";
import DriverGreeting, { DriverTopBar } from "@/components/driver/DriverGreeting";
import PinGate from "@/components/driver/PinGate";
import { DriverInspectionRunner, DueInspectionsBanner, DriverInspectionList, SentInspectionPrompt, readLocalDone, markLocalDone } from "@/components/driver/DriverInspection";
import { dueFor, dueNow, sentAndPending, dueAtTime } from "@/lib/driverInspections";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverChats from "@/components/driver/DriverChats";
import DriverMessageAlert from "@/components/driver/DriverMessageAlert";
import NewCheckInAlert from "@/components/driver/NewCheckInAlert";
import DriverDevicePanel from "@/components/driver/DriverDevicePanel";
import DriverTrips from "@/components/DriverTrips";
import ShiftCard from "@/components/driver/ShiftCard";
import SafetyStandardsContent from "@/components/SafetyStandardsContent";
import { AlertCircle, AlertTriangle, ArrowLeft, MessageCircle, Navigation, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { idleFor, useTabletUpdates } from "@/lib/tabletUpdate";

// "navigate" is kept as an alias: Track and Navigate are now one Drive screen.
const TRACKING_TABS = ["track", "navigate", "chat", "safety", "profile"];
const DRIVER_TABS = [
  { id: "track", label: "Drive", icon: Navigation },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "safety", label: "Safety", icon: ShieldCheck },
  { id: "profile", label: "Profile", icon: UserRound },
];
const tabFromStage = (st) => (st === "navigate" ? "track" : TRACKING_TABS.includes(st) ? st : null);

export default function DriverApp() {
  const navigate = useNavigate();
  const { stage: urlStage } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("tt_driver_device_id"));
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("tt_driver_unlock_date") === new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState(() => tabFromStage(urlStage) || "track");
  // Follow the URL (e.g. "Continue" after an inspection goes to /driver/track).
  useEffect(() => { const t = tabFromStage(urlStage); if (t) setActiveTab(t); }, [urlStage]);
  const { session, loading, offline, invoke, refresh } = useDriverSession(deviceId);
  // Updates only happen while the bus is stopped and nobody has touched the
  // screen for 3 minutes (see lib/tabletUpdate).
  useTabletUpdates({
    requestedAt: session?.update_requested_at,
    isIdle: () => idleFor(3 * 60 * 1000) && (window.__ttHelperHealth?.parked === true || (session?.vehicle?.speed || 0) < 0.5),
  });
  const [localDone, setLocalDone] = useState(readLocalDone);

  // Driver tablets are mounted and always powered — keep the screen on so
  // locking is never what interrupts GPS tracking (no background-location
  // permission needed for this; it only matters while the screen is on).
  useKeepAwake(!!deviceId);

  // States for the integrated inline incident modal
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("breakdown");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);

  // Broadcast detection — always active regardless of active tab
  const [alert, setAlert] = useState(null);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  // New-check-in popup — separate tracking from the broadcast alert above.
  const [checkInAlert, setCheckInAlert] = useState(null);
  const seenCheckInIds = useRef(new Set());
  const firstCheckInLoad = useRef(true);

  // Unread dot on the Chat tab — DriverChats tracks per-contact unread
  // (staff/company/dispatch/mechanic) and reports whether any is unread.
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  const playAlertSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        const start = ctx.currentTime + i * 0.25;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.start(start); osc.stop(start + 0.4);
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const broadcasts = session?.broadcasts;
    if (!broadcasts) return;
    if (firstLoad.current) {
      broadcasts.forEach((b) => seenIds.current.add(b.id));
      firstLoad.current = false;
      return;
    }
    broadcasts.forEach((b) => {
      if (seenIds.current.has(b.id)) return;
      seenIds.current.add(b.id);
      if (!b.is_reply) {
        playAlertSound();
        setAlert(b);
      }
    });
  }, [session?.broadcasts, playAlertSound]);

  useEffect(() => {
    const checkIns = session?.check_ins;
    if (!checkIns) return;
    if (firstCheckInLoad.current) {
      checkIns.forEach((c) => seenCheckInIds.current.add(c.id));
      firstCheckInLoad.current = false;
      return;
    }
    checkIns.forEach((c) => {
      if (seenCheckInIds.current.has(c.id)) return;
      seenCheckInIds.current.add(c.id);
      setCheckInAlert(c);
    });
  }, [session?.check_ins]);


  // Drivers have no login, so their push token registers through the device
  // session instead of the usePushNotifications hook (which needs an email).
  const pushRegistered = useRef(false);
  useEffect(() => {
    if (pushRegistered.current || !deviceId || !session?.vehicle) return;
    pushRegistered.current = true;
    getFcmToken().then((token) => { if (token) invoke("register_push_token", { token }).catch(() => {}); });
  }, [deviceId, session?.vehicle, invoke]);

  // `unlocked` is only checked against today's date once, at mount. A tablet
  // that's mounted in a vehicle and just left powered on overnight (instead
  // of being closed/reopened) never re-mounts this component, so it stays
  // "unlocked" from the previous day forever — which meant the morning PIN
  // re-entry (and the pre-trip inspection prompt that only fires from it)
  // silently never came back up. Re-check whenever the tablet wakes/is
  // touched again, not just at load.
  useEffect(() => {
    const checkUnlockDate = () => {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("tt_driver_unlock_date") !== today) setUnlocked(false);
    };
    const interval = setInterval(checkUnlockDate, 60000);
    document.addEventListener("visibilitychange", checkUnlockDate);
    window.addEventListener("focus", checkUnlockDate);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkUnlockDate);
      window.removeEventListener("focus", checkUnlockDate);
    };
  }, []);

  const handleAlertReply = async (text) => {
    await invoke("send_group_message", { text, channel: "dispatch" });
    setAlert(null);
  };

  // Auto-pair when a pairing code is provided in the URL (?code=AB3D9K)
  const [autoPairing, setAutoPairing] = useState(false);
  const pairCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") : null;

  useEffect(() => {
    if (!deviceId && pairCode && !autoPairing) {
      setAutoPairing(true);
      base44.functions.invoke("pairKioskDevice", { pairing_code: pairCode, expected_type: "driver" })
        .then((res) => {
          if (res.data?.kiosk_type === "driver" && res.data?.vehicle_id) {
            saveDeviceToken(res.data.device_id, res.data.device_token);
            localStorage.setItem("tt_driver_device_id", res.data.device_id);
            setDeviceId(res.data.device_id);
            navigate("/driver", { replace: true });
          } else {
            setAutoPairing(false);
          }
        })
        .catch(() => setAutoPairing(false));
    }
  }, [deviceId, pairCode, autoPairing, navigate]);

  const stage = urlStage || "pin";

  // Visible back control for iOS WebViews, where a swipe-back gesture isn't
  // reliably available: from the inspection screen or any tab other than
  // "track" go to the natural previous stage, otherwise fall back to the
  // "/driver" root.
  const goBack = () => {
    if (stage === "inspection") { navigate("/driver"); return; }
    if (activeTab !== "track") { setActiveTab("track"); goStage("track"); return; }
    navigate("/driver");
  };

  // Inspections sent to this tablet, and which are due right now.
  const inspTemplates = session?.inspection_templates || [];
  const recentInspections = session?.recent_inspections || [];
  const dueInspections = dueNow(inspTemplates, recentInspections, localDone);
  const sentPending = inspTemplates.filter((t) => sentAndPending(t, recentInspections, localDone));
  // Pop up when the office sends one, or when a set time (e.g. 13:00) comes round.
  const promptPending = [
    ...sentPending,
    ...inspTemplates.flatMap((t) => {
      const slot = dueAtTime(t, recentInspections, localDone);
      return slot ? [{ ...t, _slot: slot.time, _promptKey: `${t.id}@${new Date().toDateString()}@${slot.time}` }] : [];
    }),
  ];

  // then: an action to finish after the inspection (start/end the shift).
  // from: "unlock" | "manual" — decides what comes next and whether it can be skipped.
  const openInspection = (t, { then, from } = {}) => {
    const q = new URLSearchParams();
    if (t) q.set("t", t.id);
    if (then) q.set("then", then);
    if (from) q.set("from", from);
    navigate(`/driver/inspection?${q.toString()}`);
  };

  // Shift buttons: run any inspection set for that moment first.
  const beforeShift = (moment) => {
    const due = dueFor(moment === "start_shift" ? "shift_start" : "shift_end", inspTemplates, recentInspections, localDone);
    if (!due.length) return false;
    openInspection(due[0], { then: moment });
    return true;
  };

  const finishInspection = async (template, then, from) => {
    const done = markLocalDone(template.id);
    setLocalDone(done);
    refresh?.();
    const moment = then === "start_shift" ? "shift_start" : then === "end_shift" ? "shift_end" : null;
    const next = moment
      ? dueFor(moment, inspTemplates, recentInspections, done)
      : from === "unlock" ? dueNow(inspTemplates, recentInspections, done) : [];
    if (next.length) { openInspection(next[0], { then, from }); return; }
    if (then) {
      try {
        const res = await shiftAction(invoke, then);
        toast({
          title: then === "start_shift" ? "Shift started" : "Shift ended",
          description: res.queued ? "No connection - it will be saved when WiFi is back." : then === "start_shift" ? "Have a safe drive." : "Your hours have been saved.",
        });
        refresh?.();
      } catch {
        toast({ title: then === "start_shift" ? "Couldn't start the shift" : "Couldn't end the shift", description: "Tap the shift button to try again.", variant: "destructive" });
      }
    }
    goStage("track");
  };

  const handlePaired = (id) => { localStorage.setItem("tt_driver_device_id", id); setDeviceId(id); };
  const handleUnpair = () => { forgetDeviceToken(deviceId); clearDriverSessionCache(); clearGpsQueue(); localStorage.removeItem("tt_driver_device_id"); localStorage.removeItem("tt_driver_unlock_date"); setDeviceId(null); setUnlocked(false); navigate("/driver"); };

  // Handler to submit the incident report via the driver-session backend function.
  // (A direct base44.entities.Incident.create() call from here would be rejected —
  // driver tablets are paired by device ID, not logged in as a normal user, so they
  // have no role for the Incident entity's permission rules to match.)
  const submitIncidentReport = async () => {
    if (!incidentDetails.trim()) {
      toast({ title: "Please provide incident details", variant: "destructive" });
      return;
    }

    setIsSubmittingIncident(true);
    try {
      await invoke("report_incident", { type: incidentType, details: incidentDetails });

      toast({ title: "Incident reported", description: "The admin dashboard has been notified." });
      setIncidentDetails("");
      setIncidentType("breakdown");
      setIsReportOpen(false);
    } catch (e) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  if (!deviceId) {
    if (autoPairing)
      return <div className="min-h-screen flex items-center justify-center"><BusLoader /></div>;
    return <DriverPairing onPaired={handlePaired} />;
  }

  if (loading && !session)
    return <div className="min-h-screen flex items-center justify-center"><BusLoader /></div>;

  if (!session?.vehicle)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground max-w-md mb-4">No vehicle is assigned to this tablet. Ask your administrator to assign a vehicle.</p>
        <Button variant="outline" onClick={handleUnpair}>Unpair tablet</Button>
      </div>
    );

  const vehicle = session.vehicle;
  const driverName = session.driver_name || "Driver";
  const goStage = (s) => navigate("/driver/" + s);

  if (!unlocked) {
    return (
      <div className="min-h-screen p-4 safe-area-top safe-area-x">
        <div className="space-y-4 max-w-3xl mx-auto">
          <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
          <PinGate vehicle={vehicle} invoke={invoke} onUnlock={() => { localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10)); setUnlocked(true); if (dueInspections.length) openInspection(dueInspections[0], { from: "unlock" }); else goStage("track"); }} />
        </div>
      </div>
    );
  }

  if (stage === "inspection") {
    const then = searchParams.get("then") || "";
    const from = searchParams.get("from") || "";
    const tId = searchParams.get("t");
    const template = inspTemplates.find((t) => t.id === tId) || (tId ? null : dueInspections[0]) || null;
    // A required inspection can't be skipped — unless the driver opened it themselves.
    const canSkip = !template || !template.driver_required || from === "manual";
    return (
      <div className="min-h-screen p-4 safe-area-top safe-area-x">
        <div className="space-y-4 max-w-6xl mx-auto">
          {canSkip && (
            <Button
              variant="ghost"
              size="icon"
              className="min-w-[44px] min-h-[44px] -ml-2"
              onClick={goBack}
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          {!template && <DriverGreeting driverName={driverName} subtitle={vehicle.name} />}
          {template ? (
            <DriverInspectionRunner
              template={template}
              vehicle={vehicle}
              invoke={invoke}
              trigger={then || (from === "manual" ? "on_demand" : template.driver_trigger)}
              onFinished={() => finishInspection(template, then, from)}
              onSkip={canSkip ? () => goStage("track") : undefined}
            />
          ) : (
            <DriverInspectionList
              templates={inspTemplates}
              recent={recentInspections}
              localDone={localDone}
              onStart={(t) => openInspection(t, { from: "manual" })}
            />
          )}
        </div>
      </div>
    );
  }

  const selectTab = (v) => {
    setActiveTab(v);
    navigate("/driver/" + v, { replace: true });
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background safe-area-top safe-area-x">
      <DriverTopBar
        driverName={driverName}
        busName={vehicle.name}
        left={activeTab !== "track" ? (
          <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] -ml-1" onClick={goBack} aria-label="Back to Drive">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : null}
        right={offline ? (
          <span role="status" className="flex items-center gap-1.5 rounded-full bg-amber-500 text-black px-3 py-1 text-xs font-semibold shrink-0">
            <WifiOff className="w-3.5 h-3.5" /> Offline
          </span>
        ) : null}
      />

      <main className="flex-1 min-h-0 relative">
        {/* Drive stays mounted so GPS tracking keeps running while another tab is open. */}
        <section className={`absolute inset-0 p-3 ${activeTab === "track" ? "" : "invisible pointer-events-none"}`} aria-hidden={activeTab !== "track"}>
          <DriverTrackingDashboard
            session={session}
            invoke={invoke}
            onReportIncident={() => setIsReportOpen(true)}
            panelTop={(
              <>
                {dueInspections.length > 0 && (
                  <DueInspectionsBanner compact due={dueInspections} onStart={(t) => openInspection(t, { from: "unlock" })} />
                )}
                <ShiftCard compact session={session} invoke={invoke} refresh={refresh} beforeStart={() => beforeShift("start_shift")} beforeEnd={() => beforeShift("end_shift")} />
              </>
            )}
            panelBottom={session.trips?.length > 0 ? (
              <DriverTrips
                compact
                trips={session.trips}
                invoke={invoke}
                refresh={refresh}
                startSharing={() => invoke("start_tracking").catch(() => {})}
              />
            ) : null}
          />
        </section>
        {activeTab !== "track" && (
          <section className="absolute inset-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {activeTab === "chat" && <DriverChats session={session} invoke={invoke} onUnreadChange={setHasUnreadChat} />}
              {activeTab === "safety" && (
                <>
                  <DriverInspectionList
                    templates={inspTemplates}
                    recent={recentInspections}
                    localDone={localDone}
                    onStart={(t) => openInspection(t, { from: "manual" })}
                  />
                  <SafetyStandardsContent />
                </>
              )}
              {activeTab === "profile" && <DriverDevicePanel session={session} deviceId={deviceId} onUnpair={handleUnpair} />}
            </div>
          </section>
        )}
      </main>

      <nav className="shrink-0 grid grid-cols-4 border-t border-border bg-card/95 backdrop-blur safe-area-bottom" aria-label="Driver sections">
        {DRIVER_TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 h-16 text-xs font-semibold transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {active && <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-primary" aria-hidden="true" />}
              <Icon className="w-6 h-6" aria-hidden="true" />
              {label}
              {id === "chat" && hasUnreadChat && <span className="absolute top-2.5 left-1/2 ml-2.5 w-2.5 h-2.5 rounded-full bg-destructive" aria-label="Unread messages" />}
            </button>
          );
        })}
      </nav>

      <DriverMessageAlert alert={alert} onAcknowledge={() => setAlert(null)} onReply={handleAlertReply} />
      <NewCheckInAlert checkIn={checkInAlert} onDismiss={() => setCheckInAlert(null)} />
      <SentInspectionPrompt pending={promptPending} onStart={(t) => openInspection(t, { from: "unlock" })} />

      <Sheet open={isReportOpen} onOpenChange={setIsReportOpen}>
        <SheetContent side="bottom" className="max-w-3xl mx-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Report an incident
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={incidentType} onValueChange={setIncidentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakdown">Mechanical breakdown</SelectItem>
                  <SelectItem value="accident">Accident</SelectItem>
                  <SelectItem value="delay">Delay</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea
                value={incidentDetails}
                onChange={(e) => setIncidentDetails(e.target.value)}
                placeholder="Describe what happened..."
                rows={4}
              />
            </div>
            <Button className="w-full" onClick={submitIncidentReport} disabled={isSubmittingIncident}>
              {isSubmittingIncident ? "Submitting..." : "Submit report"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}