import React, { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, DoorOpen } from "lucide-react";
import SignaturePad from "./SignaturePad";

export default function FrontDeskKiosk({ invoke }) {
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef(null);
  const resetTimer = useRef(null);

  const submit = async () => {
    if (!fullName.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const signature_base64 = padRef.current && !padRef.current.isEmpty() ? padRef.current.toDataUrl() : "";
      await invoke("front_desk_sign_in", {
        full_name: fullName.trim(), company_name: companyName.trim(), reason: reason.trim(), signature_base64,
      });
      setDone(true);
      resetTimer.current = setTimeout(() => {
        setFullName(""); setCompanyName(""); setReason(""); padRef.current?.clear(); setDone(false);
      }, 3000);
    } catch {
      setError("Something went wrong — please try signing in again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
          <p className="text-lg font-semibold">Thanks, {fullName.split(" ")[0]}! You're signed in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2 justify-center text-muted-foreground">
          <DoorOpen className="w-5 h-5" /> <span className="font-medium">Visitor sign-in</span>
        </div>
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <Label>Company (optional)</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Who are you visiting from?" />
        </div>
        <div className="space-y-1.5">
          <Label>Reason for visit (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Meeting, delivery, interview…" />
        </div>
        <SignaturePad ref={padRef} />
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={submitting || !fullName.trim()}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </CardContent>
    </Card>
  );
}
