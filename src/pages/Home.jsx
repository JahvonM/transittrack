import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import MapboxMap from "@/components/MapboxMap";
import CodeGate from "@/components/CodeGate";
import ShareLocationButton from "@/components/ShareLocationButton";
import RouteExplorer from "@/components/RouteExplorer";
import ContactOperator from "@/components/ContactOperator";
import ProfileInfo from "@/components/ProfileInfo";
import VehicleListItem from "@/components/VehicleListItem";
import Greeting from "@/components/Greeting";
import AdBanner from "@/components/AdBanner";
import BusAssistant from "@/components/BusAssistant";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { Bus, Car, Clock, LogOut, Map as MapIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState("all");
  const [stopIdx, setStopIdx] = useState("nearest");
  const [showMap, setShowMap] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [locError, setLocError] = useState("");

  useEffect(() => {
    base44.entities.Company.list().then((cos) => {
      const saved = localStorage.getItem("tt_company_code");
      const match = saved ? cos.find((c) => (c.access_code || "").toUpperCase() === saved.toUpperCase()) : null;
      if (match) setCompany(match);
      setCompaniesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!company) return;
    base44.entities.Vehicle.filter({ company_id: company.id }).then(setVehicles);
    base44.entities.Route.filter({ company_id: company.id }).then(setRoutes);
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((v) => v.id !== event.id);
        const rec = event.data;
        if (!rec || rec.company_id !== company.id) return prev;
        const idx = prev.findIndex((v) => v.id === event.id);
        if (idx === -1) return [...prev, rec];
        const copy = [...prev];
        copy[idx] = rec;
        return copy;
      });
    });
    return unsub;
  }, [company]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setLocError("Enable location to see arrival times to your spot.")
    );
  }, []);

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.status !== "offline" && v.current_lat != null),
    [vehicles]
  );

  const filtered = useMemo(
    () => (routeId !== "all" ? activeVehicles.filter((v) => v.route_id === routeId) : activeVehicles),
    [activeVehicles, routeId]
  );

  const selectedRoute = routes.find((r) => r.id === routeId);
  const stops = selectedRoute?.stops || [];

  const target = useMemo(() => {
    if (stopIdx !== "nearest" && stops[parseInt(stopIdx)]) return stops[parseInt(stopIdx)];
    if (userLoc) return userLoc;
    return null;
  }, [stopIdx, stops, userLoc]);

  const withEta = useMemo(() => {
    return filtered
      .map((v) => {
        const dist = target ? haversineKm(v.current_lat, v.current_lng, target.lat, target.lng) : null;
        const mins = dist != null ? etaMinutes(dist, v.speed || 25) : null;
        return { v, dist, mins };
      })
      .sort((a, b) => (a.mins ?? 1e9) - (b.mins ?? 1e9));
  }, [filtered, target]);

  const buses = useMemo(() => withEta.filter(({ v }) => v.type !== "taxi"), [withEta]);
  const taxis = useMemo(() => withEta.filter(({ v }) => v.type === "taxi"), [withEta]);

  if (user?.role === "driver") return <Navigate to="/driver" replace />;
  if (!companiesLoaded) return <AppLayout />;
  if (!company) {
    return (
      <AppLayout>
        <CodeGate onUnlock={setCompany} />
      </AppLayout>
    );
  }

  const switchCompany = () => {
    localStorage.removeItem("tt_company_code");
    setCompany(null);
    setVehicles([]);
    setRoutes([]);
    setRouteId("all");
    setShowMap(false);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <Greeting subtitle={company.name} />
        <AdBanner />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{company.name}</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} vehicles live right now</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={showMap ? "default" : "outline"} size="sm" onClick={() => setShowMap(!showMap)}>
              <MapIcon className="w-4 h-4" />
              {showMap ? "Hide map" : "Show live map"}
            </Button>
            <RouteExplorer routes={routes} vehicles={activeVehicles} />
            <ShareLocationButton />
            <ContactOperator company={company} />
            <Button variant="ghost" size="sm" onClick={switchCompany}>
              <LogOut className="w-4 h-4" />
              Switch company
            </Button>
          </div>
        </div>

        {showMap && (
          <div className="rounded-2xl overflow-hidden border h-[55vh]">
            <MapboxMap vehicles={filtered} stops={stops} userLocation={userLoc} height="100%" />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-2 max-w-md">
          <Select value={routeId} onValueChange={(v) => { setRouteId(v); setStopIdx("nearest"); }}>
            <SelectTrigger><SelectValue placeholder="All routes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {routes.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRoute && stops.length > 0 && (
            <Select value={stopIdx} onValueChange={setStopIdx}>
              <SelectTrigger><SelectValue placeholder="Arrival stop" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nearest">Nearest to me</SelectItem>
                {stops.map((s, i) => (
                  <SelectItem key={i} value={String(i)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {locError && <p className="text-xs text-muted-foreground">{locError}</p>}

        <div className="space-y-5 max-w-2xl">
          {withEta.length === 0 && (
            <div className="text-center py-12 border rounded-2xl">
              <Bus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No live vehicles right now — check back soon.</p>
            </div>
          )}

          {buses.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Staff buses
              </h3>
              <div className="space-y-2">
                {buses.map(({ v, mins }) => (
                  <VehicleListItem key={v.id} v={v} mins={mins} />
                ))}
              </div>
            </div>
          )}

          {taxis.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Taxis
              </h3>
              <div className="space-y-2">
                {taxis.map(({ v, mins }) => (
                  <VehicleListItem key={v.id} v={v} mins={mins} />
                ))}
              </div>
            </div>
          )}
        </div>

        <BusAssistant company={company} userLoc={userLoc} />

        <ProfileInfo />
      </div>
    </AppLayout>
  );
}