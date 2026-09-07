import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import MapboxMap from "@/components/MapboxMap";
import CodeGate from "@/components/CodeGate";
import ProfileInfo from "@/components/ProfileInfo";
import StaffAlerts from "@/components/StaffAlerts";
import LocationPinner from "@/components/staff/LocationPinner";
import useUserLocation from "@/hooks/useUserLocation";
import StaffToggles from "@/components/staff/StaffToggles";
import LostItemReport from "@/components/staff/LostItemReport";
import ShareLocationButton from "@/components/ShareLocationButton";
import Greeting from "@/components/Greeting";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/trip";
import { Bus, Clock, LogOut, Map as MapIcon, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const STEPS = ["scheduled", "on_the_way", "arrived", "completed"];

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

function StatusSteps({ status }) {
  if (status === "cancelled") {
    return <Badge variant="destructive">Cancelled</Badge>;
  }
  const current = STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <div className={`h-0.5 w-3 sm:w-4 ${i <= current ? "bg-primary" : "bg-border"}`} />}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {STATUS_LABEL[s]}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function StaffPortal() {
  const { user } = useAuth();
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

  useEffect(() => {
    pickupRef.current = pickupName;
  }, [pickupName]);
  const { location: userLoc } = useUserLocation();
  const [loading, setLoading] = useState(true);

  // Load saved company code
  useEffect(() => {
    base44.entities.Company.list().then((cos) => {
      const saved = localStorage.getItem("tt_company_code");
      const match = saved ? cos.find((c) => (c.access_code || "").toUpperCase() === saved.toUpperCase()) : null;
      if (match) setCompany(match);
      if (match) setCompanyPhone(match.phone || "");
      setCompaniesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!company) return;
    setLoading(true);
    Promise.all([
      base44.entities.Vehicle.filter({ company_id: company.id }),
      base44.entities.Route.filter({ company_id: company.id }),
      base44.entities.Trip.filter({ company_id: company.id }),
    ]).then(([v, r, t]) => {
      setVehicles(v);
      setRoutes(r);
      setTrips(t);
      statusRef.current = Object.fromEntries(t.map((x) => [x.id, x.status]));
      setLoading(false);
    });
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

  const switchCompany = () => {
    localStorage.removeItem("tt_company_code");
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

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.status !== "offline" && v.current_lat != null),
    [vehicles]
  );

  const approaching = useMemo(() => {
    if (!stop) return null;
    let best = null;
    activeVehicles.forEach((v) => {
      const dist = haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng);
      if (best == null || dist < best.dist) best = { v, dist, mins: etaMinutes(dist, v.speed || 25) };
    });
    return best;
  }, [stop, activeVehicles]);

  const onTheWayTrip = useMemo(
    () => trips.find((t) => t.pickup_name === pickupName && t.status === "on_the_way") || null,
    [trips, pickupName]
  );

  const pickupTrips = useMemo(
    () =>
      trips
        .filter((t) => t.pickup_name === pickupName)
        .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || "")),
    [trips, pickupName]
  );

  if (user?.role === "driver") return <Navigate to="/driver" replace />;
  if (user?.role === "company") return <Navigate to="/company" replace />;
  if (!companiesLoaded) return <AppLayout />;
  if (!company) {
    return (
      <AppLayout>
        <CodeGate onUnlock={(c) => { setCompany(c); setCompanyPhone(c.phone || ""); }} />
      </AppLayout>
    );
  }
  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;

  return (
    <AppLayout title="Transit Portal">
      <div className="space-y-4 max-w-3xl">
        <Greeting subtitle={company.name} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Track pickups &amp; buses</h2>
            <p className="text-sm text-muted-foreground">{activeVehicles.length} vehicles live right now</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareLocationButton />
            <Button variant="ghost" size="sm" onClick={switchCompany}>
              <LogOut className="w-4 h-4" />
              Switch company
            </Button>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border h-[50vh]">
          <MapboxMap vehicles={activeVehicles} userLocation={userLoc} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <LocationPinner />
          <StaffToggles companyPhone={companyPhone} />
        </div>

        <div>
          <p className="text-sm font-medium mb-1.5">Your pickup point</p>
          <Select
            value={pickupName}
            onValueChange={(v) => {
              setPickupName(v);
              localStorage.setItem("tt_staff_pickup", v);
            }}
          >
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose your hotel / stop" /></SelectTrigger>
            <SelectContent>
              {pickupOptions.map((s) => (
                <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {stop && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Approaching {stop.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {approaching ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {approaching.v.name} · {approaching.v.plate_number}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Driver: {approaching.v.driver_name || "—"} · {approaching.v.company_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 font-medium justify-end">
                      <Clock className="w-3.5 h-3.5" />{formatEta(approaching.mins)}
                    </div>
                    <div className="text-xs text-muted-foreground">estimated arrival</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vehicles are active right now.</p>
              )}
              {onTheWayTrip && (
                <p className="text-sm text-primary mt-2">
                  Your ride is on the way — {onTheWayTrip.vehicle_name} · Driver {onTheWayTrip.driver_name || "—"}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {pickupName && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pickups at {pickupName}
            </h3>
            <div className="space-y-2">
              {pickupTrips.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center border rounded-2xl">
                  No scheduled pickups at this point yet.
                </p>
              )}
              {pickupTrips.map((t) => (
                <div key={t.id} className="p-3 rounded-xl border bg-card space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {t.pickup_name} <span className="text-muted-foreground">→</span> {t.dropoff_name}
                    </div>
                    <StatusSteps status={t.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />{fmtDateTime(t.scheduled_time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />{t.driver_name || "Driver TBA"}
                    </span>
                    <span>{t.vehicle_name} · {t.plate_number}</span>
                    {t.passenger_name && <span>Guest: {t.passenger_name}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!pickupName && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              All live vehicles
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {activeVehicles.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center border rounded-2xl sm:col-span-2">
                  No vehicles are active right now.
                </p>
              )}
              {activeVehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                    <Bus className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.company_name} · {v.driver_name || "—"}
                    </div>
                  </div>
                  <Badge variant={v.status === "on_trip" ? "default" : "secondary"}>
                    {v.status === "on_trip" ? "On trip" : "Idle"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <StaffAlerts />

        <LostItemReport />

        <ProfileInfo />
      </div>
    </AppLayout>
  );
}