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
import { Nfc, MapPin, Hash } from "lucide-react";
import LocationPicker from "./LocationPicker";
import { base44 } from "@/api/base44Client";
import { useNfcTap } from "@/hooks/useNfcTap";

const empty = {
  name: "",
  phone: "",
  email: "",
  type: "passenger",
  nfc_card_tag: "",
  access_code: "",
  pickup_name: "",
  pickup_lat: null,
  pickup_lng: null,
  dropoff_name: "",
  dropoff_lat: null,
  dropoff_lng: null,
};

export default function ContactFormDialog({ open, onClose, onSave, contact }) {
  const [form, setForm] = useState(empty);
  const [nfcListening, setNfcListening] = useState(false);
  const [nfcBusy, setNfcBusy] = useState(false);
  const [nfcError, setNfcError] = useState("");
  const [nfcSuccess, setNfcSuccess] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ ...empty, ...(contact || {}) });
      setNfcListening(false);
      setNfcError("");
      setNfcSuccess("");
      setCodeError("");
    }
  }, [open, contact]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  // Tapping a badge here writes straight through kioskCheckIn's
  // register_badge action (admin-auth path — no device_id, just the logged-in
  // admin session + this contact's own company_id), the same backend the
  // kiosk tablets use — so collision-clearing against a previous owner stays
  // in one place instead of being reimplemented client-side.
  const registerBadge = async (tag) => {
    if (!contact?.id || nfcBusy) return;
    setNfcBusy(true);
    setNfcError("");
    try {
      const res = await base44.functions.invoke("kioskCheckIn", {
        action: "register_badge",
        company_id: contact.company_id,
        staff_id: contact.id,
        card_tag: tag,
      });
      set("nfc_card_tag", tag);
      setNfcListening(false);
      setNfcSuccess(
        res.data?.reassigned_from ? `Badge reassigned from ${res.data.reassigned_from}` : "Badge registered."
      );
    } catch {
      setNfcError("Couldn't register that badge — try tapping it again.");
    } finally {
      setNfcBusy(false);
    }
  };

  const { supported: nfcSupported, nfcError: nfcHookError } = useNfcTap(registerBadge, nfcListening);

  const generateAccessCode = async () => {
    if (!contact?.id || codeBusy) return;
    setCodeBusy(true);
    setCodeError("");
    try {
      const res = await base44.functions.invoke("kioskCheckIn", {
        action: "generate_access_code",
        company_id: contact.company_id,
        staff_id: contact.id,
      });
      set("access_code", res.data?.code || "");
    } catch {
      setCodeError("Couldn't generate a code — try again.");
    } finally {
      setCodeBusy(false);
    }
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

          {form.type === "staff" && contact?.id ? (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Nfc className="w-4 h-4 text-primary" /> Badge & access code
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">NFC card tag</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.nfc_card_tag || ""}
                    onChange={(e) => set("nfc_card_tag", e.target.value)}
                    placeholder="NFC card ID"
                  />
                  {nfcSupported && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setNfcListening((v) => !v)}
                      disabled={nfcBusy}
                    >
                      {nfcListening ? "Cancel" : "Tap to register"}
                    </Button>
                  )}
                </div>
                {nfcListening && <p className="text-xs text-primary animate-pulse">Waiting for badge tap…</p>}
                {(nfcHookError || nfcError) && <p className="text-xs text-destructive">{nfcHookError || nfcError}</p>}
                {nfcSuccess && <p className="text-xs text-emerald-600">{nfcSuccess}</p>}
                <p className="text-xs text-muted-foreground">
                  Only works with a physical tap at the kiosk — {!nfcSupported ? "this device can't tap-register, but you can " : "or you can "}
                  type a card's printed ID here to pre-register it for later. This is <span className="font-medium">not</span> something {form.name?.split(" ")[0] || "they"} can type in — for that, use the access code below.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="w-3.5 h-3.5" /> Access code (keypad)
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-lg font-bold tracking-[0.2em]">{form.access_code || "—"}</div>
                  <Button type="button" variant="outline" size="sm" onClick={generateAccessCode} disabled={codeBusy}>
                    {form.access_code ? "Generate new code" : "Generate code"}
                  </Button>
                </div>
                {codeError && <p className="text-xs text-destructive">{codeError}</p>}
                <p className="text-xs text-muted-foreground">
                  Give this code to {form.name?.split(" ")[0] || "them"} — they can type it on the bus boarding kiosk's keypad instead of tapping a badge.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Nfc className="w-3.5 h-3.5" /> NFC card tag
              </Label>
              <Input
                value={form.nfc_card_tag || ""}
                onChange={(e) => set("nfc_card_tag", e.target.value)}
                placeholder="NFC card ID"
              />
              {form.type === "staff" && (
                <p className="text-xs text-muted-foreground">
                  Save this contact first, then edit it to tap-register a badge or generate an access code.
                </p>
              )}
            </div>
          )}

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