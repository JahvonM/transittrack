import React, { useEffect, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

export default function RoutePlanner() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState("staff");
  const [stops, setStops] = useState([]);
  const [stopName, setStopName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([base44.entities.Company.list(), base44.entities.Route.list("-created_date", 100)])
      .then(([c, r]) => { setCompanies(c); setRoutes(r); })
      .catch(() => {});
  }, []);

  const loadRoute = (route) => {
    setSelectedRoute(route);
    setName(route.name);
    setCompanyId(route.company_id);
    setType(route.type || "staff");
    setStops(route.stops || []);
  };

  const newRoute = () => {
    setSelectedRoute(null);
    setName("");
    setCompanyId("");
    setType("staff");
    setStops([]);
  };

  const onMapClick = (e) => {
    setStops((prev) => [
      ...prev,
      { name: stopName || `Stop ${prev.length + 1}`, lat: e.lngLat.lat, lng: e.lngLat.lng, order: prev.length },
    ]);
    setStopName("");
  };

  const removeStop = (i) => setStops((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name || !companyId) {
      toast({ title: "Name and company are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const company = companies.find((c) => c.id === companyId);
      const orderedStops = stops.map((s, i) => ({ ...s, order: i }));
      const payload = {
        name,
        company_id: companyId,
        company_name: company?.name || "",
        type,
        stops: orderedStops,
        active: true,
      };
      if (selectedRoute) {
        await base44.entities.Route.update(selectedRoute.id, payload);
      } else {
        await base44.entities.Route.create(payload);
      }
      toast({ title: "Route saved" });
      const r = await base44.entities.Route.list("-created_date", 100);
      setRoutes(r);
      newRoute();
    } catch (e) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const routeCoords = stops.map((s) => [s.lng, s.lat]);
  const center = stops.length > 0 ? [stops[0].lng, stops[0].lat] : [-61.7, 12.05];

  return (
    <AppLayout title="Route Planner">
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 max-w-6xl">
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border" style={{ height: "60vh" }}>
            <Map
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={MAPBOX_STYLE}
              initialViewState={{ longitude: center[0], latitude: center[1], zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              onClick={onMapClick}
              attributionControl={false}
            >
              {routeCoords.length > 1 && (
                <Source id="planner-route" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: routeCoords } }}>
                  <Layer id="planner-route-line" type="line" paint={{ "line-color": "#38bdf8", "line-width": 4, "line-opacity": 0.7 }} />
                </Source>
              )}
              {stops.map((s, i) => (
                <Marker key={i} longitude={s.lng} latitude={s.lat} anchor="center">
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground border-2 border-white shadow-md grid place-items-center text-xs font-bold">
                    {i + 1}
                  </div>
                </Marker>
              ))}
            </Map>
          </div>
          <p className="text-xs text-muted-foreground text-center">Click the map to add stops in order.</p>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Route details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Route name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning Airport Run" />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Choose company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
              <Button className="w-full" onClick={save} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> {selectedRoute ? "Update route" : "Create route"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Stops ({stops.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={stopName} onChange={(e) => setStopName(e.target.value)} placeholder="Stop name (optional)" />
              {stops.length === 0 && <p className="text-xs text-muted-foreground">Click the map to add stops.</p>}
              {stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-bold shrink-0">{i + 1}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span>
                  <Button size="icon" variant="ghost" onClick={() => removeStop(i)} className="h-7 w-7">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {routes.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Existing routes</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {routes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => loadRoute(r)}
                    className={`w-full text-left p-2 rounded-lg hover:bg-accent transition-colors text-sm ${selectedRoute?.id === r.id ? "bg-accent" : ""}`}
                  >
                    {r.name} <span className="text-xs text-muted-foreground">· {r.stops?.length || 0} stops</span>
                  </button>
                ))}
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={newRoute}>New route</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}