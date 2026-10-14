import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignaturePad";
import { Segmented } from "@/components/admin/kit";
import { SIGNER_ROLES, defaultSigner } from "@/lib/jobs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// onSign(file, signedBy, guests, role) lets callers without a login (driver
// tablets) upload through their own backend; otherwise the file is uploaded
// here and onSaved receives its URL. With askGuests, the signer also confirms
// how many guests there are (filled in from the job) and says who they are: a
// guest, or the hotel's front desk confirming the pickup or drop-off.
export default function TripSignatureDialog({ open, onOpenChange, trip, mode, onSaved, onSign, askGuests = false }) {
  const [name, setName] = useState("");
  const [guests, setGuests] = useState("");
  const [role, setRole] = useState("guest");
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName("");
      setGuests(trip?.guests != null ? String(trip.guests) : "");
      setRole(defaultSigner(trip, mode));
      setHasInk(false);
      setError("");
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const file = await padRef.current.toFile();
      if (onSign) {
        await onSign(file, name.trim(), askGuests && guests !== "" ? Number(guests) : null, askGuests ? role : undefined);
      } else {
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        onSaved({ file_url, signed_by: name.trim(), signed_at: new Date().toISOString() });
      }
      onOpenChange(false);
    } catch {
      setError("Couldn't save the signature. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const place = mode === "pickup" ? trip?.pickup_name : trip?.dropoff_name;
  const reception = askGuests && role === "reception";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "pickup" ? "Confirm pickup" : "Confirm drop-off"}</DialogTitle>
          <DialogDescription>
            {!askGuests ? `Ask the guest or hotel staff at ${place} to enter their name and sign below.`
              : reception ? `Ask the front desk at ${place} to confirm the guests were ${mode === "pickup" ? "picked up" : "dropped off"} here, and sign below.`
                : `Ask the guest to enter their name and sign below to confirm the ${mode === "pickup" ? "pickup" : "drop-off"} at ${place}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {askGuests && (
            <div className="space-y-1.5">
              <Label>Who's signing?</Label>
              <Segmented label="Who's signing?" value={role} onChange={setRole} options={SIGNER_ROLES} size="sm" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="signer-name">{!askGuests ? "Signer's name" : reception ? "Receptionist's name" : "Guest's name"}</Label>
            <Input
              id="signer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={reception ? "e.g. Mary at reception" : !askGuests ? "e.g. Hotel receptionist" : "e.g. Mr Smith"}
            />
          </div>
          {askGuests && (
            <div className="space-y-1.5">
              <Label htmlFor="signer-guests">Number of guests</Label>
              <Input id="signer-guests" type="number" inputMode="numeric" min={0} max={500} value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Signature</Label>
            <SignaturePad ref={padRef} onChange={setHasInk} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={save} disabled={saving || !hasInk || !name.trim()}>
            {saving ? "Saving…" : "Confirm signature"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}