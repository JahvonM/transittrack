import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SERVICES = [
  { key: "staff_bus", label: "Staff bus" },
  { key: "taxi", label: "Taxi" },
  { key: "airport", label: "Airport" },
];

export default function CompanyEditDialog({ company, open, onOpenChange, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bossPhone, setBossPhone] = useState("");
  const [secretaryPhone, setSecretaryPhone] = useState("");
  const [services, setServices] = useState([]);
  const [autoCreateFaults, setAutoCreateFaults] = useState(true);
  const [reminderDays, setReminderDays] = useState(14);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setPhone(company.phone || "");
      setBossPhone(company.boss_phone || "");
      setSecretaryPhone(company.secretary_phone || "");
      setServices(company.service_types || []);
      setAutoCreateFaults(company.auto_create_faults !== false);
      setReminderDays(company.maintenance_reminder_days ?? 14);
    }
  }, [company]);

  const toggle = (k) =>
    setServices((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Company.update(company.id, {
        name,
        phone,
        boss_phone: bossPhone,
        secretary_phone: secretaryPhone,
        service_types: services,
        auto_create_faults: autoCreateFaults,
        maintenance_reminder_days: Number(reminderDays) || 14,
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 473-..." />
          </div>
          <div className="space-y-1.5">
            <Label>Boss / owner's phone (WhatsApp)</Label>
            <Input value={bossPhone} onChange={(e) => setBossPhone(e.target.value)} placeholder="+1 473-..." />
            <p className="text-xs text-muted-foreground">SOS alerts from drivers go here — not to staff.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Secretary / dispatch phone (WhatsApp)</Label>
            <Input value={secretaryPhone} onChange={(e) => setSecretaryPhone(e.target.value)} placeholder="+1 473-..." />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Auto-create faults</Label>
              <p className="text-xs text-muted-foreground">Failed pre-trip inspections automatically open a Fault ticket.</p>
            </div>
            <Switch checked={autoCreateFaults} onCheckedChange={setAutoCreateFaults} />
          </div>
          <div className="space-y-1.5">
            <Label>Maintenance reminder (days ahead)</Label>
            <Input
              type="number"
              min={1}
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">How many days before a schedule is due to send a reminder email.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Services</Label>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={`px-3 h-9 rounded-lg border text-sm ${
                    services.includes(s.key)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}