import React, { Suspense, lazy, useEffect, useState } from "react";
import CompanyJoinQr from "@/components/CompanyJoinQr";
import { Navigate, useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import { Bus, Plus, Pencil, Trash2, Route as RouteIcon, MapPin, Building2, Phone, KeyRound, Copy, Check, RefreshCw, CalendarClock, Inbox, Navigation, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Kpi, KpiRow, Panel, StatusChip, humanize } from "@/components/admin/kit";
import { StatusPill } from "@/components/admin/AdminOverview";
import PlaceSearch from "@/components/PlaceSearch";
import { useToast } from "@/components/ui/use-toast";
import CompanyEditDialog from "@/components/CompanyEditDialog";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";
import VehicleFormDialog from "@/components/VehicleFormDialog";
import { VehicleModelThumb } from "@/components/VehicleModelPicker";
import { modelIdFor } from "@/lib/vehicleModels";
import { loadScreen, saveScreen } from "@/lib/savedScreen";
import CompanyJobs, { useCompanyRequests } from "@/components/company/CompanyJobs";
import { companyBusStatus } from "@/components/company/BusStatus";
import { busOnMap, busSharingLine, jobGroups } from "@/lib/companyPortal";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

// The company portal (a hotel whose staff and guests ride the buses). Each
// section is its own address so the sidebar can link to it.
const SECTIONS = {
  overview: { title: null },
  jobs: { title: "Jobs", subtitle: "Ask for a job, and follow your jobs on the way." },
  vehicles: { title: "Buses", subtitle: "Your buses. Each shows on the map while its shift is open." },
  routes: { title: "Routes", subtitle: "Your routes and their stops." },
  profile: { title: "Company profile" },
};
// Old addresses: the trips list is part of Jobs now; NFC cards, the card
// designer and advertisements were taken out of the company portal.
const MOVED = { trips: "jobs", cards: "overview", "card-designs": "overview", ads: "overview" };

// A list that follows the server's live refresh (a shared poll for every screen watching it).
function useLive(entity, setRows) {
  useEffect(() => base44.entities[entity].subscribe((event) => {
    setRows((prev) => {
      if (event.type === "delete") return prev.filter((r) => r.id !== event.id);
      const rec = event.data;
      if (!rec) return prev;
      return prev.some((r) => r.id === event.id) ? prev.map((r) => (r.id === event.id ? rec : r)) : prev;
    });
  }), [entity, setRows]);
}

export default function CompanyDashboard() {
  const { user } = useAuth();
  const { tab: urlTab } = useParams();
  const section = urlTab || "overview";
  // Opens with what this screen showed last time; the fresh lists replace it.
  const [saved] = useState(() => loadScreen("company", user?.id));
  const [company, setCompany] = useState(() => saved?.company || null);
  const [vehicles, setVehicles] = useState(() => saved?.vehicles || []);
  const [routes, setRoutes] = useState(() => saved?.routes || []);
  const [trips, setTrips] = useState(() => saved?.trips || []);
  const [workplace, setWorkplace] = useState(() => saved?.workplace || null);
  const [loading, setLoading] = useState(!saved);

  const loadAll = async () => {
    try {
      const [cos, ve, ro, tr, wp] = await Promise.all([
        base44.entities.Company.list(),
        base44.entities.Vehicle.list(),
        base44.entities.Route.list(),
        base44.entities.Trip.list("-created_date", 1000),
        base44.entities.Workplace.list(),
      ]);
      const mine = (user.company_id && cos.find((c) => c.id === user.company_id))
        || cos.find((c) => c.created_by_id === user.id);
      const view = {
        company: mine || null,
        workplace: wp.find((w) => w.company_id === mine?.id && w.lat != null && w.lng != null) || null,
        vehicles: ve.filter((v) => v.company_id === mine?.id),
        routes: ro.filter((r) => r.company_id === mine?.id),
        trips: tr.filter((t) => t.company_id === mine?.id),
      };
      setCompany(view.company);
      setWorkplace(view.workplace);
      setVehicles(view.vehicles);
      setRoutes(view.routes);
      setTrips(view.trips);
      // Bus positions change by the minute: they aren't kept for next time.
      if (view.company) saveScreen("company", user?.id, { ...view, vehicles: view.vehicles.map((v) => ({ ...v, current_lat: null, current_lng: null, trail: null, location_shared: "" })) });
    } catch {
      loadFailed(loadAll);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);
  useLive("Vehicle", setVehicles);
  useLive("Trip", setTrips);

  if (user && user.role !== "company" && user.role !== "admin") return <Navigate to="/" replace />;
  if (MOVED[section]) return <Navigate to={MOVED[section] === "overview" ? "/company" : `/company/${MOVED[section]}`} replace />;
  if (!SECTIONS[section]) return <Navigate to="/company" replace />;

  if (loading) return <AppLayout><BusLoader className="py-8" /></AppLayout>;
  if (!company) return user?.role === "admin"
    ? <CreateCompany onCreated={loadAll} />
    : <AppLayout><p className="py-8">Company access needs administrator approval. Ask your administrator to assign your company in User management.</p></AppLayout>;

  const { title, subtitle } = SECTIONS[section];
  return (
    <AppLayout title={title || company.name} subtitle={subtitle || (section === "overview" ? "Your buses, jobs and passenger code" : undefined)}>
      {section === "overview" && <Overview company={company} vehicles={vehicles} routes={routes} trips={trips} workplace={workplace} onChange={loadAll} />}
      {section === "jobs" && <CompanyJobs company={company} trips={trips} vehicles={vehicles} routes={routes} />}
      {section === "vehicles" && <VehiclesTab company={company} routes={routes} vehicles={vehicles} workplace={workplace} onChange={loadAll} />}
      {section === "routes" && <RoutesTab company={company} routes={routes} workplace={workplace} onChange={loadAll} />}
      {section === "profile" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AccessCode company={company} onChange={loadAll} />
          <ProfileInfo companyName={company.name} />
        </div>
      )}
    </AppLayout>
  );
}

const when = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
};

// The passenger access code, with its QR code, copy and edit.
function AccessCode({ company, onChange }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <Panel title="Passenger access code" icon={KeyRound} description="Share it so your staff can see their bus in the passenger app.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[1.75rem] font-semibold tracking-[0.25em]">{company.access_code || "Not set"}</div>
          <div className="text-caption text-muted-foreground">Permanent company code. Passengers keep access.</div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <CompanyJoinQr code={company.access_code} companyName={company.name} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(company.access_code || "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await base44.functions.invoke("manageAccessCodes", { action: "issue_company", company_id: company.id });
                toast({ description: `Passenger code: ${res.data.code}` });
                onChange();
              } catch (error) { toast({ title: "Could not issue code", description: error.message, variant: "destructive" }); }
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Get code
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
            Edit details
          </Button>
        </div>
      </div>
      <CompanyEditDialog company={company} open={editing} onOpenChange={setEditing} onSaved={onChange} />
    </Panel>
  );
}

// Buses beside the map: a bus is on the map only while it is shared.
function BusList({ vehicles, now = Date.now() }) {
  if (vehicles.length === 0) return <EmptyState icon={Bus} title="No buses yet" className="border-0">McSween Transport adds your buses.</EmptyState>;
  return (
    <ul className="divide-y divide-border">
      {[...vehicles].sort((a, b) => Number(busOnMap(b)) - Number(busOnMap(a)) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true })).map((v) => (
        <li key={v.id} className="flex min-h-[56px] items-center gap-3 py-2">
          <div className="shrink-0 rounded-xl bg-secondary"><VehicleModelThumb model={modelIdFor(v)} size={40} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{v.name}</p>
            <p className="truncate text-body-sm text-muted-foreground">{busSharingLine(v)}{v.driver_name && busOnMap(v) ? ` · ${v.driver_name}` : ""}</p>
          </div>
          <StatusPill status={companyBusStatus(v, now)} />
        </li>
      ))}
    </ul>
  );
}

function SharedMap({ vehicles, routes, workplace, label, className = "h-[420px]" }) {
  const shown = vehicles.filter(busOnMap);
  return (
    <div className={`relative overflow-hidden rounded-xl border ${className}`}>
      <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
        <LiveTransitMap
          variant="page"
          className="h-full w-full"
          vehicles={shown}
          routes={routes}
          looseStops={routes.flatMap((r) => r.stops || []).filter((st) => st.lat != null)}
          dropoff={workplace}
          label={label}
        />
      </Suspense>
      {shown.length === 0 && (
        <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-background/90 px-3 py-2 text-body-sm shadow">No bus on the map right now. A bus shows while its driver's shift is open, or while one of your jobs is on the way.</p>
      )}
    </div>
  );
}

function Overview({ company, vehicles, routes, trips, workplace, onChange }) {
  const { requests } = useCompanyRequests();
  const { live, upcoming, todayCount } = jobGroups(trips);
  const onMap = vehicles.filter(busOnMap).length;
  const waiting = (requests || []).filter((r) => r.status === "new").length;
  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="Buses" value={vehicles.length} icon={Bus} />
        <Kpi label="On the map now" value={onMap} icon={Navigation} tone={onMap ? "success" : undefined} detail="On shift or on your job" />
        <Kpi label="Jobs today" value={todayCount} icon={CalendarClock} />
        <Kpi label="Requests waiting" value={requests === null ? "…" : waiting} icon={Inbox} tone={waiting ? "warning" : undefined} />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Your buses" icon={Bus}>
          <BusList vehicles={vehicles} />
        </Panel>
        <Panel title="Live map" icon={MapPin} className="tt-admin-map-panel">
          <SharedMap vehicles={vehicles} routes={routes} workplace={workplace} label="Your buses on the map" />
        </Panel>
      </div>
      <Panel title="Jobs" icon={CalendarClock} actions={<Button asChild variant="outline" size="sm"><Link to="/company/jobs">All jobs <ArrowRight className="h-4 w-4" /></Link></Button>}>
        {live.length + upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No jobs coming up" className="border-0" action={<Button asChild><Link to="/company/jobs"><Plus className="h-4 w-4" /> Request a job</Link></Button>}>
            Ask for an airport pickup, a transfer or a tour from Jobs.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {[...live, ...upcoming].slice(0, 4).map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">{when(j.scheduled_time)} · {j.pickup_name} to {j.dropoff_name}</p>
                  <p className="text-body-sm text-muted-foreground">{[j.passenger_name, j.vehicle_name].filter(Boolean).join(" · ")}</p>
                </div>
                <StatusChip status={j.status}>{humanize(j.status)}</StatusChip>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <AccessCode company={company} onChange={onChange} />
    </div>
  );
}

function CreateCompany({ onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [staff, setStaff] = useState(true);
  const [taxi, setTaxi] = useState(false);
  const [airport, setAirport] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name) return;
    setSaving(true);
    const service_types = [staff && "staff_bus", taxi && "taxi", airport && "airport"].filter(Boolean);
    await base44.entities.Company.create({ name, phone, service_types });
    setSaving(false);
    onCreated();
  };

  return (
    <AppLayout>
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Set up your company</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cname">Company name</Label>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Island Transit Co." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cphone"><Phone className="w-3.5 h-3.5 inline mr-1" />Contact phone</Label>
            <Input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 473-..." />
          </div>
          <div className="space-y-2">
            <Label>Services offered</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "staff", label: "Staff bus", val: staff, set: setStaff },
                { key: "taxi", label: "Taxi", val: taxi, set: setTaxi },
                { key: "airport", label: "Airport pickup", val: airport, set: setAirport },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => s.set(!s.val)}
                  className={`px-3 h-9 rounded-lg border text-sm transition-colors ${s.val ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={saving || !name}>
            {saving ? "Creating…" : "Create company"}
          </Button>
        </CardContent>
      </Card>
    </AppLayout>
  );
}

function VehiclesTab({ company, routes, vehicles, workplace, onChange }) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const remove = async (id) => {
    try {
      await base44.entities.Vehicle.delete(id);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't delete vehicle", description: e.message, variant: "destructive" });
    }
  };

  const setRoute = async (v, route_id) => {
    try {
      await base44.entities.Vehicle.update(v.id, { route_id: route_id || null });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't update route", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4" /> Add vehicle</Button>
        </div>
        {vehicles.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet. Add your first bus or taxi.</p>}
        {vehicles.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-card p-3">
            <div className="shrink-0 rounded-xl bg-secondary"><VehicleModelThumb model={modelIdFor(v)} size={48} /></div>
            <div className="min-w-[10rem] flex-1">
              <div className="font-medium truncate">{v.name} <span className="text-xs text-muted-foreground font-normal">· {[v.fleet_number, v.plate_number].filter(Boolean).join(" · ")}</span></div>
              <div className="text-xs text-muted-foreground truncate">
                Driver: {v.driver_name || v.driver_email || "Unassigned"} · {busSharingLine(v)}
              </div>
            </div>
            <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
            <Select value={v.route_id || "none"} onValueChange={(r) => setRoute(v, r)}>
              <SelectTrigger className="mr-auto h-9 w-[150px] sm:mr-1" aria-label={`Route of ${v.name}`}><SelectValue placeholder="No route" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No route</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StatusPill status={companyBusStatus(v)} />
            <Button variant="ghost" size="icon" onClick={() => { setEditing(v); setFormOpen(true); }} aria-label={`Edit ${v.name}`} title="Edit">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(v.id)} aria-label={`Delete ${v.name}`} title="Delete" className="text-danger hover:text-danger">
              <Trash2 className="w-4 h-4" />
            </Button>
            </div>
          </div>
        ))}
        <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} vehicle={editing} fixedCompany={company} routes={routes} onSaved={onChange} />
      </div>

      <Panel title="Live map" icon={MapPin} className="h-fit lg:sticky lg:top-20">
        <SharedMap vehicles={vehicles} routes={routes} workplace={workplace} label="Live fleet map" className="h-[440px]" />
        <p className="mt-2 text-body-sm text-muted-foreground">Your route stops and the drop-off. A bus shows while its shift is open, or while one of your jobs is on the way.</p>
      </Panel>
    </div>
  );
}

function RoutesTab({ company, routes, workplace, onChange }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState("staff");
  const [stops, setStops] = useState([]);
  const [adding, setAdding] = useState(false);

  const addPlace = (place) => setStops((prev) => [...prev, { name: place.name, lat: place.lat, lng: place.lng, order: prev.length }]);
  const removeStop = (i) => setStops(stops.filter((_, x) => x !== i).map((s, idx) => ({ ...s, order: idx })));

  const save = async () => {
    if (!name || stops.length < 2) return;
    setAdding(true);
    try {
      await base44.entities.Route.create({
        name, type, stops,
        company_id: company.id,
        company_name: company.name,
        active: true,
      });
      setName(""); setStops([]);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't create route", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await base44.entities.Route.delete(id);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't delete route", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-2">
        {routes.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No routes yet. Create one with at least 2 stops.</p>}
        {routes.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><RouteIcon className="w-4 h-4" />{r.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusChip tone="neutral" dot={false}>{humanize(r.type)}</StatusChip>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={`Delete ${r.name}`} title="Delete route" className="text-danger hover:text-danger"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5">
                {(r.stops || []).map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs">{i + 1}</span>
                    {s.name}
                  </li>
                ))}
                {workplace && (
                  <li className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 shrink-0 text-primary" />
                    <span className="truncate font-semibold">{workplace.name}</span>
                    <span className="text-muted-foreground">Drop-off</span>
                  </li>
                )}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> New route</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Route name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Airport Express" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="airport">Airport</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Stops ({stops.length})</Label>
            <div className="space-y-1">
              {stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg border">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs">{i + 1}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStop(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>
            <PlaceSearch onSelect={addPlace} proximity={workplace} placeholder="Search a stop by name" />
            <p className="text-xs text-muted-foreground">Search the stop by name and pick it from the results — its location is set for you.</p>
          </div>
          <Button className="w-full" onClick={save} disabled={adding || !name || stops.length < 2}>
            {adding ? "Saving…" : "Save route"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
