import React, { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, mapStyleFor, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Building2, MapPinned, Plus, Route as RouteIcon, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, PageActions, Panel, StatusChip } from "@/components/admin/kit";
import PlaceSearch from "@/components/PlaceSearch";
import { confirmAction } from "@/components/ConfirmHost";

// Matches the declutter treatment on every other map in the app: hide
// POI/transit icon clutter, keep road labels so the basemap still reads.
function declutterStyle(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit")) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* some layers can't be toggled */ }
    }
  });
}

export default function RoutePlanner() {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const { toast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState("staff");
  const [stops, setStops] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    Promise.all([base44.entities.Company.list(), base44.entities.Route.list("-created_date", 100), base44.entities.Workplace.list()])
      .then(([c, r, w]) => { setCompanies(c); setRoutes(r); setWorkplaces(w); })
      .catch(() => {});
  }, []);

  // The company's workplace: the drop-off every pickup passenger ends at.
  const workplace = useMemo(
    () => workplaces.find((w) => w.company_id === companyId && w.lat != null && w.lng != null) || null,
    [workplaces, companyId]
  );

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
      { name: `Stop ${prev.length + 1}`, lat: e.lngLat.lat, lng: e.lngLat.lng, order: prev.length },
    ]);
  };

  // A searched place becomes a named stop exactly where that place is.
  const addPlace = (place) => {
    setStops((prev) => [...prev, { name: place.name, lat: place.lat, lng: place.lng, order: prev.length }]);
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 });
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

  const deleteRoute = async () => {
    if (!selectedRoute || saving) return;
    const route = selectedRoute;
    if (!(await confirmAction({ title: `Delete route ${route.name}?`, description: "This removes the route from the route list. Recorded trip history is kept.", confirmLabel: "Delete route" }))) return;
    setSaving(true);
    try {
      await base44.entities.Route.delete(route.id);
      setRoutes(previous => previous.filter(r => r.id !== route.id));
      newRoute();
      toast({ title: "Route deleted" });
    } catch (error) { toast({ title: "Couldn't delete route", description: error.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const routeCoords = stops.map((s) => [s.lng, s.lat]);
  const center = stops.length > 0 ? [stops[0].lng, stops[0].lat] : [-61.7, 12.05];

  const routeList = (
    <Panel title="Routes" icon={RouteIcon} bodyClassName="p-2 pt-0">
      {routes.length === 0 ? (
        <p className="px-3 py-4 text-body-sm text-muted-foreground">No routes yet. Draw your first one on the map.</p>
      ) : (
        <ul className="space-y-1">
          {routes.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => loadRoute(r)}
                aria-pressed={selectedRoute?.id === r.id}
                className={cn("flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", selectedRoute?.id === r.id ? "bg-primary/12 ring-1 ring-primary/60" : "hover:bg-accent/60")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-body-sm text-muted-foreground">{[r.company_name, `${r.stops?.length || 0} stops`].filter(Boolean).join(" · ")}</span>
                </span>
                <StatusChip tone="neutral" dot={false}>{r.type === "airport" ? "Airport" : "Staff"}</StatusChip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  return (
    <AppLayout title="Route Planner">
      <PageActions>
        {selectedRoute && <Button size="sm" variant="destructive" onClick={deleteRoute} disabled={saving}><Trash2 className="h-4 w-4" /> Delete route</Button>}
        <Button size="sm" variant="outline" disabled={saving} onClick={newRoute}><Plus className="h-4 w-4" /> New route</Button>
      </PageActions>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <div className="hidden 2xl:block">{routeList}</div>
        <div className="min-w-0">
          <div className="relative h-[52vh] min-h-[360px] overflow-hidden rounded-2xl border border-border lg:h-[calc(100vh-13rem)]">
            <Map
              ref={mapRef}
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={mapStyleFor(isDark)}
              initialViewState={{ longitude: center[0], latitude: center[1], zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              onClick={onMapClick}
              attributionControl={false}
              onLoad={(e) => declutterStyle(e.target)}
            >
              {routeCoords.length > 1 && (
                <Source id="planner-route" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: routeCoords } }}>
                  <Layer id="planner-route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 5, "line-opacity": 0.85 }} />
                </Source>
              )}
              {stops.map((st, i) => (
                <Marker key={i} longitude={st.lng} latitude={st.lat} anchor="center">
                  <div className="grid h-8 w-8 place-items-center rounded-full border-[3px] border-primary bg-background text-caption font-bold text-foreground shadow-md">
                    {i + 1}
                  </div>
                </Marker>
              ))}
              {workplace && (
                <Marker longitude={workplace.lng} latitude={workplace.lat} anchor="bottom">
                  <div className="tt-map-stop-mine" title={workplace.name}>
                    <span className="tt-map-stop-mine__pin" />
                    <span className="tt-map-stop-label"><b>Drop-off</b></span>
                  </div>
                </Marker>
              )}
            </Map>
            <p className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-border bg-background/92 px-3 py-1.5 text-body-sm font-semibold shadow-md backdrop-blur">
              <MapPinned className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Search or click the map to add stops in order
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title={selectedRoute ? `Edit ${selectedRoute.name}` : "New route"} icon={selectedRoute ? RouteIcon : Plus}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rp-name">Route name</Label>
                <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning Airport Run" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-company">Company</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger id="rp-company"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-type">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="rp-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="airport">Airport</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Add a stop</Label>
                <PlaceSearch onSelect={addPlace} proximity={workplace} placeholder="Search a place by name" />
                <p className="text-caption text-muted-foreground">Search the place and pick it from the results, or click the map to drop a stop where you are looking.</p>
              </div>
            </div>
          </Panel>

          <Panel title={`Stops (${stops.length})`} bodyClassName="p-2 pt-0">
            {stops.length === 0 ? (
              <EmptyState icon={MapPinned} title="No stops yet" className="m-2 border-0 py-6">Search a place or click the map to add stops.</EmptyState>
            ) : (
              <ol className="space-y-1">
                {stops.map((st, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-primary text-caption font-bold" aria-hidden="true">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{st.name}</span>
                      <span className="block text-caption tabular-nums text-muted-foreground">{st.lat.toFixed(4)}, {st.lng.toFixed(4)}</span>
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeStop(i)} aria-label={`Remove ${st.name}`} title="Remove stop" className="text-danger hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            {workplace && (
              <p className="mx-2 mb-1 flex items-center gap-2 rounded-lg bg-secondary/60 px-2 py-2 text-body-sm">
                <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate"><span className="font-semibold">{workplace.name}</span> <span className="text-muted-foreground">· Drop-off</span></span>
              </p>
            )}
            <div className="p-2">
              <Button className="w-full" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" /> {selectedRoute ? "Save changes" : "Create route"}
              </Button>
            </div>
          </Panel>

          <div className="2xl:hidden">{routeList}</div>
        </div>
      </div>
    </AppLayout>
  );
}