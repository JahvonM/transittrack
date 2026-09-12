import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDriverSession } from "@/hooks/useDriverSession";
import DriverPairing from "@/components/driver/DriverPairing";
import DriverGreeting from "@/components/driver/DriverGreeting";
import PinGate from "@/components/driver/PinGate";
import PreTripInspection from "@/components/driver/PreTripInspection";
import DriverTrackingDashboard from "@/components/driver/DriverTrackingDashboard";
import DriverNavMap from "@/components/driver/DriverNavMap";
import DriverMessages from "@/components/DriverMessages";
import DriverMessageAlert from "@/components/driver/DriverMessageAlert";
import DriverDevicePanel from "@/components/driver/DriverDevicePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const TRACKING_TABS = ["track", "navigate", "messages", "profile"];

export default function DriverApp() {
  const navigate = useNavigate();
  const { stage: urlStage } = useParams();
  const { toast } = useToast();

  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("tt_driver_device_id"));
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("tt_driver_unlock_date") === new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState(() => TRACKING_TABS.includes(urlStage) ? urlStage : "track");
  const { session, loading, invoke } = useDriverSession(deviceId);

  // States for the integrated inline incident modal
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("breakdown");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);

  // Broadcast detection — always active regardless of active tab
  const [alert, setAlert] = useState(null);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

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

  const handleAlertReply = async (text) => {
    await invoke("send_broadcast", { message: text });
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

  const isMorning = new Date().getHours() >= 4 && new Date().getHours() < 11;
  const stage = urlStage || "pin";

  const handlePaired = (id) => { localStorage.setItem("tt_driver_device_id", id); setDeviceId(id); };
  const handleUnpair = () => { localStorage.removeItem("tt_driver_device_id"); localStorage.removeItem("tt_driver_unlock_date"); setDeviceId(null); setUnlocked(false); navigate("/driver"); };

  // Handler to submit the incident report directly using tablet credentials
  const submitIncidentReport = async () => {
    if (!incidentDetails.trim()) {
      toast({ title: "Please provide incident details", variant: "destructive" });
      return;
    }

    setIsSubmittingIncident(true);
    try {
      await base44.entities.Incident.create({
        vehicle_id: session?.vehicle?.id || "",
        vehicle_name: session?.vehicle?.name || "",
        company_id: session?.vehicle?.company_id || "",
        company_name: session?.vehicle?.company_name || "",
        driver_name: session?.driver_name || "Tablet App Operator",
        driver_email: "",
        type: incidentType,
        details: incidentDetails,
        occurred_at: new Date().toISOString(),
        status: "open",
      });

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
      return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
    return <DriverPairing onPaired={handlePaired} />;
  }

  if (loading && !session)
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

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
          <PinGate vehicle={vehicle} onUnlock={() => { localStorage.setItem("tt_driver_unlock_date", new Date().toISOString().slice(0, 10)); setUnlocked(true); goStage(isMorning ? "inspection" : "track"); }} />
        </div>
      </div>
    );
  }

  if (stage === "inspection") {
    return (
      <div className="min-h-screen p-4 safe-area-top safe-area-x">
        <div className="space-y-4 max-w-3xl mx-auto">
          <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
          <PreTripInspection vehicle={vehicle} invoke={invoke} driverName={driverName} onCompleted={() => goStage("track")} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 safe-area-top safe-area-x">
      <div className="space-y-4 max-w-3xl mx-auto">
        <DriverGreeting driverName={driverName} subtitle={vehicle.name} />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="track">Track</TabsTrigger>
            <TabsTrigger value="navigate">Navigate</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="track" className="mt-4 space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-lg flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-destructive animate-ping" />
                <span className="text-sm font-medium">Mechanical Breakdown or Fleet Incident?</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs font-semibold px-4 shadow-sm"
                onClick={() => setIsReportOpen(true)}
              >
                Report Now
              </Button>
            </div>

            <DriverTrackingDashboard session={session} invoke={invoke} driverName={driverName} />
          </TabsContent>
          <TabsContent value="navigate" className="mt-4">
            <DriverNavMap session={session} invoke={invoke} />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <DriverMessages session={session} invoke={invoke} />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <DriverDevicePanel session={session} deviceId={deviceId} onUnpair={handleUnpair} />
          </TabsContent>
        </Tabs>
      </div>
      <DriverMessageAlert alert={alert} onAcknowledge={() => setAlert(null)} onReply={handleAlertReply} />

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