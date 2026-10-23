import React, { useEffect, useState } from "react";
import { MapPin, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlaceSearch from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/admin/kit";
import { useToast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";

export const PLACE_KINDS = [
  { value: "airport", label: "Airport" },
  { value: "hotel", label: "Hotel" },
  { value: "taxi_stand", label: "Taxi stand" },
  { value: "attraction", label: "Attraction" },
  { value: "business", label: "Business" },
  { value: "other", label: "Other" },
];

// Add or change a saved place (the airport, a hotel, a tour stop).
export default function PlaceDialog({ open, onOpenChange, place, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", kind: "hotel", address: "", lat: null, lng: null, notes: "", favorite: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(place
      ? { name: place.name || "", kind: place.kind || "other", address: place.address || "", lat: place.lat ?? null, lng: place.lng ?? null, notes: place.notes || "", favorite: !!place.favorite }
      : { name: "", kind: "hotel", address: "", lat: null, lng: null, notes: "", favorite: false });
  }, [open, place]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setSaving(true);
    try {
      const data = { name: form.name.trim(), kind: form.kind, address: form.address.trim(), notes: form.notes.trim(), lat: form.lat, lng: form.lng, favorite: form.favorite };
      const row = place ? await base44.entities.Place.update(place.id, data) : await base44.entities.Place.create(data);
      onSaved?.(row);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't save the place", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{place ? "Edit place" : "Add a place"}</DialogTitle>
          <DialogDescription>Saved places show first when you set a job's pickup and drop-off.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Segmented label="Kind of place" value={form.kind} onChange={(kind) => set({ kind })} options={PLACE_KINDS} size="sm" />
          <div className="space-y-1.5">
            <Label>Location</Label>
            <PlaceSearch placeholder="Search the place or its address" onSelect={(p) => set({ name: form.name || p.name, address: p.address, lat: p.lat, lng: p.lng })} />
            {form.lat != null && (
              <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Location set{form.address ? `: ${form.address}` : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="place-name">Name</Label>
            <Input id="place-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Maurice Bishop International Airport" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="place-address">Address</Label>
            <Input id="place-address" value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="place-notes">Notes for drivers (optional)</Label>
            <Textarea id="place-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Wait at the arrivals exit" maxLength={1000} rows={2} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-body-sm">
            <input type="checkbox" checked={form.favorite} onChange={(e) => set({ favorite: e.target.checked })} />
            <Star className="h-4 w-4 text-muted-foreground" /> Show as a favourite when dispatching jobs
          </label>
          <Button className="w-full" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : place ? "Save changes" : "Add place"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
