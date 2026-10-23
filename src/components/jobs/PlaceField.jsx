import React, { useMemo, useState } from "react";
import { BookmarkPlus, MapPin, Star, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlaceSearch from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";
import { orderedJobPlaces } from "@/lib/jobPlaces";

// Where a job picks up or drops off: a saved place (the airport, a hotel), a
// bus stop, or any address found by search. A searched address can be kept
// as a saved place for next time.
// value: { name, address, lat, lng, route_id?, route_name? } | null
export default function PlaceField({ id, label, value, onChange, places = [], routes = [], onPlaceSaved, proximity }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const stops = useMemo(
    () => routes.flatMap((r) => (r.stops || []).filter((s) => s?.name).map((s) => ({ ...s, route_id: r.id, route_name: r.name }))),
    [routes]
  );
  const savedPlaces = useMemo(() => orderedJobPlaces(places), [places]);
  const savedMatch = value && places.some((p) => p.name === value.name && p.lat === value.lat && p.lng === value.lng);

  const pick = (key) => {
    const [kind, ref] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "place") {
      const p = places.find((x) => x.id === ref);
      if (p) onChange({ name: p.name, address: p.address || "", lat: p.lat ?? null, lng: p.lng ?? null });
    } else {
      const s = stops.find((x) => `${x.route_id}|${x.name}` === ref);
      if (s) onChange({ name: s.name, address: s.route_name ? `Bus stop · ${s.route_name}` : "Bus stop", lat: s.lat ?? null, lng: s.lng ?? null, route_id: s.route_id, route_name: s.route_name });
    }
  };

  const savePlace = async () => {
    setSaving(true);
    try {
      const row = await base44.entities.Place.create({ name: value.name, address: value.address || "", lat: value.lat, lng: value.lng, kind: "other" });
      onPlaceSaved?.(row);
      toast({ title: "Saved to places", description: value.name });
    } catch (e) {
      toast({ title: "Couldn't save the place", description: errorData(e).error || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {value ? (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{value.name}</p>
            {value.address && value.address !== value.name && <p className="truncate text-caption text-muted-foreground">{value.address}</p>}
            {!savedMatch && !value.route_id && value.lat != null && (
              <button type="button" onClick={savePlace} disabled={saving} className="mt-1 inline-flex items-center gap-1 text-caption font-semibold text-primary disabled:opacity-60">
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" /> {saving ? "Saving…" : "Save to places"}
              </button>
            )}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onChange(null)} aria-label={`Change ${label.toLowerCase()}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {(places.length > 0 || stops.length > 0) && (
            <Select value="" onValueChange={pick}>
              <SelectTrigger id={id}><SelectValue placeholder={stops.length ? "Saved place or bus stop" : "Saved place"} /></SelectTrigger>
              <SelectContent>
                {savedPlaces.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Saved places</SelectLabel>
                    {savedPlaces.map((p) => <SelectItem key={p.id} value={`place:${p.id}`}>{p.favorite ? "★ " : ""}{p.name}{p.kind === "taxi_stand" ? " · Taxi stand" : p.kind === "airport" ? " · Airport" : ""}</SelectItem>)}
                  </SelectGroup>
                )}
                {stops.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Bus stops</SelectLabel>
                    {stops.map((s) => <SelectItem key={`${s.route_id}|${s.name}`} value={`stop:${s.route_id}|${s.name}`}>{s.name} ({s.route_name})</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          )}
          <PlaceSearch
            placeholder={places.length || stops.length ? "Or search an address" : "Search a place or address"}
            proximity={proximity}
            onSelect={(p) => onChange({ name: p.name, address: p.address, lat: p.lat, lng: p.lng })}
          />
        </div>
      )}
    </div>
  );
}
