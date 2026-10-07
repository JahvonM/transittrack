import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignaturePad";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// onSign(file, signedBy) lets callers without a login (driver tablets) upload
// through their own backend; otherwise the file is uploaded here and onSaved
// receives its URL.
export default function TripSignatureDialog({ open, onOpenChange, trip, mode, onSaved, onSign }) {
  const [name, setName] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName("");
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
        await onSign(file, name.trim());
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "pickup" ? "Confirm pickup" : "Confirm drop-off"}</DialogTitle>
          <DialogDescription>
            Ask the guest or hotel staff at {place} to enter their name and sign below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="signer-name">Signer's name</Label>
            <Input
              id="signer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hotel receptionist"
            />
          </div>
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