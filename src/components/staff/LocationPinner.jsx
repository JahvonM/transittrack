import React, { Suspense, lazy, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { MapPin, Search, Crosshair, RefreshCw, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { nearestBusRoad, suggestPickups } from "@/lib/pickupSuggestion";
import LiteMap from "@/components/LiteMap";

const LocationPicker = lazy(() => import("@/components/directory/LocationPicker"));
const OWN_SPOT_WARN_M = 50;

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
    const data = await res.json();
    return data.features?.[0]?.place_name || "";
  } catch {
    return "";
  }
}

// Roadside pickup on a company bus route, with walking directions.
export default function LocationPinner({ onSaved }) {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  // Walkable spots near you, closest first; `choice` is the one shown.
  const [options, setOptions] = useState([]);
  const [choice, setChoice] = useState(0);
  const suggestion = options[choice] || null;
  const setSuggestion = (v) => { setOptions(v ? [v] : []); setChoice(0); };
  // Picking your own spot on the map.
  const [own, setOwn] = useState(null); // { lat, lng, label, road, checking }
  const [origin, setOrigin] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finding, setFinding] = useState(false);

  const pin = async (lat, lng, address) => {
    setFinding(true);
    setSuggestion(null);
    setOwn(null);
    setOrigin({ lat, lng });
    try {
      const routes = await base44.entities.Route.list();
      const found = await suggestPickups({ lat, lng }, routes);
      if (!found.length) {
        toast({ title: "No reachable bus-road pickup found", description: "Pick your own spot on the map, or ask dispatch to add a pickup stop. Your saved pickup has not changed." });
        return;
      }
      const where = address || (await reverseGeocode(lat, lng));
      setOptions(found.map((f) => ({ ...f, address: where })));
      setChoice(0);
    } catch {
      toast({ title: "Couldn't find a roadside pickup", variant: "destructive" });
    } finally { setFinding(false); }
  };
  const saveSuggestion = async () => {
    if (!suggestion || !origin) return;
    setSaving(true);
    try {
      await base44.entities.User.update(user.id, {
        home_lat: origin.lat, home_lng: origin.lng, home_address: suggestion.address,
        pickup_lat: suggestion.lat, pickup_lng: suggestion.lng, pickup_name: suggestion.name, pickup_route_id: suggestion.route_id,
      });
      await checkUserAuth?.();
      onSaved?.(suggestion.name);
      setSuggestion(null);
      toast({ title: "Roadside pickup saved", description: "Your driver sees the bus-road point. Use the walking directions to reach it." });
    } catch { toast({ title: "Couldn't save your pickup", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const startOwnSpot = () => {
    const at = suggestion || origin || (user?.pickup_lat != null ? { lat: user.pickup_lat, lng: user.pickup_lng } : null);
    setOwn({ lat: at?.lat ?? null, lng: at?.lng ?? null, label: "", road: null, checking: false });
  };
  const moveOwnSpot = async (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setOwn((o) => ({ ...o, lat, lng, road: null, checking: true }));
    try {
      const road = await nearestBusRoad({ lat, lng }, await base44.entities.Route.list());
      setOwn((o) => (o && o.lat === lat && o.lng === lng ? { ...o, road: road || false, checking: false } : o));
    } catch { setOwn((o) => (o ? { ...o, checking: false } : o)); }
  };
  const saveOwnSpot = async () => {
    if (!own?.road) return;
    setSaving(true);
    try {
      const name = own.label.trim().slice(0, 60) || "My pickup spot";
      await base44.entities.User.update(user.id, {
        ...(origin ? { home_lat: origin.lat, home_lng: origin.lng } : {}),
        pickup_lat: own.lat, pickup_lng: own.lng, pickup_name: name, pickup_route_id: own.road.route_id,
      });
      await checkUserAuth?.();
      onSaved?.(name);
      setOwn(null);
      setSuggestion(null);
      toast({ title: "Pickup spot saved", description: "Your driver sees your pin on their stop list." });
    } catch { toast({ title: "Couldn't save your pickup", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location isn't available on this device", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        await pin(p.coords.latitude, p.coords.longitude);
        setLocating(false);
      },
      (err) => {
        const msg =
          err.code === 1
            ? "Location permission denied. Enable it in your browser settings."
            : err.code === 3
            ? "Location request timed out. Make sure GPS is on."
            : "Couldn't get your location. Check your GPS and try again.";
        toast({ title: msg, variant: "destructive" });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const searchAddress = async () => {
    if (!query.trim() || finding || locating || searching) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=gd&proximity=-61.75,12.05`
      );
      const data = await res.json();
      const f = data.features?.[0];
      if (f) {
        const [lng, lat] = f.center;
        await pin(lat, lng, f.place_name);
        setQuery("");
      } else {
        toast({ title: "Address not found", variant: "destructive" });
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setSearching(false);
  };

  const hasPin = user?.pickup_lat != null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm">
        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <span className={hasPin ? "" : "text-muted-foreground"}>
          {hasPin ? user.pickup_name || "Roadside pickup saved" : "Set your location to find a pickup on a road your company bus uses."}
        </span>
      </div>
      {suggestion && (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="font-semibold">{suggestion.name}</p>
          <p className="text-sm">{Math.round(suggestion.walkM)} m · about {Math.max(1, Math.round(suggestion.walkMin))} min walk</p>
          <div className="h-56 overflow-hidden rounded-lg">
            <LiteMap fill vehicles={[]} stops={[{ name: suggestion.name, lat: suggestion.lat, lng: suggestion.lng }]}
              pins={[{ ...origin, label: "Your location", color: "#3b82f6" }]} lines={[{ coords: suggestion.geometry, color: "#10b981", width: 4 }]} />
          </div>
          <ol className="text-sm list-decimal pl-5">{suggestion.steps.map((s,i) => <li key={i}>{s}</li>)}</ol>
          <p className="text-xs text-muted-foreground">Suggested point on the bus route. Confirm with dispatch that the bus can stop here and that your walking path is accessible.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSuggestion} disabled={saving}>{saving ? "Saving…" : "Use this pickup point"}</Button>
            {options.length > 1 && (
              <Button variant="outline" onClick={() => setChoice((c) => (c + 1) % options.length)} disabled={saving}>
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Show another spot nearby
              </Button>
            )}
            <Button variant="outline" onClick={startOwnSpot} disabled={saving}>
              <Hand className="w-4 h-4" aria-hidden="true" /> Pick my own spot
            </Button>
            <Button variant="ghost" onClick={() => setSuggestion(null)}>Cancel</Button>
          </div>
          {options.length > 1 && <p className="text-xs text-muted-foreground" role="status">Spot {choice + 1} of {options.length} near you</p>}
          {options.length === 1 && <p className="text-xs text-muted-foreground">This is the only walkable spot on a bus road near you. You can still pick your own spot.</p>}
        </div>
      )}
      {own && (
        <section className="space-y-3 rounded-xl border p-3" aria-label="Pick your own pickup spot">
          <p className="font-semibold">Pick your own spot</p>
          <p className="text-sm text-muted-foreground">Tap the map or drag the pin to where you want the bus to pick you up. Choose a safe place on the road the bus uses.</p>
          <Suspense fallback={<div className="h-[200px] animate-pulse rounded-lg bg-muted" />}>
            <LocationPicker lat={own.lat} lng={own.lng} onChange={moveOwnSpot} />
          </Suspense>
          <label htmlFor="tt-own-spot" className="sr-only">Name this spot</label>
          <Input id="tt-own-spot" value={own.label} maxLength={60} onChange={(e) => setOwn((o) => ({ ...o, label: e.target.value }))} placeholder="Name it, e.g. Outside Joe's shop" />
          {own.checking && <p className="text-sm" role="status">Checking the bus roads…</p>}
          {own.road === false && <p className="text-sm text-danger" role="alert">That spot is more than 2 km from every bus road. Pick a spot closer to a road your bus uses.</p>}
          {own.road && own.road.distanceM > OWN_SPOT_WARN_M && (
            <p className="text-sm text-warning" role="alert">This spot is about {Math.round(own.road.distanceM)} m from the {own.road.route_name || "bus"} road. Your driver may not be able to stop there, so check with dispatch.</p>
          )}
          {own.road && own.road.distanceM <= OWN_SPOT_WARN_M && <p className="text-sm text-success" role="status">On the {own.road.route_name || "bus"} road.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveOwnSpot} disabled={saving || own.checking || !own.road}>{saving ? "Saving…" : "Use this spot"}</Button>
            <Button variant="ghost" onClick={() => setOwn(null)}>Cancel</Button>
          </div>
        </section>
      )}
      {!suggestion && !own && (
        <Button variant="outline" className="w-full" onClick={startOwnSpot} disabled={locating || searching || finding}>
          <Hand className="w-4 h-4 mr-2" aria-hidden="true" /> Pick my own spot on the map
        </Button>
      )}
      {hasPin && user?.home_lat != null && <Button variant="outline" disabled={searching || locating || finding} onClick={async () => { setSearching(true); await pin(user.home_lat,user.home_lng,user.home_address); setSearching(false); }}>Review walking directions</Button>}
      <div className="flex gap-2">
        <Input
          placeholder="Search an address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchAddress()}
        />
        <Button variant="outline" size="icon" onClick={searchAddress} disabled={searching || locating || finding} aria-label="Search address">
          <Search className="w-4 h-4" />
        </Button>
      </div>
      <Button variant="outline" className="w-full" onClick={useGps} disabled={locating || searching || finding}>
        <Crosshair className="w-4 h-4 mr-2" />
        {locating ? "Locating…" : "Use where I am now"}
      </Button>
    </div>
  );
}
