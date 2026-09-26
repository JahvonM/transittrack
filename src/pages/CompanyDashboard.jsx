import React, { useEffect, useState } from "react";
import { Navigate, useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import { Bus, Car, Plus, Pencil, Trash2, Route as RouteIcon, MapPin, Building2, Phone, KeyRound, Copy, Check, RefreshCw, User, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/trip";
import CompanyEditDialog from "@/components/CompanyEditDialog";
import MapboxMap from "@/components/MapboxMap";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export default function CompanyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams();
  const tab = urlTab || "vehicles";
  const [company, setCompany] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const loadAll = async () => {
    const [cos, ve, ro, tr] = await Promise.all([
      base44.entities.Company.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Trip.list(),
    ]);
    const mine = (user.company_id && cos.find((c) => c.id === user.company_id))
      || cos.find((c) => c.created_by_id === user.id);
    setCompany(mine || null);
    setVehicles(ve.filter((v) => v.company_id === mine?.id));
    setRoutes(ro.filter((r) => r.company_id === mine?.id));
    setTrips(tr.filter((t) => t.company_id === mine?.id));
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (user && user.role !== "company" && user.role !== "admin") return <Navigate to="/" replace />;

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;
  if (!company) return <AppLayout><CreateCompany onCreated={loadAll} /></AppLayout>;

  return (
    <AppLayout title={`${company.name} · Dashboard`}>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <KeyRound className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">Passenger access code — share it so passengers can see your fleet</div>
            <div className="text-2xl font-bold tracking-[0.25em]">{company.access_code || "Not set"}</div>
          </div>
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
              const code = genCode();
              await base44.entities.Company.update(company.id, { access_code: code });
              toast({ description: `New passenger code: ${code}` });
              loadAll();
            }}
          >
            <RefreshCw className="w-4 h-4" />
            New code
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
            Edit details
          </Button>
        </CardContent>
      </Card>
      <CompanyEditDialog company={company} open={editing} onOpenChange={setEditing} onSaved={loadAll} />
      <Tabs value={tab} onValueChange={(v) => navigate("/company/" + v)}>
        <TabsList>
          <TabsTrigger value="vehicles"><Bus className="w-4 h-4 mr-1.5" />Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="routes"><RouteIcon className="w-4 h-4 mr-1.5" />Routes ({routes.length})</TabsTrigger>
          <TabsTrigger value="trips"><MapPin className="w-4 h-4 mr-1.5" />Trips ({trips.length})</TabsTrigger>
          <TabsTrigger value="profile"><User className="w-4 h-4 mr-1.5" />Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicles" className="mt-4">
          <VehiclesTab company={company} routes={routes} vehicles={vehicles} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="routes" className="mt-4">
          <RoutesTab company={company} routes={routes} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="trips" className="mt-4">
          <TripsTab trips={trips} vehicles={vehicles} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <div className="max-w-xl">
            <ProfileInfo companyName={company.name} />
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
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
    await base44.entities.Company.create({ name, phone, service_types, access_code: genCode() });
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

function VehiclesTab({ company, routes, vehicles, onChange }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", plate_number: "", type: "bus", capacity: "",
    driver_email: "", driver_name: "", route_id: "",
  });
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!form.name) return;
    setAdding(true);
    try {
      await base44.entities.Vehicle.create({
        name: form.name,
        plate_number: form.plate_number,
        type: form.type,
        capacity: Number(form.capacity) || 0,
        driver_email: form.driver_email,
        driver_name: form.driver_name,
        route_id: form.route_id || null,
        company_id: company.id,
        company_name: company.name,
        status: "offline",
      });
      setForm({ name: "", plate_number: "", type: "bus", capacity: "", driver_email: "", driver_name: "", route_id: "" });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't add vehicle", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

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
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-2">
        {vehicles.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet. Add your first bus or taxi.</p>}
        {vehicles.map((v) => (
          <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              {v.type === "taxi" ? <Car className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{v.name} <span className="text-xs text-muted-foreground font-normal">· {v.plate_number}</span></div>
              <div className="text-xs text-muted-foreground truncate">
                Driver: {v.driver_name || v.driver_email || "Unassigned"}
              </div>
            </div>
            <Select value={v.route_id || "none"} onValueChange={(r) => setRoute(v, r)}>
              <SelectTrigger className="w-[150px] h-8 hidden sm:flex"><SelectValue placeholder="No route" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No route</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant={v.status === "on_trip" ? "default" : v.status === "idle" ? "secondary" : "outline"}>
              {v.status}
            </Badge>
            <Button asChild variant="ghost" size="icon">
              <Link to={`/vehicle/${v.id}`}><History className="w-4 h-4" /></Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Card className="h-fit sticky top-4">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Live fleet map</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-xl overflow-hidden border h-[440px]">
            <MapboxMap
              vehicles={vehicles.filter((v) => v.current_lat != null)}
              stops={routes.flatMap((r) => r.stops || []).filter((s) => s.lat != null)}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Live vehicle positions with your route stop paths. Add vehicles from the Admin dashboard.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function RoutesTab({ company, routes, onChange }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState("staff");
  const [stops, setStops] = useState([]);
  const [stopName, setStopName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [adding, setAdding] = useState(false);

  const addStop = () => {
    if (!stopName) return;
    setStops([...stops, { name: stopName, lat: Number(lat), lng: Number(lng), order: stops.length }]);
    setStopName(""); setLat(""); setLng("");
  };
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
    <div className="grid lg:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-2">
        {routes.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No routes yet. Create one with at least 2 stops.</p>}
        {routes.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><RouteIcon className="w-4 h-4" />{r.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
            <div className="grid grid-cols-[1fr_70px_70px_auto] gap-1.5">
              <Input value={stopName} onChange={(e) => setStopName(e.target.value)} placeholder="Stop name" />
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat" />
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="lng" />
              <Button variant="outline" size="icon" onClick={addStop}><Plus className="w-4 h-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: use map coordinates. e.g. Airport 12.0042, -61.787</p>
          </div>
          <Button className="w-full" onClick={save} disabled={adding || !name || stops.length < 2}>
            {adding ? "Saving…" : "Save route"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TripsTab({ trips, vehicles, onChange }) {
  const sorted = [...trips].sort((a, b) => (b.scheduled_time || "").localeCompare(a.scheduled_time || ""));
  return (
    <div className="space-y-2">
      {sorted.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No trips yet. Assign trips from the Admin dashboard.</p>}
      {sorted.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{t.pickup_name} <span className="text-muted-foreground">→</span> {t.dropoff_name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {t.vehicle_name} · {t.scheduled_time ? new Date(t.scheduled_time).toLocaleString() : "—"}
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[t.status] || "outline"}>
            {STATUS_LABEL[t.status] || t.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}