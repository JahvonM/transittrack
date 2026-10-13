import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/admin/kit";
import { useToast } from "@/components/ui/use-toast";
import { CURRENCIES } from "@/lib/jobs";
import { errorData } from "@/lib/requestError";

export const CLIENT_KINDS = [
  { value: "hotel", label: "Hotel" },
  { value: "company", label: "Company" },
  { value: "tour_operator", label: "Tour operator" },
  { value: "person", label: "Person" },
  { value: "other", label: "Other" },
];
const EMPTY = { name: "", kind: "hotel", contact_name: "", email: "", phone: "", address: "", currency: "XCD", notes: "" };

// Who a job is for and who gets the invoice.
export default function ClientDialog({ open, onOpenChange, client, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(client ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, client[k] ?? EMPTY[k]])) } : EMPTY);
  }, [open, client]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const field = (key, label, props = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`client-${key}`}>{label}</Label>
      <Input id={`client-${key}`} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </div>
  );
  const save = async () => {
    setSaving(true);
    try {
      const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
      const row = client ? await base44.entities.Client.update(client.id, data) : await base44.entities.Client.create(data);
      onSaved?.(row);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't save the client", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "Add a client"}</DialogTitle>
          <DialogDescription>Hotels, companies and people you do jobs for. Invoices go to the client.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Segmented label="Kind of client" value={form.kind} onChange={(kind) => set({ kind })} options={CLIENT_KINDS} size="sm" />
          {field("name", "Name", { placeholder: "e.g. Spice Island Beach Resort", maxLength: 120 })}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("contact_name", "Contact person", { maxLength: 120 })}
            {field("phone", "Phone", { type: "tel", maxLength: 40 })}
          </div>
          {field("email", "Email for invoices", { type: "email", maxLength: 200 })}
          {field("address", "Billing address", { maxLength: 300 })}
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Segmented label="Currency" value={form.currency} onChange={(currency) => set({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} size="sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes (optional)</Label>
            <Textarea id="client-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} rows={2} />
          </div>
          <Button className="w-full" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : client ? "Save changes" : "Add client"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
