import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2 } from "lucide-react";
import { accountName } from "@/lib/userName";

const STATUS_LABEL = { open: "Looking for it", found: "Found", returned: "Returned", closed: "Closed" };

// Lost-item report. Goes to a private LostItemReport record that only admins,
// the company's managers and the reporter can read (it used to be sent as a
// public announcement, which exposed people's contact details to everyone).
export default function LostItemReport({ company, vehicles = [] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contact, setContact] = useState(user?.phone || user?.email || "");
  const [vehicleName, setVehicleName] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState([]);

  const loadMine = () =>
    base44.entities.LostItemReport.filter({ created_by_id: user?.id }, "-created_date", 5)
      .then(setMine)
      .catch(() => {});
  useEffect(() => { if (user?.id) loadMine(); }, [user?.id]);

  const submit = async () => {
    if (!desc.trim()) {
      toast({ title: "Describe the item first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await base44.entities.LostItemReport.create({
        company_id: company?.id || user?.company_id || "",
        company_name: company?.name || "",
        reporter_name: accountName(user),
        reporter_email: user?.email || "",
        contact: contact.trim(),
        vehicle_name: vehicleName,
        description: desc.trim(),
        status: "open",
      });
      toast({ title: "Report sent", description: "Your transport team has it and will contact you." });
      setDesc("");
      setVehicleName("");
      loadMine();
    } catch (e) {
      toast({ title: "Couldn't send the report", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="lost-desc">What did you lose?</Label>
        <Textarea id="lost-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Black umbrella, left on the back seat this morning" rows={3} />
      </div>
      {vehicles.length > 0 && (
        <div className="space-y-1.5">
          <Label>Which bus? (if you know)</Label>
          <MobileSelect
            value={vehicleName || "unknown"}
            onValueChange={(v) => setVehicleName(v === "unknown" ? "" : v)}
            options={[{ value: "unknown", label: "Not sure" }, ...vehicles.map((v) => ({ value: v.name, label: v.name }))]}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="lost-contact">How should we reach you?</Label>
        <Input id="lost-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
        <p className="text-xs text-muted-foreground">Only your transport team can see this.</p>
      </div>
      <Button className="w-full" onClick={submit} disabled={submitting}>
        {submitting ? "Sending…" : "Send report"}
      </Button>

      {mine.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Your reports</p>
          <ul className="space-y-1.5">
            {mine.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                <span className="flex-1 min-w-0 truncate">{r.description}</span>
                <span className={`text-xs whitespace-nowrap ${r.status === "found" || r.status === "returned" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {(r.status === "found" || r.status === "returned") && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}