import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import MapboxMap from "@/components/MapboxMap";
import CodeGate from "@/components/CodeGate";
import StaffAlerts from "@/components/StaffAlerts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import useUserLocation from "@/hooks/useUserLocation";
import WeatherWidget from "@/components/WeatherWidget";
import AdBanner from "@/components/AdBanner";
import BusAssistant from "@/components/BusAssistant";
import LocationPrompt from "@/components/LocationPrompt";
import CrowdBadge from "@/components/staff/CrowdBadge";
import NextBusCard from "@/components/staff/NextBusCard";
import QuickActions from "@/components/staff/QuickActions";
import { useChatUnread } from "@/components/staff/StaffGroupChat";
import { MyPickupSheet, HelpSheet, BadgeSheet, ChatSheet } from "@/components/staff/StaffSheets";
import useCrowding from "@/hooks/useCrowding";
import { haversineKm, etaMinutes } from "@/lib/geo";
import useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";
import useBusEta from "@/hooks/useBusEta";
import { locateOnRoute } from "@/lib/travelTimes";
import { STATUS_LABEL } from "@/lib/trip";
import { Bus, BellRing, ChevronRight, Clock, LifeBuoy, MapPin, UserRound, X } from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import { useToast } from "@/components/ui/use-toast";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

const STEPS = ["scheduled", "on_the_way", "arrived", "completed"];

const fmtWhen = (iso) => {
  if (!iso) return "Time TBA";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

const greetingWord = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

// Compact trip progress: four segments, filled up to the current step.
function TripSteps({ status }) {
  if (status === "cancelled") return <span className="text-xs font-medium text-destructive">Cancelled</span>;
  const current = STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-2 min-w-[120px]" aria-label={`Status: ${STATUS_LABEL[status] || status}`}>
      <div className="flex gap-1 flex-1">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= current ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <span className="text-xs font-medium whitespace-nowrap">{STATUS_LABEL[status] || status}</span>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</h3>
      {action}
    </div>
  );
}

export default function StaffPortal() {
  const { user } = useAuth();
  const { permission: pushPermission, enableNotifications } = usePushNotifications({ email: user?.email, role: user?.role, companyId: user?.company_id });
  const { toast } = useToast();
  const pickupRef = useRef("");
  const statusRef = useRef({});
  const [company, setCompany] = useState(null);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [pickupName, setPickupName] = useState(() => localStorage.getItem("tt_staff_pickup") || "");
  const [companyPhone, setCompanyPhone] = useState("");
  const [stopAlerts, setStopAlerts] = useState(false);
  const [sheet, setSheet] = useState(null); // "pickup" | "help" | "badge" | "chat" | null
  const [notifDismissed, setNotifDismissed] = useState(() => localStorage.getItem("tt_notif_prompt_dismissed") === "1");

  // The pickup stop is saved on the account (favourite stop) so the server
  // can send "one stop away" alerts for it.
  useEffect(() => {
    if (!user) return;
    setStopAlerts(!!user.stop_alerts);
    if (user.favorite_stop && !localStorage.getItem("tt_staff_pickup")) {
      setPickupName(user.favorite_stop);
      localStorage.setItem("tt_staff_pickup", user.favorite_stop);
    }
  }, [user]);

  const choosePickup = (v) => {
    setPickupName(v);
    localStorage.setItem("tt_staff_pickup", v);
    if (user) base44.auth.updateMe({ favorite_stop: v }).catch(() => {});
  };

  const toggleStopAlerts = async (on) => {
    if (on && !pickupName) {
      toast({ title: "Choose your pickup stop first" });
      return;
    }
    if (on && pushPermission !== "granted") await enableNotifications();
    setStopAlerts(on);
    try {
      await base44.auth.updateMe({ stop_alerts: on, favorite_stop: pickupName });
      toast({
        title: on ? "Stop alerts on" : "Stop alerts off",
        description: on ? `We'll notify you when a bus leaves the stop before ${pickupName}.` : undefined,
      });
    } catch {
      setStopAlerts(!on);
      toast({ title: "Couldn't save that setting", variant: "destructive" });
    }
  };

  useEffect(() => {
    pickupRef.current = pickupName;
  }, [pickupName]);
  const { location: watchedLoc, error: locError } = useUserLocation();
  // Fallback fix from the explicit "Allow location" prompt, for when the
  // background watch was denied or timed out.
  const [promptLoc, setPromptLoc] = useState(null);
  const userLoc = watchedLoc || promptLoc;
  const crowd = useCrowding(company?.id);
  const [loading, setLoading] = useState(true);

  // Restore only a server-issued access grant; never compare cached join codes.
  useEffect(() => {
    localStorage.removeItem("tt_company_code");
    const grant = localStorage.getItem("tt_company_access_grant");
    if (!grant) { setCompaniesLoaded(true); return; }
    base44.functions.invoke("companyAccess", { action: "context", grant }).then(({ data }) => {
      setCompany(data.company);
      setCompanyPhone(data.company.phone || "");
    }).catch(() => { localStorage.removeItem("tt_company_access_grant"); })
      .finally(() => setCompaniesLoaded(true));
  }, [user?.id]);

  useEffect(() => {
    if (!company) return undefined;
    setLoading(true);
    Promise.all([
      base44.entities.Vehicle.filter({ company_id: company.id }),
      base44.entities.Route.filter({ company_id: company.id }),
      base44.entities.Trip.filter({ company_id: company.id }, "-scheduled_time", 500),
    ]).then(([v, r, t]) => {
      setVehicles(v);
      setRoutes(r);
      setTrips(t);
      statusRef.current = Object.fromEntries(t.map((x) => [x.id, x.status]));
      setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });
    const unsubVehicles = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((x) => x.id !== event.id);
        const rec = event.data;
        if (!rec || rec.company_id !== company.id) return prev;
        const idx = prev.findIndex((x) => x.id === event.id);
        return idx === -1 ? [...prev, rec] : prev.map((x) => (x.id === event.id ? rec : x));
      });
    });
    const unsubTrips = base44.entities.Trip.subscribe((event) => {
      if (event.type === "delete") {
        delete statusRef.current[event.id];
        setTrips((prev) => prev.filter((x) => x.id !== event.id));
        return;
      }
      const rec = event.data;
      if (!rec || rec.company_id !== company.id) return;
      const prevStatus = statusRef.current[rec.id];
      if (
        (rec.status === "arrived" || rec.status === "completed") &&
        prevStatus !== rec.status &&
        rec.pickup_name === pickupRef.current
      ) {
        toast({
          title: rec.status === "arrived" ? "Your ride has arrived" : "Trip completed",
          description: `${rec.vehicle_name || "Vehicle"} · ${rec.pickup_name} → ${rec.dropoff_name}`,
        });
      }
      statusRef.current[rec.id] = rec.status;
      setTrips((prev) => {
        const idx = prev.findIndex((x) => x.id === event.id);
        return idx === -1 ? [...prev, rec] : prev.map((x) => (x.id === event.id ? rec : x));
      });
    });
    return () => {
      unsubVehicles();
      unsubTrips();
    };
  }, [company]);

  const reload = async () => {
    if (!company) return;
    try {
      const [v, r, t] = await Promise.all([
        base44.entities.Vehicle.filter({ company_id: company.id }),
        base44.entities.Route.filter({ company_id: company.id }),
        base44.entities.Trip.filter({ company_id: company.id }, "-scheduled_time", 500),
      ]);
      setVehicles(v);
      setRoutes(r);
      setTrips(t);
      statusRef.current = Object.fromEntries(t.map((x) => [x.id, x.status]));
    } catch {
      loadFailed(reload);
    }
  };

  const switchCompany = () => {
    localStorage.removeItem("tt_company_code");
    localStorage.removeItem("tt_company_access_grant");
    setSheet(null);
    setCompany(null);
    setCompanyPhone("");
    setVehicles([]);
    setRoutes([]);
    setTrips([]);
  };

  const pickupOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    routes.forEach((r) =>
      (r.stops || []).forEach((s) => {
        if (!s.name || seen.has(s.name)) return;
        seen.add(s.name);
        out.push(s);
      })
    );
    if (user?.pickup_lat != null && routes.some(r => r.id === user.pickup_route_id)) out.push({ name: user.pickup_name, lat: user.pickup_lat, lng: user.pickup_lng, route_id: user.pickup_route_id, personal: true });
    return out;
  }, [routes, user?.pickup_lat, user?.pickup_lng, user?.pickup_name, user?.pickup_route_id]);

  const stop = pickupOptions.find((s) => s.name === pickupName) || null;

  // SOS is admin/management-only — never surface the "emergency" status to
  // staff/passengers here (it drives the map pin color and its tooltip text).
  const locatedVehicles = useMemo(
    () => vehicles
      .filter((v) => v.current_lat != null)
      .map((v) => (v.status === "emergency" ? { ...v, status: "on_trip" } : v)),
    [vehicles]
  );

  // Routes that actually stop at the chosen pickup point.
  const servingRoutes = useMemo(
    () => (stop ? routes.filter((r) => stop.personal ? r.id === stop.route_id : (r.stops || []).some((s) => s.name === stop.name)) : []),
    [stop, routes]
  );

  // The bus coming to your stop: the closest *tracking* bus on a route that
  // serves it. Only if no route lists the stop do we fall back to any bus.
  const approaching = useMemo(() => {
    if (!stop) return null;
    const routeIds = new Set(servingRoutes.map((r) => r.id));
    let best = null;
    locatedVehicles.forEach((v) => {
      if (!v.tracking_active) return;
      if (routeIds.size && !routeIds.has(v.route_id)) return;
      const dist = haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng);
      if (best == null || dist < best.dist) best = { v, dist, mins: etaMinutes(dist, v.speed || 25) };
    });
    return best;
  }, [stop, locatedVehicles, servingRoutes]);

  // Refine the straight-line candidate above with an actual driving ETA (roads,
  // not a straight line), falling back to the straight-line estimate while it loads.
  const approachingRoute = useMemo(() => {
    const assigned = approaching ? routes.find(r => r.id === approaching.v.route_id) : null;
    if (!assigned || !stop?.personal) return assigned || null;
    const stops = [...(assigned.stops || [])].sort((a,b)=>(a.order??0)-(b.order??0));
    const leg = locateOnRoute(stops, stop)?.leg;
    if (leg == null) return assigned;
    return { ...assigned, stops: [...stops.slice(0,leg+1), { ...stop, order: (stops[leg].order ?? leg) + 0.5 }, ...stops.slice(leg+1)] };
  }, [approaching, routes, stop]);
  const approachingDriving = useBusEta(approachingRoute, approaching?.v, stop);
  // Better still: how long this bus really takes from here to your stop,
  // learned from its past trips (used once enough of the way is known).
  const travelTimes = useTravelTimes();
  const approachingLearned = useMemo(
    () => (approaching ? etaFromLearned(travelTimes[approaching.v.route_id], approachingRoute, approaching.v, stop) : null),
    [approaching, approachingRoute, travelTimes, stop]
  );

  // "My bus" for group chat: an explicit manual pick always wins, then the
  // bus coming to your stop, then any bus assigned to a route serving it.
  const [chosenVehicleId, setChosenVehicleId] = useState(() => localStorage.getItem("tt_staff_vehicle_id") || "");
  const chooseVehicle = (id) => {
    const value = id === "auto" ? "" : id;
    setChosenVehicleId(value);
    if (value) localStorage.setItem("tt_staff_vehicle_id", value);
    else localStorage.removeItem("tt_staff_vehicle_id");
  };
  const myVehicle = useMemo(() => {
    const chosen = chosenVehicleId ? vehicles.find((v) => v.id === chosenVehicleId) : null;
    if (chosen) return chosen;
    if (approaching?.v) return approaching.v;
    const routeIds = new Set(servingRoutes.map((r) => r.id));
    return vehicles.find((v) => routeIds.has(v.route_id)) || null;
  }, [chosenVehicleId, vehicles, approaching, servingRoutes]);

  const chatUnread = useChatUnread(myVehicle?.id, sheet === "chat");

  const onTheWayTrip = useMemo(
    () => trips.find((t) => t.pickup_name === pickupName && t.status === "on_the_way") || null,
    [trips, pickupName]
  );

  const upcomingTrips = useMemo(
    () =>
      trips
        .filter((t) => t.pickup_name === pickupName && t.status !== "completed" && t.status !== "cancelled")
        .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""))
        .slice(0, 4),
    [trips, pickupName]
  );

  const otherBuses = locatedVehicles.filter((v) => v.id !== approaching?.v?.id);

  if (user?.role === "driver") return <Navigate to="/driver" replace />;
  if (user?.role === "company") return <Navigate to="/company" replace />;
  if (user?.role === "mechanic") return <Navigate to="/mechanic" replace />;
  if (!companiesLoaded) return <AppLayout><BusLoader className="py-8" /></AppLayout>;
  if (!company) {
    return (
      <AppLayout>
        <CodeGate onUnlock={(c) => { setCompany(c); setCompanyPhone(c.phone || ""); }} />
      </AppLayout>
    );
  }
  if (loading) return <AppLayout><BusLoader className="py-8" /></AppLayout>;

  const firstName = (user?.full_name || user?.email || "").split("@")[0].split(" ")[0];
  const showNotifPrompt = !notifDismissed && pushPermission !== "granted" && pushPermission !== "unsupported";

  return (
    <AppLayout>
      <PullToRefresh onRefresh={reload} className="w-full">
        <div className="tt-passenger-dashboard space-y-5">
          <header className="space-y-2">
            <h1 className="text-2xl font-heading font-semibold leading-tight">{greetingWord()}{firstName ? `, ${firstName}` : ""}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-sm text-muted-foreground">{company.name}</p>
              <WeatherWidget variant="chip" />
            </div>
          </header>

          {!userLoc && locError && <LocationPrompt onLocation={setPromptLoc} />}

          <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 items-start">
          <div className="space-y-4 min-w-0">
          <NextBusCard
            stop={stop}
            bus={approaching?.v || null}
            eta={approaching ? (approachingDriving.stale ? approachingDriving : approachingLearned || approachingDriving) : null}
            route={approachingRoute}
            crowdCount={approaching ? crowd[approaching.v.id] || 0 : 0}
            trip={onTheWayTrip}
            onChooseStop={() => setSheet("pickup")}
          />

          <button type="button" onClick={() => toggleStopAlerts(!stopAlerts)} disabled={!pickupName} className="tt-notify-button w-full rounded-xl bg-primary text-primary-foreground p-3 text-center disabled:opacity-50">
            <span className="flex justify-center items-center gap-2 text-sm font-bold"><BellRing className="w-4 h-4" />{stopAlerts ? "Notifications on" : "Notify me"}</span>
            <span className="text-[11px]">When the bus is one stop away</span>
          </button>

          <QuickActions
            onChat={() => setSheet("chat")}
            chatUnread={chatUnread}
            onBadge={() => setSheet("badge")}
            companyPhone={companyPhone}
          />

          {showNotifPrompt && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3">
              <BellRing className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm flex-1">Get a notification when your bus is close.</p>
              <button type="button" onClick={enableNotifications} className="text-sm font-semibold text-primary px-2 py-1">Turn on</button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => { setNotifDismissed(true); localStorage.setItem("tt_notif_prompt_dismissed", "1"); }}
                className="text-muted-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <AdBanner />

          <StaffAlerts companyId={company.id} />

          {upcomingTrips.length > 0 && (
            <section>
              <SectionTitle>Booked rides from {pickupName}</SectionTitle>
              <div className="space-y-2">
                {upcomingTrips.map((t) => (
                  <div key={t.id} className="p-3 rounded-2xl border bg-card space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{t.pickup_name} <span className="text-muted-foreground">→</span> {t.dropoff_name}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtWhen(t.scheduled_time)}</span>
                    </div>
                    <TripSteps status={t.status} />
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <UserRound className="w-3.5 h-3.5" /> {t.driver_name || "Driver TBA"} · {t.vehicle_name || "Vehicle TBA"}
                      {t.passenger_name ? ` · ${t.passenger_name}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          </div>
          <aside className="space-y-5 min-w-0 lg:sticky lg:top-24" aria-label="Live buses">
          <section id="passenger-live-map">
            <SectionTitle>Live map</SectionTitle>
            <div className="rounded-3xl overflow-hidden border h-[420px] lg:h-[580px]">
              <MapboxMap vehicles={locatedVehicles} stops={approachingRoute?.stops || []} userLocation={userLoc} immersive height="100%" />
            </div>
          </section>

          {otherBuses.length > 0 && (
            <section>
              <SectionTitle>{approaching ? "Other buses" : "All buses"}</SectionTitle>
              <div className="rounded-2xl border bg-card divide-y divide-border">
                {otherBuses.map((v) => {
                  const live = v.tracking_active;
                  return (
                    <div key={v.id} className="flex items-center gap-3 p-3">
                      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${live ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Bus className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{v.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {live ? (v.status === "on_trip" ? "On a trip" : "Tracking") : `Parked · last seen ${v.last_location_update ? new Date(v.last_location_update).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}
                        </p>
                      </div>
                      {live && <CrowdBadge count={crowd[v.id] || 0} capacity={v.capacity} />}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          </aside>
          </div>

          <BusAssistant company={company} userLoc={userLoc} />

          <nav className="grid grid-cols-2 gap-2" aria-label="More">
            <button type="button" onClick={() => setSheet("pickup")} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent transition-colors">
              <MapPin className="w-5 h-5 text-primary" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">My pickup</span>
                <span className="block text-xs text-muted-foreground truncate">{pickupName || "Not set"}{stopAlerts ? " · alerts on" : ""}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button type="button" onClick={() => setSheet("help")} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent transition-colors">
              <LifeBuoy className="w-5 h-5 text-primary" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">Help</span>
                <span className="block text-xs text-muted-foreground truncate">Lost items · safety</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </nav>
        </div>
      </PullToRefresh>

      <MyPickupSheet
        open={sheet === "pickup"}
        onOpenChange={(o) => setSheet(o ? "pickup" : null)}
        pickupName={pickupName}
        pickupOptions={pickupOptions}
        onChoosePickup={choosePickup}
        stopAlerts={stopAlerts}
        onToggleStopAlerts={toggleStopAlerts}
        pushUnsupported={pushPermission === "unsupported"}
        companyPhone={companyPhone}
        onSwitchCompany={switchCompany}
      />
      <HelpSheet open={sheet === "help"} onOpenChange={(o) => setSheet(o ? "help" : null)} company={company} vehicles={vehicles} />
      <BadgeSheet open={sheet === "badge"} onOpenChange={(o) => setSheet(o ? "badge" : null)} />
      <ChatSheet
        open={sheet === "chat"}
        onOpenChange={(o) => setSheet(o ? "chat" : null)}
        vehicle={myVehicle}
        vehicles={vehicles}
        chosenVehicleId={chosenVehicleId}
        onChooseVehicle={chooseVehicle}
      />
    </AppLayout>
  );
}
