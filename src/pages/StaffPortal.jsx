import CompanyBanner from "@/components/CompanyBanner";
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Bell, MapPin, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import CodeGate from "@/components/CodeGate";
import { takePendingJoinCode, markCompanyLeft, hasLeftCompany } from "@/lib/companyJoin";
import { useCompanyAlerts } from "@/components/StaffAlerts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import useUserLocation from "@/hooks/useUserLocation";
import LocationPrompt from "@/components/LocationPrompt";
import { useChatUnread } from "@/components/staff/StaffGroupChat";
import { MyPickupSheet, HelpSheet, BadgeSheet, ChatSheet, StopSheet, AssistantSheet } from "@/components/staff/StaffSheets";
import useCrowding from "@/hooks/useCrowding";
import { haversineKm, etaMinutes } from "@/lib/geo";
import useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";
import useBusEta from "@/hooks/useBusEta";
import { locationIsStale } from "@/lib/busEta";
import { locateOnRoute } from "@/lib/travelTimes";
import PullToRefresh from "@/components/PullToRefresh";
import { useToast } from "@/components/ui/use-toast";
import { loadFailed } from "@/lib/loadFailed";
import AccessRecovery from '@/components/system/AccessRecovery';
import { companyGrantRejected, sessionRejected } from '@/lib/requestError';
import { withRateLimitRetry } from '@/lib/scopedEntities';
import JourneyLoading from "@/components/JourneyLoading";
import { callDriverPhone } from "@/lib/driverPhone";
import { routeProgress } from "@/components/TripProgress";
import ArrivalHero from "@/components/passenger/ArrivalHero";
import RouteTimeline from "@/components/passenger/RouteTimeline";
import StopChooser from "@/components/passenger/StopChooser";
import {
  AlertBand, BookedRides, MapClosed, PickupCard, MapToggle, OtherBusesOverlay, PassengerChatBubble, SectionHead, SponsorLine, StopAlertRow, TripActions, TripFacts,
} from "@/components/passenger/PassengerSections";
import { clock, passengerTripState, sortStops } from "@/components/passenger/passengerState";
import useStopEtas from "@/components/passenger/useStopEtas";

// The live 3D map (mapbox-gl + three.js) loads after the page around it.
const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

// Re-render now and then so "updated 20 seconds ago" stays true.
function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Drivers sign in to the phone app with their own Google account, which has
// no passenger company. Before asking for a company code, check whether an
// administrator set this account up as a driver and, if so, open the driver
// phone app instead.
function DriverPhoneCheck({ children }) {
  const [state, setState] = useState("checking");
  useEffect(() => {
    let alive = true;
    callDriverPhone("me")
      .then((data) => alive && setState(data?.driver?.email ? "driver" : "passenger"))
      .catch(() => alive && setState("passenger"));
    return () => { alive = false; };
  }, []);
  if (state === "driver") return <Navigate to="/driver-phone" replace />;
  if (state === "checking") return <JourneyLoading fullScreen={false} label="Checking your account…" onRetry={() => window.location.reload()} />;
  return children;
}

export default function StaffPortal() {
  const { user } = useAuth();
  const { permission: pushPermission, enableNotifications } = usePushNotifications({ email: user?.email, role: user?.role, companyId: user?.company_id });
  const { toast } = useToast();
  const pickupRef = useRef("");
  const statusRef = useRef({});
  const [company, setCompany] = useState(null);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [companyError, setCompanyError] = useState(false);
  const companyAttempt = useRef(0);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [pickupName, setPickupName] = useState(() => localStorage.getItem("tt_staff_pickup") || "");
  const [companyPhone, setCompanyPhone] = useState("");
  const [stopAlerts, setStopAlerts] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // "pickup" | "stop" | "help" | "badge" | "chat" | "assistant" | null
  // Links from the More tab open a sheet here (/staff?sheet=help).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const want = params.get("sheet");
    if (!want || !["pickup", "stop", "help", "badge", "chat", "assistant"].includes(want)) return;
    setSheet(want);
    const next = new URLSearchParams(params);
    next.delete("sheet");
    setParams(next, { replace: true });
  }, [params, setParams]);

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

  const choosePickup = async (v) => {
    if (user) await base44.auth.updateMe({ favorite_stop: v });
    setPickupName(v);
    try { localStorage.setItem("tt_staff_pickup", v); } catch { /* Account still holds the saved pickup. */ }
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

  // A company join QR scanned in this tab: check its code instead of
  // restoring the saved company (it may be a different company).
  const [joinCode] = useState(() => takePendingJoinCode());

  // Never erase a saved company pass just because the connection failed.
  const restoreCompany = useCallback(async () => {
    const attempt = ++companyAttempt.current;
    setCompaniesLoaded(false);
    setCompanyError(false);
    try {
      localStorage.removeItem('tt_company_code');
      const grant = localStorage.getItem('tt_company_access_grant');
      if (joinCode) return;
      // restore: a device that has lost its saved pass (a new phone, a cleared
      // browser) still gets back into the company this account belongs to, so
      // staff aren't asked for the company code over and over. Never when they
      // deliberately switched company.
      // The platform refuses bursts of calls, and a device linking for the
      // first time makes several at once — one rejected call used to look like
      // the company was unreachable.
      const { data } = await withRateLimitRetry(() => base44.functions.invoke('companyAccess', { action: 'context', grant, restore: !hasLeftCompany() }));
      if (attempt !== companyAttempt.current) return;
      if (data.grant) localStorage.setItem('tt_company_access_grant', data.grant);
      setCompany(data.company);
      setCompanyPhone(data.company.phone || '');
    } catch (error) {
      if (attempt !== companyAttempt.current) return;
      if (companyGrantRejected(error)) {
        localStorage.removeItem('tt_company_access_grant');
        setCompany(null);
      } else if (sessionRejected(error)) {
        // The sign-in itself is gone, not the company pass. Only signing in
        // again can fix that — the company screen's Retry never could, so
        // passengers were left stuck on "Couldn't reconnect to your company"
        // every time they opened the app.
        base44.auth.redirectToLogin(window.location.href);
      } else setCompanyError(true);
    } finally {
      if (attempt === companyAttempt.current) setCompaniesLoaded(true);
    }
  }, [user?.id, joinCode]);
  useEffect(() => {
    restoreCompany();
    return () => { companyAttempt.current += 1; };
  }, [restoreCompany]);

  // The company's workplace: where every pickup passenger is dropped off.
  const [workplace, setWorkplace] = useState(null);

  // Everything the passenger home needs — the workplace, the company's
  // vehicles, its routes and the rides still to come — arrives in one call.
  // It used to be four separate calls, and on a phone each one could hit the
  // app's rate limit and then sit waiting to be retried, which is what made
  // the passenger app slow to open.
  const loadData = useCallback(async () => {
    const { data } = await withRateLimitRetry(() => base44.functions.invoke('entityAccess', { entity: 'Bootstrap', operation: 'list', company_id: company.id }));
    const result = data.result || {};
    setWorkplace(result.workplace || null);
    setVehicles(result.vehicles || []);
    setRoutes(result.routes || []);
    setTrips(result.trips || []);
    statusRef.current = Object.fromEntries((result.trips || []).map((x) => [x.id, x.status]));
  }, [company?.id]);

  useEffect(() => {
    if (!company) return undefined;
    setLoading(true);
    loadData().catch(() => loadFailed()).finally(() => setLoading(false));
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
  }, [company, loadData]);

  const reload = async () => {
    if (!company) return;
    try { await loadData(); } catch { loadFailed(reload); }
  };

  const switchCompany = () => {
    localStorage.removeItem("tt_company_code");
    localStorage.removeItem("tt_company_access_grant");
    markCompanyLeft();
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
        out.push({ ...s, route_id: r.id, routeName: r.name });
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

  // Presentation only: which arrival state to show, from the values above.
  const now = useNow();
  const alerts = useCompanyAlerts(company?.id, 3);
  const [dismissedAlerts, setDismissedAlerts] = useState({});
  const eta = approaching ? (approachingDriving.stale ? approachingDriving : approachingLearned || approachingDriving) : null;
  const tripState = passengerTripState({ stop, approaching, eta, myVehicle, now });
  const timelineRoute = approachingRoute
    || (myVehicle ? routes.find((r) => r.id === myVehicle.route_id && (r.stops || []).some((s) => s.name === stop?.name)) : null)
    || servingRoutes[0] || null;
  const mapStops = useMemo(() => sortStops(timelineRoute?.stops).filter((s) => s.lat != null && s.lng != null), [timelineRoute]);
  const onTrip = ["live", "arriving", "signal_lost"].includes(tripState.kind);
  const busOnMap = tripState.bus && tripState.bus.current_lat != null ? locatedVehicles.find((v) => v.id === tripState.bus.id) || null : null;
  const nextStopIndex = onTrip && busOnMap ? routeProgress(mapStops, busOnMap.current_lat, busOnMap.current_lng)?.nextIndex ?? null : null;
  // Times for each stop ahead, from the same ETA sources as the arrival time.
  const upcomingStops = useMemo(() => {
    if (nextStopIndex == null || !stop) return [];
    const mine = mapStops.findIndex((x) => x.name === stop.name);
    const end = mine >= nextStopIndex ? mine : mapStops.length - 1;
    return [...mapStops.slice(nextStopIndex, end + 1), ...(end < mapStops.length - 1 ? [mapStops[mapStops.length - 1]] : [])];
  }, [mapStops, nextStopIndex, stop]);
  // How many stops the bus still has before yours, from the same route progress.
  const myStopIndex = stop ? mapStops.findIndex((x) => x.name === stop.name) : -1;
  const stopsAway = nextStopIndex != null && myStopIndex >= nextStopIndex ? myStopIndex - nextStopIndex : null;
  // Same rule as the main estimate: no stop times from a position more than
  // two minutes old.
  const positionStale = busOnMap ? locationIsStale(busOnMap, now) : false;
  const stopEtas = useStopEtas({ bus: busOnMap, route: timelineRoute, stops: upcomingStops, record: timelineRoute ? travelTimes[timelineRoute.id] : null, enabled: onTrip && !positionStale });

  if (user?.role === "driver") return <Navigate to="/driver-phone" replace />;
  if (user?.role === "company") return <Navigate to="/company" replace />;
  if (user?.role === "mechanic") return <Navigate to="/mechanic" replace />;
  // Same layout as the state below, so the page doesn't jump between the
  // company check and the data load — it reads as one wait.
  if (!companiesLoaded) return <AppLayout variant="passenger"><JourneyLoading fullScreen={false} context="Passenger" label="Reconnecting to your company…" company={company} onRetry={restoreCompany} /></AppLayout>;
  if (companyError) return <AppLayout><AccessRecovery onRetry={restoreCompany} title="Couldn't reconnect to your company" description="Your saved company access has not been removed. Check your connection, then try again." /></AppLayout>;
  if (!company) {
    return (
      <AppLayout>
        <DriverPhoneCheck>
          <CodeGate initialCode={joinCode} onUnlock={(c) => { setCompany(c); setCompanyPhone(c.phone || ""); }} />
        </DriverPhoneCheck>
      </AppLayout>
    );
  }
  if (loading) return <AppLayout variant="passenger"><JourneyLoading fullScreen={false} context="Passenger" label="Loading your buses and arrival times…" company={company} vehicle={vehicles[0]} onRetry={() => window.location.reload()} /></AppLayout>;

  const mins = tripState.mins;
  const roundMins = mins != null ? Math.max(1, Math.round(mins)) : null;
  const callout = !busOnMap || !stop ? null
    : tripState.kind === "arriving" ? { primary: "Arriving", secondary: stop.name }
      : tripState.kind === "signal_lost" ? { primary: "Signal lost", secondary: `Last seen ${clock(busOnMap.last_location_update)}`, tone: "lost" }
        : tripState.kind === "live" && roundMins != null ? { primary: `${roundMins} min`, secondary: `to ${stop.name}` }
          : null;

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts[a.id]);
  const notice = visibleAlerts[0];
  const companyName = company.name;

  const mapSummary = stop && tripState.bus ? (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
      <p className="text-body-sm text-muted-foreground">{tripState.bus.name} to {stop.name}</p>
      <p className="mt-1 font-display text-display font-semibold tabular-nums">
        {tripState.kind === "arriving" ? "Arriving" : roundMins != null && onTrip ? `${roundMins} min` : tripState.kind === "not_started" ? "Not started" : "No arrival time"}
      </p>
      {nextStopIndex != null && mapStops[nextStopIndex] && <p className="text-body-sm">Next stop: <b>{mapStops[nextStopIndex].name}</b>{stopEtas[mapStops[nextStopIndex].name] && onTrip ? ` · ${Math.max(1, Math.round(stopEtas[mapStops[nextStopIndex].name].mins))} min` : ""}</p>}
    </div>
  ) : null;

  const nextStop = nextStopIndex != null ? mapStops[nextStopIndex] : null;
  const myStopEta = stop ? stopEtas[stop.name] : null;
  const mapTopCard = stop ? (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
      <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="block truncate font-bold">{stop.name}</span>
        <span className="block text-body-sm text-muted-foreground">
          {roundMins != null && onTrip ? `${roundMins} min` : "No arrival time yet"}
          {myStopEta?.km != null && onTrip ? ` · ${myStopEta.km < 1 ? `${Math.round(myStopEta.km * 1000)} m` : `${myStopEta.km.toFixed(1)} km`}` : ""}
        </span>
      </p>
    </div>
  ) : null;
  const serving = new Set(servingRoutes.map((r) => r.id));
  const routeBuses = otherBuses.filter((v) => serving.has(v.route_id));

  return (
    <AppLayout variant="passenger">
      <PullToRefresh onRefresh={reload}>
        <div className="mx-auto max-w-2xl lg:grid lg:max-w-none lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-14">
          {/* Left: your trip */}
          <div className="min-w-0">
            <div className="flex h-[60px] items-center justify-between pl-6 pr-3 md:hidden">
              <p className="font-heading text-title font-bold tracking-[-0.01em]">Transit<span className="text-primary">Track</span></p>
              <div className="flex items-center">
                <Link to="/notifications" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-accent" aria-label="Messages and announcements">
                  <Bell className="h-[22px] w-[22px]" aria-hidden="true" />
                </Link>
                <Link to="/account" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-accent" aria-label="Account">
                  <UserRound className="h-[22px] w-[22px]" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <CompanyBanner name={companyName} logoUrl={company.logo_url} compact className="mx-6 mb-4 lg:mx-0" />
            <div className="tt-passenger-greeting mx-6 mb-5 lg:mx-0"><p className="text-body-sm text-muted-foreground">Your journey, connected</p><h1 className="text-headline font-bold">Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</h1></div>
            <PickupCard
              pickupName={user?.pickup_lat != null ? user.pickup_name || "Your pinned pickup" : ""}
              dropoffName={workplace?.name || ""}
              onOpen={() => setSheet("pickup")}
            />
            {tripState.kind === "choose" ? (
              <>
                <StopChooser routes={routes} value={pickupName} onChoose={choosePickup} userLoc={userLoc} companyName={companyName} />
                {!userLoc && locError && <div className="px-6 pb-6 lg:px-0"><LocationPrompt onLocation={setPromptLoc} /></div>}
              </>
            ) : (
              <>
                {tripState.kind === "problem" && (
                  <AlertBand
                    tone="danger"
                    title={`${tripState.bus.name} is out of service`}
                    body={`It has been taken off the road for now. Message the driver${companyPhone ? ` or call ${companyName}` : ""} to find another way.`}
                  />
                )}
                {notice && (
                  <div className={tripState.kind === "problem" ? "mt-px" : ""}>
                    <AlertBand
                      tone="warning"
                      title={notice.type === "info" ? notice.title || "Announcement" : notice.type === "taxi_arrived" ? "Taxi arrived" : "Bus arrived"}
                      body={notice.message}
                      meta={[notice.company_name || companyName, notice.vehicle_name, notice.created_date && clock(notice.created_date)].filter(Boolean).join(", ")}
                      onDismiss={() => setDismissedAlerts((d) => ({ ...d, [notice.id]: true }))}
                      action={visibleAlerts.length > 1 ? <Link to="/notifications" className="mt-2 inline-block text-body-sm font-semibold underline underline-offset-4">{visibleAlerts.length - 1} more</Link> : null}
                    />
                  </div>
                )}
                <div className={tripState.kind === "problem" || notice ? "pt-4" : ""}>
                  <ArrivalHero state={tripState} stop={stop} eta={eta} trip={onTheWayTrip} now={now} onChangeStop={() => setSheet("stop")} routeName={timelineRoute?.name || ""} stopsAway={stopsAway} />
                </div>
                {timelineRoute && (
                  <RouteTimeline route={timelineRoute} bus={tripState.bus} kind={tripState.kind} stopName={stop.name} mins={mins} stopEtas={stopEtas} now={now} />
                )}
                <StopAlertRow
                  busName={tripState.bus?.name}
                  stopAlerts={stopAlerts}
                  onToggle={toggleStopAlerts}
                  pushPermission={pushPermission}
                  onEnablePush={enableNotifications}
                />
                <TripActions onChat={() => setSheet("chat")} chatUnread={chatUnread} />
                <TripFacts bus={tripState.bus} crowdCount={tripState.bus ? crowd[tripState.bus.id] || 0 : 0} />
                {!userLoc && locError && <div className="px-6 pt-6 lg:px-0"><LocationPrompt onLocation={setPromptLoc} /></div>}
              </>
            )}
          </div>

          {/* Right: map and details */}
          <div className="flex min-w-0 flex-col">
            <section className="px-6 pt-10 lg:order-1 lg:px-0 lg:pt-0" aria-labelledby="tt-live-map">
              <SectionHead id="tt-live-map" title="Live map" aside={mapOpen ? <MapToggle open onToggle={() => setMapOpen(false)} /> : null} />
              {!mapOpen ? (
                <MapClosed onOpen={() => setMapOpen(true)}>See {tripState.bus?.name || "the buses"} moving on a 3D map. The map uses more data and battery.</MapClosed>
              ) : (
              <div id="passenger-live-map">
              <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted lg:h-[620px]" />}>
                <LiveTransitMap
                  defaultSatellite
                  className="h-64 rounded-2xl border border-border sm:h-80 lg:h-[620px]"
                  vehicles={locatedVehicles}
                  focusVehicleId={busOnMap?.id || null}
                  routes={routes}
                  stops={mapStops}
                  dropoff={workplace}
                  myStop={stop}
                  nextStopIndex={nextStopIndex}
                  userLocation={userLoc}
                  callout={callout}
                  summary={mapSummary}
                  topCard={mapTopCard}
                  overlay={<OtherBusesOverlay buses={routeBuses} stop={stop} now={now} />}
                  label={stop ? `Live map of ${tripState.bus?.name || "buses"} and ${stop.name}` : "Live map of buses"}
                />
              </Suspense>
              </div>
              )}
            </section>
            <div className="lg:order-3">
              <BookedRides trips={upcomingTrips} stopName={pickupName} />
              <SponsorLine />
            </div>
          </div>
        </div>
      </PullToRefresh>

      <PassengerChatBubble unread={chatUnread} open={sheet === "chat"} onClick={() => setSheet(sheet === "chat" ? null : "chat")} />
      <MyPickupSheet
        open={sheet === "pickup"}
        onOpenChange={(o) => setSheet(o ? "pickup" : null)}
        pickupName={pickupName}
        pickupOptions={pickupOptions}
        routes={routes}
        userLoc={userLoc}
        onChoosePickup={choosePickup}
        stopAlerts={stopAlerts}
        onToggleStopAlerts={toggleStopAlerts}
        pushUnsupported={pushPermission === "unsupported"}
        companyPhone={companyPhone}
        onSwitchCompany={switchCompany}
      />
      <StopSheet open={sheet === "stop"} onOpenChange={(o) => setSheet(o ? "stop" : null)} routes={routes} value={pickupName} onChoose={choosePickup} userLoc={userLoc} />
      <AssistantSheet open={sheet === "assistant"} onOpenChange={(o) => setSheet(o ? "assistant" : null)} company={company} userLoc={userLoc} />
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