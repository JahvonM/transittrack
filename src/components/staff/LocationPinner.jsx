import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { MapPin, Search, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function LocationPinner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const pin = async (lat, lng) => {
    await base44.auth.updateMe({ home_lat: lat, home_lng: lng });
    toast({ title: "Location pinned", description: "Your pickup point is saved." });
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pin(p.coords.latitude, p.coords.longitude);
        setLocating(false);
      },
      (err) => {
        const msg =
          err.code === 1
            ? "Location permission denied — enable it in your browser settings."
            : err.code === 3
            ? "Location request timed out — make sure GPS is on."
            : "Couldn't get your location — check your GPS and try again.";
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
      const token = MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?access_token=${token}&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features[0]) {
        const [lng, lat] = data.features[0].center;
        pin(lat, lng);
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" /> My pickup location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {hasPin
            ? "Your pickup pin is set. The driver will be guided here."
            : "Pin where you'll be picked up so the driver can navigate to you."}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Search your address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchAddress()}
          />
          <Button variant="outline" size="icon" onClick={searchAddress} disabled={searching}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={useGps} disabled={locating}>
            <Crosshair className="w-4 h-4 mr-2" />
            {locating ? "Locating…" : "Use my GPS"}
          </Button>
        </div>
        {hasPin && (
          <div className="text-xs text-muted-foreground font-mono">
            {user.home_lat.toFixed(5)}, {user.home_lng.toFixed(5)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}