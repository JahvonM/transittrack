import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SignaturePad from "@/components/SignaturePad";
import { CheckCircle2, Loader2, PenLine } from "lucide-react";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";

export default function FrontDeskKiosk() {
  const { safeCreate, online, pendingCount } = useOfflineSync();
  const sigRef = useRef(null);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [reason, setReason] = useState("");
  const [hasSig, setHasSig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setFullName("");
    setCompanyName("");
    setReason("");
    setHasSig(false);
    sigRef.current?.clear();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !hasSig || submitting) return;
    setSubmitting(true);
    try {
      const file = await sigRef.current.toFile();
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await safeCreate("FrontDeskSignIns", {
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        reason: reason.trim(),
        signature_url: file_url,
        signed_at: new Date().toISOString(),
      });
      setDone(true);
      setTimeout(() => {
        setDone(false);
        reset();
      }, 2500);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-emerald-500 text-white z-50">
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <CheckCircle2 className="w-24 h-24 mx-auto mb-4 drop-shadow-lg" />
          <div className="text-3xl font-bold">Signed In</div>
          <div className="text-lg mt-2 opacity-90">Thank you, {fullName.split(" ")[0]}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-5">
        <div className="flex items-center gap-2 font-heading font-semibold">
          <PenLine className="w-5 h-5 text-primary" />
          Front Desk Sign-In
        </div>
        <OfflineStatusBadge online={online} pendingCount={pendingCount} />
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Visitor Sign-In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fn" className="text-base">Full Name</Label>
                <Input
                  id="fn"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="h-12 text-base"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cn" className="text-base">Company Name</Label>
                <Input
                  id="cn"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company you represent"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rs" className="text-base">Reason for Visit</Label>
                <Input
                  id="rs"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Purpose of your visit"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Signature</Label>
                <SignaturePad ref={sigRef} onChange={setHasSig} />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-base"
                disabled={submitting || !fullName.trim() || !hasSig}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit Sign-In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}