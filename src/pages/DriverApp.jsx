import React, { useState, useEffect, useRef, useCallback } from "react";
import BusLoader from "@/components/BusLoader";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDriverSession } from "@/hooks/useDriverSession";
import { getFcmToken } from "@/lib/firebase";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import DriverPairing from "@/components/driver/DriverPairing";
import DriverGreeting from "@/components/driver/DriverGreeting";
import PinGate from "@/components/driver/PinGate";
import { DriverInspectionRunner, DueInspectionsBanner, DriverInspectionList, SentInspectionPrompt, readLocalDone, markLocalDone } from "@/components/driver/DriverInspection";
import { dueFor, dueNow, sentAndPending } from "@/lib/driverInspections";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverNavMap from "@/components/driver/DriverNavMap";
import DriverChats from "@/components/driver/DriverChats";
import DriverMessageAlert from "@/components/driver/DriverMessageAlert";
import NewCheckInAlert from "@/components/driver/NewCheckInAlert";
import DriverDevicePanel from "@/components/driver/DriverDevicePanel";
import DriverTrips from "@/components/DriverTrips";
import ShiftCard from "@/components/driver/ShiftCard";
import SafetyStandardsContent from "@/components/SafetyStandardsContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, AlertTriangle, ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const TRACKING_TABS = ["track", "navigate", "chat", "safety", "profile"];

export default function DriverApp() {
  const navigate = useNavigate();
  const { stage: urlStage } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("tt_driver_device_id"));
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("tt_driver_unlock_date") === new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState(() => TRACKING_TABS.includes(urlStage) ? urlStage : "track");
  const { session, loading, invoke, refresh } = useDriverSession(deviceId);
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
      base44.functions.invoke("pairKioskDevice", { pairing_code: pairCode })
        .then((res) => {
          if (res.data?.kiosk_type === "driver" && res.data?.vehicle_id) {
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
          <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
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

  return (
    <div className="min-h-screen p-4 safe-area-top safe-area-x">
      <div className="space-y-4 max-w-6xl mx-auto">
        <Button
          variant="ghost"
          size="icon"
          className="min-w-[44px] min-h-[44px] -ml-2"
          onClick={goBack}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="track">Track</TabsTrigger>
            <TabsTrigger value="navigate">Navigate</TabsTrigger>
            <TabsTrigger value="chat" className="relative">
              <MessageCircle className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Chat</span>
              {hasUnreadChat && <span className="absolute top-1 right-1 sm:right-2 w-2 h-2 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="safety">
              <ShieldCheck className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Safety</span>
            </TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="track" className="mt-4">
            {dueInspections.length > 0 && (
              <div className="mb-4">
                <DueInspectionsBanner due={dueInspections} onStart={(t) => openInspection(t, { from: "unlock" })} />
              </div>
            )}
            <ShiftCard session={session} invoke={invoke} refresh={refresh} beforeStart={() => beforeShift("start_shift")} beforeEnd={() => beforeShift("end_shift")} />
            <div className="h-4" />
            <DriverTrackingDashboard session={session} invoke={invoke} driverName={driverName} onReportIncident={() => setIsReportOpen(true)} />
            {session.trips?.length > 0 && (
              <div className="mt-6">
                <DriverTrips
                  trips={session.trips}
                  invoke={invoke}
                  refresh={refresh}
                  startSharing={() => invoke("start_tracking").catch(() => {})}
                />
              </div>
            )}
          </TabsContent>
          <TabsContent value="navigate" className="mt-4">
            <DriverNavMap session={session} invoke={invoke} />
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <DriverChats session={session} invoke={invoke} onUnreadChange={setHasUnreadChat} />
          </TabsContent>
          <TabsContent value="safety" className="mt-4 space-y-4">
            <DriverInspectionList
              templates={inspTemplates}
              recent={recentInspections}
              localDone={localDone}
              onStart={(t) => openInspection(t, { from: "manual" })}
            />
            <SafetyStandardsContent />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <DriverDevicePanel session={session} deviceId={deviceId} onUnpair={handleUnpair} />
          </TabsContent>
        </Tabs>
      </div>
      <DriverMessageAlert alert={alert} onAcknowledge={() => setAlert(null)} onReply={handleAlertReply} />
      <NewCheckInAlert checkIn={checkInAlert} onDismiss={() => setCheckInAlert(null)} />
      <SentInspectionPrompt pending={sentPending} onStart={(t) => openInspection(t, { from: "unlock" })} />

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