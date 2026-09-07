import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Phone, PackageSearch } from "lucide-react";

export default function PassengerSupport() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    base44.entities.Company.list().then(setCompanies).catch(() => {});
  }, []);

  const submit = async () => {
    if (!name || !desc) {
      toast({ title: "Please fill in your name and item description", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await base44.entities.Broadcast.create({
        type: "info",
        title: "Lost item report",
        message: `Lost item by ${name} (${contact}): ${desc}`,
      });
      toast({ title: "Report submitted", description: "Your transport provider has been notified." });
      setName("");
      setContact("");
      setDesc("");
    } catch (e) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <AppLayout title="Passenger Support">
      <div className="max-w-lg space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Contact your operator</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {companies.length === 0 && <p className="text-sm text-muted-foreground">No operators found.</p>}
            {companies.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                <div className="flex-1">
                  <div className="font-medium text-sm">{c.name}</div>
                  {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                </div>
                {c.phone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${c.phone}`}><Phone className="w-4 h-4 mr-1" />Call</a>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageSearch className="w-5 h-5 text-primary" /> Report a lost item
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact (phone or email)</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Item description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the lost item and where you left it…" rows={3} />
            </div>
            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit report"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}