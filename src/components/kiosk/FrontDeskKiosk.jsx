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
      <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden bg-gradient-to-b from-emerald-500/15 to-transparent">
        <CardContent className="p-10 text-center space-y-4 animate-in fade-in zoom-in-90 duration-500">
          <div className="mx-auto w-20 h-20 rounded-full bg-success/15 grid place-items-center animate-in zoom-in spin-in-6 duration-500">
            <CheckCircle2 className="w-11 h-11 text-success" />
          </div>
          <p className="text-2xl font-bold">Thanks, {fullName.split(" ")[0]}! You're signed in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl shadow-xl border-border/60 overflow-hidden">
      <CardContent className="p-7 space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center gap-2.5 justify-center text-muted-foreground">
          <DoorOpen className="w-6 h-6" /> <span className="font-bold text-lg text-foreground">Visitor sign-in</span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Full name</Label>
          <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="h-12 text-base rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Company (optional)</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Who are you visiting from?" className="h-12 text-base rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Reason for visit (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Meeting, delivery, interview…" className="text-base rounded-xl" />
        </div>
        <SignaturePad ref={padRef} />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button className="w-full h-14 text-base rounded-2xl" onClick={submit} disabled={submitting || !fullName.trim()}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </CardContent>
    </Card>
  );
}
