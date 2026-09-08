import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Nfc, MapPin } from "lucide-react";
import LocationPicker from "./LocationPicker";

const empty = {
  name: "",
  phone: "",
  email: "",
  type: "passenger",
  nfc_card_tag: "",
  pickup_name: "",
  pickup_lat: null,
  pickup_lng: null,
  dropoff_name: "",
  dropoff_lat: null,
  dropoff_lng: null,
};

export default function ContactFormDialog({ open, onClose, onSave, contact }) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) setForm({ ...empty, ...(contact || {}) });
  }, [open, contact]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name || ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {["passenger", "staff"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("type", t)}
                    className={`px-3 py-2 rounded-lg text-sm border capitalize transition-colors ${
                      form.type === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone || ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email || ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@email.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Nfc className="w-3.5 h-3.5" /> NFC card tag
            </Label>
            <Input
              value={form.nfc_card_tag || ""}
              onChange={(e) => set("nfc_card_tag", e.target.value)}
              placeholder="NFC card ID"
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin className="w-4 h-4 text-primary" /> Pickup point
            </div>
            <Input
              value={form.pickup_name || ""}
              onChange={(e) => set("pickup_name", e.target.value)}
              placeholder="Pickup location name"
            />
            <LocationPicker
              lat={form.pickup_lat}
              lng={form.pickup_lng}
              onChange={(lat, lng) => {
                set("pickup_lat", lat);
                set("pickup_lng", lng);
              }}
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin className="w-4 h-4 text-primary" /> Drop-off point
            </div>
            <Input
              value={form.dropoff_name || ""}
              onChange={(e) => set("dropoff_name", e.target.value)}
              placeholder="Drop-off location name"
            />
            <LocationPicker
              lat={form.dropoff_lat}
              lng={form.dropoff_lng}
              onChange={(lat, lng) => {
                set("dropoff_lat", lat);
                set("dropoff_lng", lng);
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!form.name?.trim()}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}