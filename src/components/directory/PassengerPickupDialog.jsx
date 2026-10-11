import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import LocationPicker from "./LocationPicker";

// Mounted per passenger so unsaved edits never carry into another person's form.
export default function PassengerPickupDialog({ person, onClose, onSaved }) {
  const [name, setName] = useState(person.pickup_name || "");
  const [point, setPoint] = useState({ lat: person.pickup_lat ?? null, lng: person.pickup_lng ?? null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const { toast } = useToast();
  const valid = Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && name.trim();
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
        <DialogDescription>Search a place or tap the map where the passenger will meet the bus.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Label htmlFor="passenger-pickup-name">Pickup name</Label>
        <Input id="passenger-pickup-name" value={name} maxLength={120} disabled={saving}
          placeholder="e.g. Belmont junction" onChange={(e) => setName(e.target.value)} />
        <fieldset disabled={saving} className="min-w-0">
          <LocationPicker lat={point.lat} lng={point.lng} onChange={(lat, lng) => setPoint({ lat, lng })}
            onPlace={(place) => { if (!name.trim()) setName(place.name || place.label || "Pickup spot"); }} />
        </fieldset>
        <p className="text-body-sm text-muted-foreground">Choose an accessible roadside spot. “Use my location” uses your device’s position, not the passenger’s. Saving does not change their assigned bus.</p>
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || saving} onClick={save}>{saving ? "Saving…" : "Save pickup spot"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
