import PassengerExperience from "@/components/passenger/PassengerExperience";
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams, useLocation } from "react-router-dom";
import { MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import CodeGate from "@/components/CodeGate";
import AccountWaiting from "@/components/AccountWaiting";
import { takePendingJoinCode, markCompanyLeft, hasLeftCompany } from "@/lib/companyJoin";
import { useCompanyAlerts } from "@/components/StaffAlerts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import useUserLocation from "@/hooks/useUserLocation";
import { useChatUnread } from "@/components/staff/StaffGroupChat";
import { MyPickupSheet, PassengerSettingsSheet, HelpSheet, BadgeSheet, ChatSheet, StopSheet, AssistantSheet } from "@/components/staff/StaffSheets";
import { savePassengerSnapshot, loadPassengerSnapshot, clearPassengerSnapshot } from "@/lib/passengerSnapshot";
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
import {
  AlertBand, OtherBusesOverlay,
} from "@/components/passenger/PassengerSections";
import { clock, passengerTripState, sortStops } from "@/components/passenger/passengerState";
import useStopEtas from "@/components/passenger/useStopEtas";
import { drawnRoad } from "@/lib/routeRoad";
import { pickupMissesBus } from "@/lib/pickupOnBus";
import { Button } from "@/components/ui/button";

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
  const { user, checkUserAuth, logout } = useAuth();
  const { pathname } = useLocation();
  const view = pathname === "/journey" ? "journey" : pathname === "/my-card" ? "card" : pathname === "/more" ? "more" : "home";
  // A company join QR scanned in this tab: check its code instead of
  // restoring the saved company (it may be a different company).
  const [joinCode] = useState(() => takePendingJoinCode());
  // The passenger home as this person last saw it on this device (up to a day
  // old): shown straight away, while the company check and the fresh data load
  // run together in the background and replace it.
  const [snapshot] = useState(() => (user?.id && !joinCode ? loadPassengerSnapshot(user.id) : null));
  // Something is on screen, so background refreshes must not swap it for a spinner.
  const shownRef = useRef(!!snapshot);
  const [lastSynced, setLastSynced] = useState(() => snapshot?.savedAt || null);
  const [offline, setOffline] = useState(false);
  // The account check is recreated on every sign-in update; read the latest
  // without restarting the company check each time.
  const checkAuthRef = useRef(checkUserAuth);
  checkAuthRef.current = checkUserAuth;
  const { permission: pushPermission, enableNotifications } = usePushNotifications({ email: user?.email, role: user?.role, companyId: user?.company_id });
  const { toast } = useToast();
  const pickupRef = useRef("");
  const statusRef = useRef(Object.fromEntries((snapshot?.result?.trips || []).map((x) => [x.id, x.status])));
  const [company, setCompany] = useState(() => snapshot?.company || null);
  const [companiesLoaded, setCompaniesLoaded] = useState(!!snapshot);
  // The bus the company put this passenger on (Admin → Passengers): { id, name } or null.
  const [myBus, setMyBus] = useState(() => snapshot?.myBus || null);
  // Where this passenger actually gets on when their pickup is merged with
  // neighbours' along a drawn road: { name, lat, lng, shared_with, moved_m } or null.
  const [sharedStop, setSharedStop] = useState(null);
  const [companyError, setCompanyError] = useState(false);
  const companyAttempt = useRef(0);
  const [vehicles, setVehicles] = useState(() => snapshot?.result?.vehicles || []);
  const [routes, setRoutes] = useState(() => snapshot?.result?.routes || []);
  const [trips, setTrips] = useState(() => snapshot?.result?.trips || []);
  const [pickupName, setPickupName] = useState(() => localStorage.getItem("tt_staff_pickup") || "");
  const [companyPhone, setCompanyPhone] = useState(() => snapshot?.company?.phone || "");
  const [stopAlerts, setStopAlerts] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // "pickup" | "stop" | "help" | "badge" | "chat" | "assistant" | null
  // Links from the More tab open a sheet here (/staff?sheet=help).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const want = params.get("sheet");
    if (!want || !["pickup", "stop", "help", "badge", "chat", "assistant", "notifications"].includes(want)) return;
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
    if (on && pushPermission !== "granted" && !(await enableNotifications())) return;
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
  const { location: watchedLoc } = useUserLocation();
  // Fallback fix from the explicit "Allow location" prompt, for when the
  // background watch was denied or timed out.
  const userLoc = watchedLoc;
  const [loading, setLoading] = useState(!snapshot);

  // Never erase a saved company pass just because the connection failed.
  const restoreCompany = useCallback(async () => {
    const attempt = ++companyAttempt.current;
    if (!shownRef.current) setCompaniesLoaded(false);
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
      setMyBus(data.my_bus || null);
    } catch (error) {
      if (attempt !== companyAttempt.current) return;
      // Offline, or a saved home is already showing: keep showing it, marked as saved.
      const saved = navigator.onLine === false || (shownRef.current && !companyGrantRejected(error) && !sessionRejected(error))
        ? loadPassengerSnapshot(user?.id) : null;
      if (saved) {
        setCompany(saved.company); setCompanyPhone(saved.company.phone || ""); setMyBus(saved.myBus);
        setLastSynced(saved.savedAt); setOffline(true);
      } else if (companyGrantRejected(error)) {
        localStorage.removeItem('tt_company_access_grant');
        clearPassengerSnapshot();
        shownRef.current = false;
        setCompany(null);
      } else if (sessionRejected(error)) {
        // Maybe the sign-in itself is gone, not the company pass. Ask the
        // account check: if the server really ended the sign-in, the app opens
        // the login page and comes back here afterwards. One refused call alone
        // must not send a signed-in person to the login page — brand-new
        // accounts went there, signed in again and landed straight back here,
        // round and round.
        await checkAuthRef.current();
        if (attempt === companyAttempt.current) setCompanyError(true);
      } else setCompanyError(true);
    } finally {
      if (attempt === companyAttempt.current) setCompaniesLoaded(true);
    }
  }, [user?.id, joinCode]);
  useEffect(() => {
    restoreCompany();
    return () => { companyAttempt.current += 1; };
  }, [restoreCompany]);
  // "Check again" on the waiting screen: the account first (an admin may have
  // made it a manager, mechanic or driver, which opens their own app), then
  // the company, without swapping the screen for the loading one.
  const checkAgain = useCallback(async () => {
    await checkAuthRef.current?.();
    try {
      const grant = localStorage.getItem('tt_company_access_grant');
      const { data } = await withRateLimitRetry(() => base44.functions.invoke('companyAccess', { action: 'context', grant, restore: !hasLeftCompany() }));
      if (!data?.company) return;
      if (data.grant) localStorage.setItem('tt_company_access_grant', data.grant);
      setCompany(data.company);
      setCompanyPhone(data.company.phone || '');
      setMyBus(data.my_bus || null);
    } catch { /* still no company: keep waiting */ }
  }, []);
  // An admin can add or remove this passenger's bus at any time: check again
  // when the app comes back to the screen, and every minute while it's open.
  const refreshMyBus = useCallback(async () => {
    const grant = localStorage.getItem('tt_company_access_grant');
    if (!grant || !navigator.onLine) return;
    try {
      const { data } = await base44.functions.invoke('companyAccess', { action: 'context', grant });
      if (data?.company) setMyBus(data.my_bus || null);
    } catch { /* keep what's shown; the next check tries again */ }
  }, []);
  const refreshSharedStop = useCallback(async () => {
    if (user?.pickup_lat == null || !user?.pickup_route_id) { setSharedStop(null); return; }
    try {
      const { data } = await base44.functions.invoke('routeStops', { action: 'mine' });
      setSharedStop(data?.stop || null);
    } catch { /* keep the pickup as saved */ }
  }, [user?.pickup_lat, user?.pickup_lng, user?.pickup_route_id]);
  useEffect(() => { if (company?.id) refreshSharedStop(); }, [company?.id, refreshSharedStop]);
  useEffect(() => {
    if (!company?.id) return undefined;
    const onShow = () => { if (document.visibilityState === 'visible') refreshMyBus(); };
    const id = setInterval(onShow, 60_000);
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
  }, [company?.id, refreshMyBus]);
  // The company check makes a brand-new account (platform role "user") a
  // passenger; refresh the profile so the rest of the app sees it too.
  useEffect(() => {
    if (companiesLoaded && user?.role === 'user') checkAuthRef.current();
  }, [companiesLoaded, user?.role]);

  // The company's workplace: where every pickup passenger is dropped off.
  const [workplace, setWorkplace] = useState(() => snapshot?.result?.workplace || null);

  // Everything the passenger home needs — the workplace, the company's
  // vehicles, its routes and the rides still to come — arrives in one call.
  // It used to be four separate calls, and on a phone each one could hit the
  // app's rate limit and then sit waiting to be retried, which is what made
  // the passenger app slow to open.
  const loadData = useCallback(async () => {
    const saved = navigator.onLine === false ? loadPassengerSnapshot(user?.id, company.id) : null;
    const result = saved ? saved.result : (await withRateLimitRetry(() => base44.functions.invoke('entityAccess', { entity: 'Bootstrap', operation: 'list', company_id: company.id }))).data.result || {};
    setWorkplace(result.workplace || null);
    setVehicles(result.vehicles || []);
    setRoutes(result.routes || []);
    setTrips(result.trips || []);
    setLastSynced(saved ? saved.savedAt : savePassengerSnapshot(user?.id,company,myBus,result));
    setOffline(!!saved);
    statusRef.current = Object.fromEntries((result.trips || []).map((x) => [x.id, x.status]));
  }, [company?.id, user?.id]);

  // Keyed on the company's id: the company check returning the same company the
  // saved home showed must not load everything a second time.
  const companyId = company?.id;
  useEffect(() => {
    if (!companyId) return undefined;
    if (!shownRef.current) setLoading(true);
    loadData().then(() => { shownRef.current = true; }).catch(() => loadFailed()).finally(() => setLoading(false));
    const unsubVehicles = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((x) => x.id !== event.id);
        const rec = event.data;
        if (!rec || rec.company_id !== companyId) return prev;
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
      if (!rec || rec.company_id !== companyId) return;
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
  }, [companyId, loadData]);

  const reload = async () => {
    if (!company) return;
    try { await loadData(); } catch { loadFailed(reload); }
  };

  const switchCompany = () => {
    localStorage.removeItem("tt_company_code");
    localStorage.removeItem("tt_company_access_grant");
    markCompanyLeft();
    clearPassengerSnapshot();
    shownRef.current = false;
    setSheet(null);
    setCompany(null);
    setCompanyPhone("");
    setMyBus(null);
    setVehicles([]);
    setRoutes([]);
    setTrips([]);
  };

  // The route of the bus the company put this passenger on. With one, only
  // its stops are offered and matched: other routes' stops (often with the
  // same names, like "Stop 5") are places this bus doesn't go.
  const assignedRoute = useMemo(() => {
    const id = myBus ? vehicles.find((v) => v.id === myBus.id)?.route_id : null;
    return id ? routes.find((r) => r.id === id) || null : null;
  }, [myBus, vehicles, routes]);
  const pickupRoutes = useMemo(() => (assignedRoute ? [assignedRoute] : routes), [assignedRoute, routes]);

  const pickupOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    pickupRoutes.forEach((r) =>
      (r.stops || []).forEach((s) => {
        if (!s.name || seen.has(s.name)) return;
        seen.add(s.name);
        out.push({ ...s, route_id: r.id, routeName: r.name });
      })
    );
    // Your own pickup, or the shared stop it was merged into along the road:
    // only while your bus drives past it.
    if (user?.pickup_lat != null && routes.some(r => r.id === user.pickup_route_id) && !(assignedRoute && pickupMissesBus(user, assignedRoute))) {
      const routeId = assignedRoute ? assignedRoute.id : user.pickup_route_id;
      if (!seen.has(user.pickup_name)) out.push({ name: user.pickup_name, lat: sharedStop?.lat ?? user.pickup_lat, lng: sharedStop?.lng ?? user.pickup_lng, route_id: routeId, personal: true, shared: sharedStop });
    }
    return out;
  }, [pickupRoutes, routes, assignedRoute, user, sharedStop]);

  const returnBus = myBus ? vehicles.find(v=>v.id===myBus.id) : null;
  const returning = returnBus?.trip_direction === "to_home";
  // Where the passenger is picked up (and, going home, dropped off): one of
  // their bus's stops, or their own pickup beside its road.
  const homeStop = pickupOptions.find((s) => s.name === pickupName) || null;
  const stop = returning ? (workplace?.lat!=null && workplace?.lng!=null ? workplace : null) : homeStop;

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
    () => (stop ? pickupRoutes.filter((r) => stop.personal ? r.id === stop.route_id : (r.stops || []).some((s) => s.name === stop.name)) : []),
    [stop, pickupRoutes]
  );

  // The bus coming to your stop: your own bus, while it's tracking.
  const approaching = useMemo(() => {
    if (returning || !stop || !myBus) return null;
    const v = locatedVehicles.find((x) => x.id === myBus.id);
    if (!v || !v.tracking_active) return null;
    const dist = haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng);
    return { v, dist, mins: etaMinutes(dist, v.speed || 25) };
  }, [stop, locatedVehicles, myBus, returning]);

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

  // "My bus" is only ever the bus the company assigned. With none assigned the
  // app shows no bus: it no longer guesses one from the stop or keeps a bus
  // picked on this phone (that pick outlived the admin removing the bus).
  useEffect(() => { try { localStorage.removeItem("tt_staff_vehicle_id"); } catch { /* storage blocked */ } }, []);
  const myVehicle = useMemo(
    () => (myBus ? vehicles.find((v) => v.id === myBus.id) || { id: myBus.id, name: myBus.name } : null),
    [myBus, vehicles]
  );
  // The road the assigned bus drives. A pickup saved somewhere else is one
  // the bus doesn't stop at: ask the passenger to pick again on its road, and
  // only offer spots on that road while they do.
  const busRoute = assignedRoute;
  const pinnerBus = busRoute ? { name: myVehicle?.name || "Your bus", routeId: busRoute.id, routeName: busRoute.name || "" } : null;
  // A company stop on the bus's route is a fine pickup, wherever the
  // passenger's own roadside spot is.
  const onBusStop = !!stop && !stop.personal && !!busRoute && (busRoute.stops || []).some((s) => s.name === stop.name);
  const missesBus = !onBusStop && pickupMissesBus(user, busRoute);
  // A saved stop the bus doesn't make (one on another route).
  const stopOffRoute = !missesBus && !!busRoute && !returning && !!pickupName && !stop;
  const pickupPrompt = stopOffRoute ? (
    <div className="mb-4">
      <AlertBand
        tone="warning"
        title="Your bus doesn't stop there"
        body={`${pinnerBus.name} drives ${pinnerBus.routeName || "a different route"}, which doesn't stop at "${pickupName}". Choose one of its stops so the driver stops for you.`}
        action={<Button size="sm" className="mt-3" onClick={() => setSheet("pickup")}>Choose a stop on its route</Button>}
      />
    </div>
  ) : missesBus ? (
    <div className="mb-4">
      <AlertBand
        tone="warning"
        title="Your bus doesn't pass your pickup"
        body={`${pinnerBus.name} drives ${pinnerBus.routeName || "a different road"}. Choose a pickup on its road so the driver stops for you.`}
        action={<Button size="sm" className="mt-3" onClick={() => setSheet("pickup")}>Choose a pickup on its road</Button>}
      />
    </div>
  ) : null;

  const chatUnread = useChatUnread(myVehicle?.id, sheet === "chat");

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
  const [dismissedAlerts] = useState({});
  const eta = approaching ? (approachingDriving.stale ? approachingDriving : approachingLearned || approachingDriving) : null;
  const tripState = passengerTripState({ stop, approaching, eta, myVehicle, now, busAssigned: !!myBus });
  const timelineRoute = approachingRoute
    || (myVehicle ? routes.find((r) => r.id === myVehicle.route_id) : null)
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
  // Stops before the passenger's pickup, excluding their own stop.
  const pickupIndex = mapStops.findIndex(s=>s.name===stop?.name);
  const liveForCount = !returning && onTrip && busOnMap && !locationIsStale(busOnMap,now);
  // On a drawn road the stops are other riders' pickups, which a passenger
  // never sees: count with the bus's next stop number (from the tablet) and
  // where your stop falls in the bus's list (from the server). It counts the
  // same stops the driver sees, so it's used first when it's known.
  const roadStopsAway = liveForCount && stop?.personal && drawnRoad(timelineRoute)
    && sharedStop?.bus_id === busOnMap.id && Number.isInteger(sharedStop?.bus_order) && Number.isInteger(busOnMap.road_next_stop)
    && sharedStop.bus_order >= busOnMap.road_next_stop ? sharedStop.bus_order - busOnMap.road_next_stop : null;
  const stopsAway = roadStopsAway != null ? roadStopsAway
    : liveForCount && nextStopIndex!=null && pickupIndex>=nextStopIndex ? pickupIndex-nextStopIndex : null;


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
    const unlockCompany = (c, reply) => { setCompany(c); setCompanyPhone(c.phone || ""); setMyBus(reply?.my_bus || null); };
    // A join link's code is checked straight away, and admins only use this
    // to look at a company's passenger app, so neither is "waiting".
    return (
      <AppLayout>
        <DriverPhoneCheck>
          {joinCode || user?.role === "admin" ? (
            <CodeGate initialCode={joinCode} onUnlock={unlockCompany} />
          ) : (
            <AccountWaiting onCheck={checkAgain}>
              <CodeGate className="mt-0" onUnlock={unlockCompany} />
            </AccountWaiting>
          )}
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

  const mapSummary = returning && stop ? (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
      <p className="font-bold">Going home · Pickup: {stop.name}</p>
      <p className="text-body-sm">See Home for the company pickup ETA and bus status.</p>
    </div>
  ) : stop && tripState.bus ? (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
      <p className="text-body-sm text-muted-foreground">{tripState.bus.name} to {stop.name}</p>
      <p className="mt-1 font-display text-display font-semibold tabular-nums">
        {tripState.kind === "arriving" ? "Arriving" : roundMins != null && onTrip ? `${roundMins} min` : tripState.kind === "not_started" ? "Not started" : "No arrival time"}
      </p>
      {nextStopIndex != null && mapStops[nextStopIndex] && <p className="text-body-sm">Next stop: <b>{mapStops[nextStopIndex].name}</b>{stopEtas[mapStops[nextStopIndex].name] && onTrip ? ` · ${Math.max(1, Math.round(stopEtas[mapStops[nextStopIndex].name].mins))} min` : ""}</p>}
    </div>
  ) : null;

  const myStopEta = stop ? stopEtas[stop.name] : null;
  const mapTopCard = stop ? (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
      <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="block truncate font-bold">{stop.name}</span>
        <span className="block text-body-sm text-muted-foreground">
          {returning ? "Company boarding point · Going home" : roundMins != null && onTrip ? `${roundMins} min` : "No arrival time yet"}
          {myStopEta?.km != null && onTrip ? ` · ${myStopEta.km < 1 ? `${Math.round(myStopEta.km * 1000)} m` : `${myStopEta.km.toFixed(1)} km`}` : ""}
        </span>
      </p>
    </div>
  ) : null;
  const serving = new Set(servingRoutes.map((r) => r.id));
  const routeBuses = otherBuses.filter((v) => serving.has(v.route_id));

  return (
    <AppLayout variant="passenger">
      <PullToRefresh onRefresh={() => Promise.all([reload(), refreshMyBus(), refreshSharedStop()])}>
        <PassengerExperience view={view} user={user} company={company} workplace={workplace} myVehicle={myVehicle}
          returning={returning} tripState={tripState} pickupStop={stop} stopsAway={stopsAway} timelineRoute={timelineRoute} stopEtas={stopEtas}
          now={now} homeName={homeStop && !homeStop.personal ? homeStop.name : user?.pickup_name || pickupName} sharedStop={homeStop?.personal ? sharedStop : null}
          pickupPrompt={pickupPrompt} notice={notice} chatUnread={chatUnread} stopAlerts={stopAlerts} pushPermission={pushPermission}
          toggleStopAlerts={toggleStopAlerts} enableNotifications={enableNotifications} setSheet={setSheet}
          mapOpen={mapOpen} setMapOpen={setMapOpen} bookedTrips={upcomingTrips} pickupName={pickupName}
          logout={()=>{clearPassengerSnapshot();logout();}} lastSynced={lastSynced} offline={offline}
          renderMap={() => <Suspense fallback={<div className="h-72 animate-pulse bg-muted" />}>
            <LiveTransitMap defaultSatellite className="h-80 lg:h-[520px]" vehicles={locatedVehicles}
              focusVehicleId={busOnMap?.id || myVehicle?.id || null} routes={routes} stops={mapStops}
              road={drawnRoad(timelineRoute)} dropoff={returning ? {name:user?.pickup_name,lat:user?.pickup_lat,lng:user?.pickup_lng} : workplace}
              myStop={stop} nextStopIndex={nextStopIndex} userLocation={userLoc} callout={callout}
              summary={mapSummary} topCard={mapTopCard}
              overlay={<OtherBusesOverlay buses={routeBuses} stop={stop} now={now} />}
              label={stop ? `Live map of ${myVehicle?.name || "buses"} and ${stop.name}` : "Live map of buses"} />
          </Suspense>} />
      </PullToRefresh>

      <MyPickupSheet
        open={sheet === "pickup"}
        onOpenChange={(o) => setSheet(o ? "pickup" : null)}
        pickupName={pickupName}
        pickupOptions={pickupOptions}
        routes={routes}
        userLoc={userLoc}
        onChoosePickup={choosePickup}
        bus={pinnerBus}
        stopAlerts={stopAlerts}
        onToggleStopAlerts={toggleStopAlerts}
        pushUnsupported={pushPermission === "unsupported"}
        companyPhone={companyPhone}
        onSwitchCompany={switchCompany}
      />
      <PassengerSettingsSheet open={sheet === "notifications"} onOpenChange={o => setSheet(o ? "notifications" : null)} stopAlerts={stopAlerts} onToggleStopAlerts={toggleStopAlerts} pushUnsupported={pushPermission === "unsupported"} companyPhone={companyPhone} onSwitchCompany={switchCompany} />
      <StopSheet open={sheet === "stop"} onOpenChange={(o) => setSheet(o ? "stop" : null)} routes={pickupRoutes} value={pickupName} onChoose={choosePickup} userLoc={userLoc} />
      <AssistantSheet open={sheet === "assistant"} onOpenChange={(o) => setSheet(o ? "assistant" : null)} company={company} userLoc={userLoc} />
      <HelpSheet open={sheet === "help"} onOpenChange={(o) => setSheet(o ? "help" : null)} company={company} vehicles={vehicles} />
      <BadgeSheet open={sheet === "badge"} onOpenChange={(o) => setSheet(o ? "badge" : null)} />
      <ChatSheet
        open={sheet === "chat"}
        onOpenChange={(o) => setSheet(o ? "chat" : null)}
        vehicle={myVehicle}
      />
    </AppLayout>
  );
}