import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { suggestPickups } from "@/lib/pickupSuggestion";
import LocationPicker from "./LocationPicker";

// Mounted per passenger so unsaved edits never carry into another person's form.
export default function PassengerPickupDialog({ person, routes = [], selectedRouteId = "", onClose, onSaved }) {
  const [name, setName] = useState(person.pickup_name || "");
  const [point, setPoint] = useState({ lat: person.pickup_lat ?? null, lng: person.pickup_lng ?? null });
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionOrigin, setSuggestionOrigin] = useState(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const { toast } = useToast();
  const routeNames = new Map(routes.map((route) => [route.id, route.name || "Route"]));
  const valid = Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && name.trim();
  const findNearby = async () => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !routes.length || finding) return;
    setFinding(true); setError(""); setSuggestions([]); setSelectedSuggestion(null);
    const origin = { lat: point.lat, lng: point.lng };
    setSuggestionOrigin(origin);
    try {
      const spots = await suggestPickups(origin, routes, { max: 5 });
      setSuggestions(spots);
      if (!spots.length) setError("No route-side pickup spots were found within a 2 km walk.");
    } catch (e) {
      setError(e?.message || "Couldn't find nearby pickup spots. Try again.");
    } finally { setFinding(false); }
  };
  const chooseSuggestion = (suggestion) => {
    setPoint({ lat: suggestion.lat, lng: suggestion.lng });
    setName(suggestion.name);
    setSelectedSuggestion(suggestion);
  };
  const updatePoint = (lat, lng) => {
    setPoint({ lat, lng });
    setSuggestions([]);
    setSuggestionOrigin(null);
    setSelectedSuggestion(null);
  };
  const save = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    setSaving(true); setError("");
    try {
      const res = await base44.functions.invoke("nfcCards", {
        action: "set_pickup", person_key: person.key,
        pickup_name: name.trim(), pickup_lat: point.lat, pickup_lng: point.lng,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || "Couldn't save the pickup");
      await onSaved();
      toast({ title: `Pickup saved for ${person.name}`, description: "Review their bus and route in Plan pickups." });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Couldn't save the pickup. Try again.");
    } finally { setSaving(false); pending.current = false; }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Pickup spot for {person.name}</DialogTitle>
        <DialogDescription>Choose a pickup area to see walkable spots along the bus route, or set the exact pickup on the map.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Label htmlFor="passenger-pickup-name">Pickup name</Label>
        <Input id="passenger-pickup-name" value={name} maxLength={120} disabled={saving}
          placeholder="e.g. Belmont junction" onChange={(e) => setName(e.target.value)} />
        <fieldset disabled={saving} className="min-w-0">
          <LocationPicker lat={point.lat} lng={point.lng} onChange={updatePoint} routes={routes} selectedRouteId={selectedRouteId}
            suggestions={suggestions} suggestionOrigin={suggestionOrigin} selectedSuggestion={selectedSuggestion}
            onSelectSuggestion={chooseSuggestion}
            pointHint={Number.isFinite(point.lat) && Number.isFinite(point.lng)
              ? "Drag the pin or tap the map to move the passenger's starting area."
              : "Search or tap the map to set the passenger's home or meeting area."}
            onPlace={(place) => { if (!name.trim()) setName(place.name || place.label || "Pickup spot"); }} />
        </fieldset>
        {routes.length > 0 ? (
          <div className="space-y-2">
            <Button type="button" variant="outline" disabled={!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || finding || saving} onClick={findNearby}>
              {finding ? "Finding nearby spots…" : "Find walkable pickup spots"}
            </Button>
            <p className="text-body-sm text-muted-foreground">
              {selectedRouteId && routeNames.has(selectedRouteId) ? `Route shown: ${routeNames.get(selectedRouteId)}. ` : ""}
              Nearby road-side options are within a 2 km walking route. Saving does not change their assigned bus.
            </p>
            {suggestions.length > 0 && <section aria-label="Nearby pickup options" className="space-y-2">
              <p className="font-medium">Nearby pickup options</p>
              <ul className="space-y-2">
                {suggestions.map((suggestion, index) => {
                  const chosen = selectedSuggestion === suggestion;
                  return <li key={`${suggestion.route_id}-${index}`} className={`rounded-lg border p-3 ${chosen ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-body-sm font-medium">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{routeNames.get(suggestion.route_id) || "Bus route"}</p>
                        <p className="text-body-sm text-muted-foreground">{Math.round(suggestion.walkMin)} min walk · {Math.round(suggestion.walkM)} m</p>
                      </div>
                      <Button type="button" size="sm" variant={chosen ? "secondary" : "outline"} onClick={() => chooseSuggestion(suggestion)}>
                        {chosen ? "Selected" : "Use this spot"}
                      </Button>
                    </div>
                    {chosen && suggestion.steps?.length > 0 && <details className="mt-2 pl-9 text-body-sm">
                      <summary className="cursor-pointer text-muted-foreground">Walking directions</summary>
                      <ol className="mt-1 list-decimal space-y-1 pl-4">{suggestion.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
                    </details>}
                  </li>;
                })}
              </ul>
            </section>}
          </div>
        ) : <p className="text-body-sm text-muted-foreground">Add a bus route to find walkable pickup spots.</p>}
        <p className="text-body-sm text-muted-foreground">Selecting a route-side option changes the saved pickup. Otherwise, name and save the exact point. “Use my location” uses this device, not the passenger’s.</p>
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || saving} onClick={save}>{saving ? "Saving…" : "Save pickup spot"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
