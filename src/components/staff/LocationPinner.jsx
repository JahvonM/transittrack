import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { MapPin, Search, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
    const data = await res.json();
    return data.features?.[0]?.place_name || "";
  } catch {
    return "";
  }
}

// Door-to-door pickup pin: where the driver should collect this person when
// it isn't a regular route stop. Shown to the driver on their tablet map.
export default function LocationPinner() {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const pin = async (lat, lng, address) => {
    try {
      await base44.auth.updateMe({ home_lat: lat, home_lng: lng, home_address: address || (await reverseGeocode(lat, lng)) });
      await checkUserAuth?.();
      toast({ title: "Pickup pin saved", description: "Your driver will see it on their map." });
    } catch {
      toast({ title: "Couldn't save your pin", variant: "destructive" });
    }
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
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
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

  const hasPin = user?.home_lat != null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm">
        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <span className={hasPin ? "" : "text-muted-foreground"}>
          {hasPin ? user.home_address || "Pin saved" : "No pin yet. Set one if the driver collects you from your door rather than a stop."}
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Search an address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchAddress()}
        />
        <Button variant="outline" size="icon" onClick={searchAddress} disabled={searching} aria-label="Search address">
          <Search className="w-4 h-4" />
        </Button>
      </div>
      <Button variant="outline" className="w-full" onClick={useGps} disabled={locating}>
        <Crosshair className="w-4 h-4 mr-2" />
        {locating ? "Locating…" : "Use where I am now"}
      </Button>
    </div>
  );
}
