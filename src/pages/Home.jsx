import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BusMap from "@/components/BusMap";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { Bus, Car, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [userLoc, setUserLoc] = useState(null);
  const [routeId, setRouteId] = useState("all");
  const [stopIdx, setStopIdx] = useState("nearest");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [locError, setLocError] = useState("");

  useEffect(() => {
    base44.entities.Vehicle.list().then(setVehicles);
    base44.entities.Route.list().then(setRoutes);
    base44.entities.Company.list().then(setCompanies);
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((v) => v.id !== event.id);
        const idx = prev.findIndex((v) => v.id === event.id);
        const rec = event.data;
        if (!rec) return prev;
        if (idx === -1) return [...prev, rec];
        const copy = [...prev];
        copy[idx] = rec;
        return copy;
      });
    });
    return unsub;
  }, []);

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

  const filtered = useMemo(() => {
    let r = activeVehicles;
    if (companyFilter !== "all") r = r.filter((v) => v.company_id === companyFilter);
    if (routeId !== "all") r = r.filter((v) => v.route_id === routeId);
    return r;
  }, [activeVehicles, companyFilter, routeId]);

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

  if (user?.role === "driver") return <Navigate to="/driver" replace />;

  return (
    <AppLayout>
      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        <div className="rounded-2xl overflow-hidden border h-[55vh] lg:h-[calc(100vh-7.5rem)]">
          <BusMap vehicles={filtered} stops={stops} userLocation={userLoc} />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Live fleet</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} vehicles currently active</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={routeId} onValueChange={(v) => { setRouteId(v); setStopIdx("nearest"); }}>
              <SelectTrigger><SelectValue placeholder="All routes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All routes</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          {locError && <p className="text-xs text-muted-foreground">{locError}</p>}
          <div className="flex-1 overflow-auto space-y-2 pr-1 max-h-[50vh] lg:max-h-none">
            {withEta.length === 0 && (
              <p className="text-sm text-muted-foreground py-12 text-center">No live vehicles right now.</p>
            )}
            {withEta.map(({ v, mins }) => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                  {v.type === "taxi" ? <Car className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.company_name} · {v.plate_number}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {mins != null ? (
                    <div className="flex items-center gap-1 font-medium justify-end">
                      <Clock className="w-3.5 h-3.5" />{formatEta(mins)}
                    </div>
                  ) : (
                    <Badge variant="secondary">{v.status}</Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {v.status === "on_trip" ? "On trip" : "Idle"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}