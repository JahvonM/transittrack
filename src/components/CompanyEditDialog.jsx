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

const SERVICES = [
  { key: "staff_bus", label: "Staff bus" },
  { key: "taxi", label: "Taxi" },
  { key: "airport", label: "Airport" },
];

export default function CompanyEditDialog({ company, open, onOpenChange, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setPhone(company.phone || "");
      setServices(company.service_types || []);
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
        service_types: services,
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