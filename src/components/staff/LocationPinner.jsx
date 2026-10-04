import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { MapPin, Search, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { suggestPickup } from "@/lib/pickupSuggestion";
import LiteMap from "@/components/LiteMap";

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
  const [suggestion, setSuggestion] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finding, setFinding] = useState(false);

  const pin = async (lat, lng, address) => {
    setFinding(true);
    setSuggestion(null);
    setOrigin({ lat, lng });
    try {
      const routes = await base44.entities.Route.list();
      const result = await suggestPickup({ lat, lng }, routes);
      if (!result) {
        toast({ title: "No reachable bus-road pickup found", description: "Ask dispatch to add or confirm a pickup stop. Your saved pickup has not changed." });
        return;
      }
      setSuggestion({ ...result, address: address || (await reverseGeocode(lat, lng)) });
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
          <Button onClick={saveSuggestion} disabled={saving}>{saving ? "Saving…" : "Use this pickup point"}</Button>
          <Button variant="ghost" onClick={() => setSuggestion(null)}>Cancel</Button>
        </div>
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
