import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Bell, MapPin, UserRound } from "lucide-react";
import { useIsDark } from "@/lib/useTheme";
import { mapAccentFor } from "@/lib/mapbox";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import CodeGate from "@/components/CodeGate";
import { useCompanyAlerts } from "@/components/StaffAlerts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import useUserLocation from "@/hooks/useUserLocation";
import LocationPrompt from "@/components/LocationPrompt";
import { useChatUnread } from "@/components/staff/StaffGroupChat";
import { MyPickupSheet, HelpSheet, BadgeSheet, ChatSheet, StopSheet, AssistantSheet } from "@/components/staff/StaffSheets";
import useCrowding from "@/hooks/useCrowding";
import { haversineKm, etaMinutes } from "@/lib/geo";
import useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";
import useDrivingEta from "@/hooks/useDrivingEta";
import PullToRefresh from "@/components/PullToRefresh";
import { useToast } from "@/components/ui/use-toast";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import { routeProgress } from "@/components/TripProgress";
import ArrivalHero from "@/components/passenger/ArrivalHero";
import RouteTimeline from "@/components/passenger/RouteTimeline";
import StopChooser from "@/components/passenger/StopChooser";
import {
  AlertBand, BookedRides, MoreList, OtherBuses, OtherBusesOverlay, SectionHead, SponsorLine, StopAlertRow, TripActions, TripFacts,
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
    return out;
  }, [routes]);

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
    () => (stop ? routes.filter((r) => (r.stops || []).some((s) => s.name === stop.name)) : []),
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
  const approachingOrigin = approaching ? { lat: approaching.v.current_lat, lng: approaching.v.current_lng } : null;
  const approachingDest = stop ? { lat: stop.lat, lng: stop.lng } : null;
  const approachingDriving = useDrivingEta(approachingOrigin, approachingDest, approaching?.v?.speed || 25);
  const approachingRoute = approaching ? routes.find((r) => r.id === approaching.v.route_id) || null : null;
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
  const eta = approaching ? approachingLearned || approachingDriving : null;
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
  const stopEtas = useStopEtas({ bus: busOnMap, route: timelineRoute, stops: upcomingStops, record: timelineRoute ? travelTimes[timelineRoute.id] : null, enabled: onTrip });
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);

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
  if (loading) return <AppLayout variant="passenger"><BusLoader className="py-8" /></AppLayout>;

  const mins = tripState.mins;
  const roundMins = mins != null ? Math.max(1, Math.round(mins)) : null;
  const callout = !busOnMap || !stop ? null
    : tripState.kind === "arriving" ? { primary: "Arriving", secondary: stop.name }
      : tripState.kind === "signal_lost" ? { primary: "No signal", secondary: `Last seen ${clock(busOnMap.last_location_update)}`, tone: "lost" }
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
                  <ArrivalHero state={tripState} stop={stop} eta={eta} trip={onTheWayTrip} now={now} onChangeStop={() => setSheet("stop")} accent={accent} />
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
              <SectionHead id="tt-live-map" title="Live map" aside={<Link to="/route-explorer" className="text-body-sm font-semibold underline-offset-4 hover:underline">Open map</Link>} />
              <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted lg:h-[620px]" />}>
                <LiveTransitMap
                  className="h-64 rounded-2xl border border-border sm:h-80 lg:h-[620px]"
                  vehicles={locatedVehicles}
                  focusVehicleId={busOnMap?.id || null}
                  stops={mapStops}
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
            </section>
            <div className="lg:order-3">
              <OtherBuses buses={otherBuses} crowd={crowd} title={approaching ? "Other buses" : "All buses"} now={now} />
              <BookedRides trips={upcomingTrips} stopName={pickupName} />
              <MoreList
                companyName={companyName}
                companyPhone={companyPhone}
                onBadge={() => setSheet("badge")}
                onAssistant={() => setSheet("assistant")}
                onHelp={() => setSheet("help")}
                onPickup={() => setSheet("pickup")}
              />
              <SponsorLine />
            </div>
          </div>
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
