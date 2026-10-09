import React, { Suspense, lazy, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { MapPin, Search, Crosshair, Hand, Check, ArrowLeft } from "lucide-react";
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
  const [phase, setPhase] = useState("choose");
  const [nickname, setNickname] = useState("");

  const pin = async (lat, lng, address) => {
    setFinding(true);
    setPhase("choose");
    setNickname("");
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
        pickup_lat: suggestion.lat, pickup_lng: suggestion.lng, pickup_name: nickname.trim() || suggestion.name, pickup_route_id: suggestion.route_id,
      });
      await checkUserAuth?.();
      await onSaved?.(nickname.trim() || suggestion.name);
      setPhase("choose");
      setSuggestion(null);
      toast({ title: "Roadside pickup saved", description: "Your driver sees the bus-road point. Use the walking directions to reach it." });
    } catch { toast({ title: "Couldn't save your pickup", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const startOwnSpot = () => {
    const at = suggestion || origin || (user?.pickup_lat != null ? { lat: user.pickup_lat, lng: user.pickup_lng } : null);
    setPhase("choose");
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
      await onSaved?.(name);
      setOwn(null);
      setPhase("choose");
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

  const busy = locating || searching || finding || saving;
  const map = suggestion && <div className="h-60 overflow-hidden rounded-2xl border">
    <LiteMap fill vehicles={[]} stops={phase === "review" ? [{ name: suggestion.name, lat: suggestion.lat, lng: suggestion.lng }] : options}
      pins={origin ? [{ ...origin, label: "You", color: "#00d7e8" }] : []}
      lines={phase === "review" ? [{ coords: suggestion.geometry, color: "#00d7e8", width: 4 }] : []} />
  </div>;

  return (
    <div className="tt-pickup-finder space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">TransitTrack · Pickup finder</p>
        <h2 className="text-2xl font-bold mt-2">{phase === "review" ? "Your walk to the bus" : "Find your pickup"}</h2>
        <p className="text-sm text-muted-foreground mt-1">{phase === "review" ? "Check your meeting point before confirming." : "Choose a nearby stop on your bus route."}</p>
      </div>
      {phase === "choose" && <>
        <Button className="w-full h-14 text-base rounded-2xl" onClick={useGps} disabled={busy}>
          <Crosshair className="w-5 h-5 mr-2" />{locating ? "Locating…" : "Use my location"}
        </Button>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); searchAddress(); }}>
          <Input aria-label="Search an address" placeholder="Or search an address" value={query} onChange={e=>setQuery(e.target.value)} className="h-12 rounded-xl" />
          <Button type="submit" variant="outline" className="h-12 w-12 shrink-0 rounded-xl" disabled={busy || !query.trim()} aria-label="Search address"><Search className="w-5 h-5" /></Button>
        </form>
        {finding && <p role="status" className="text-sm text-primary">Finding walkable pickup spots on your bus route…</p>}
        {!own && map}
        {!own && !!options.length && <section aria-label="Nearby pickup spots" className="space-y-2">
          <h3 className="font-semibold">Nearby pickup spots</h3>
          {options.map((spot,i)=><button key={i} type="button" aria-pressed={i===choice} disabled={busy} onClick={()=>{setChoice(i);setNickname("");}}
            className={"w-full text-left flex items-center gap-3 rounded-2xl border p-4 " + (i===choice ? "border-primary bg-primary/10" : "bg-card")}>
            <MapPin className="w-5 h-5 shrink-0 text-primary" />
            <span className="flex-1 min-w-0"><strong className="block">{spot.name}</strong><span className="block text-sm text-muted-foreground">{Math.max(1,Math.round(spot.walkMin))} min walk · {Math.round(spot.walkM)} m</span>{i===0 && <span className="text-xs text-primary">Suggested · shortest walk</span>}</span>
            {i===choice && <Check className="w-5 h-5 text-primary shrink-0" />}
          </button>)}
        </section>}
        {own && <section aria-label="Pick your own pickup spot" className="space-y-3">
          <h3 className="font-semibold">Choose your meeting point</h3>
          <p className="text-sm text-muted-foreground">Tap the map or drag the pin to a place on your bus route.</p>
          <Suspense fallback={<div className="h-[200px] animate-pulse bg-muted rounded-xl" />}>
            <LocationPicker lat={own.lat} lng={own.lng} onChange={moveOwnSpot} showCoordinates={false} />
          </Suspense>
          {own.checking && <p role="status">Checking the bus roads…</p>}
          {own.road === false && <p role="alert" className="text-sm text-danger">Choose a point closer to a road your company bus uses.</p>}
          {own.road && <p className="text-sm text-muted-foreground">{own.road.distanceM > OWN_SPOT_WARN_M ? "This point is about " + Math.round(own.road.distanceM) + " m from the bus road. Check with dispatch." : "Near the " + (own.road.route_name || "bus") + " road."}</p>}
          <Button variant="ghost" onClick={()=>setOwn(null)}>Back to nearby spots</Button>
        </section>}
        {!own && <Button variant="outline" className="w-full h-12 rounded-xl" onClick={startOwnSpot} disabled={busy}><Hand className="w-4 h-4 mr-2" />Choose a different spot on the map</Button>}
        {!suggestion && !own && <p className="text-sm text-muted-foreground">{hasPin ? "Current pickup: " + (user.pickup_name || "Your saved spot") + ". Finding nearby spots won't change it until you confirm." : "Use your location or an address to see reachable pickup spots."}</p>}
        {hasPin && user?.home_lat != null && !options.length && !own && <Button variant="ghost" disabled={busy} onClick={()=>pin(user.home_lat,user.home_lng,user.home_address)}>Review saved walking directions</Button>}
        <Button className="w-full h-14 rounded-2xl text-base" disabled={busy || (own ? own.checking || !own.road : !suggestion)} onClick={()=>setPhase("review")}>Review this pickup</Button>
      </>}
      {phase === "review" && <>
        {!own && map}
        {own && <div className="h-60 overflow-hidden rounded-2xl border"><LiteMap fill vehicles={[]} stops={[{name:"Your meeting point",lat:own.lat,lng:own.lng}]} pins={origin ? [{...origin,label:"You",color:"#00d7e8"}] : []} /></div>}
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <p className="text-2xl font-bold">{own ? "Your meeting point" : Math.max(1,Math.round(suggestion.walkMin)) + " min walk"}</p>
          {!own && <p className="text-sm text-muted-foreground">{Math.round(suggestion.walkM)} m · walking route</p>}
          <p className="font-semibold">{own ? own.road.route_name || "Company bus route" : suggestion.name}</p>
          <p className="text-sm text-muted-foreground">Meet the bus at this point. Confirm with dispatch that the bus can stop here and the path is accessible.</p>
          {own && <p className="text-sm text-warning">Walking directions aren't available for this manually chosen point. Check the route before walking.</p>}
        </div>
        {!own && <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Walking directions</summary><ol className="list-decimal pl-5 mt-3 space-y-2 text-sm">{suggestion.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></details>}
        <label className="block text-sm font-semibold" htmlFor="tt-pickup-nickname">Name this spot (optional)</label>
        <Input id="tt-pickup-nickname" maxLength={60} placeholder="e.g. Outside Joe's shop" value={own ? own.label : nickname} onChange={e=>own ? setOwn(o=>({...o,label:e.target.value})) : setNickname(e.target.value)} className="h-12 rounded-xl" />
        <Button className="w-full h-14 rounded-2xl text-base" disabled={saving} onClick={own ? saveOwnSpot : saveSuggestion}>{saving ? "Saving…" : "Use this pickup"}</Button>
        <Button variant="outline" className="w-full h-12 rounded-xl" disabled={saving} onClick={()=>setPhase("choose")}><ArrowLeft className="w-4 h-4 mr-2" />Choose another spot</Button>
      </>}
    </div>
  );
}

