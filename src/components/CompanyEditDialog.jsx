import CompanyLogoPicker from "@/components/CompanyLogoPicker";
import { toast } from "@/components/ui/use-toast";
import React, { Suspense, lazy, useEffect, useState } from "react";
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

const LocationPicker = lazy(() => import("@/components/directory/LocationPicker"));

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
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // The company's workplace: where every pickup passenger is dropped off.
  const [workplace, setWorkplace] = useState({ id: null, name: "", lat: null, lng: null, loaded: false });

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setLogoUrl(company.logo_url || "");
      setPhone(company.phone || "");
      setBossPhone(company.boss_phone || "");
      setSecretaryPhone(company.secretary_phone || "");
      setServices(company.service_types || []);
    }
  }, [company]);

  useEffect(() => {
    if (!open || !company?.id) return;
    let live = true;
    setWorkplace({ id: null, name: "", lat: null, lng: null, loaded: false });
    base44.entities.Workplace.filter({ company_id: company.id })
      .then((rows) => {
        if (!live) return;
        const w = rows.find((x) => x.lat != null && x.lng != null) || rows[0];
        setWorkplace({ id: w?.id || null, name: w?.name || "", lat: w?.lat ?? null, lng: w?.lng ?? null, loaded: true });
      })
      .catch(() => { if (live) setWorkplace((w) => ({ ...w, loaded: true })); });
    return () => { live = false; };
  }, [open, company?.id]);

  const toggle = (k) =>
    setServices((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Company.update(company.id, {
        name,
        logo_url: logoUrl,
        phone,
        boss_phone: bossPhone,
        secretary_phone: secretaryPhone,
        service_types: services,
      });
      if (Number.isFinite(workplace.lat) && Number.isFinite(workplace.lng)) {
        const data = { name: workplace.name.trim() || name, company_id: company.id, company_name: name, lat: workplace.lat, lng: workplace.lng };
        if (workplace.id) await base44.entities.Workplace.update(workplace.id, data);
        else await base44.entities.Workplace.create(data);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) { toast({ title: "Couldn't save company", description: e.message, variant: "destructive" }); }
    finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <CompanyLogoPicker name={name} value={logoUrl} onChange={setLogoUrl} onBusyChange={setUploading} disabled={saving} />
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
          <div className="space-y-1.5">
            <Label htmlFor="tt-workplace-name">Workplace (drop-off)</Label>
            <p className="text-xs text-muted-foreground">Where the bus drops off everyone it picks up. It shows as the last stop for drivers and passengers. Tap the map to pin it.</p>
            <Input id="tt-workplace-name" value={workplace.name} onChange={(e) => setWorkplace((w) => ({ ...w, name: e.target.value }))} placeholder="e.g. Head office, True Blue" />
            {workplace.loaded && (
              <Suspense fallback={<div className="h-[200px] animate-pulse rounded-lg bg-muted" />}>
                <LocationPicker key={company?.id} lat={workplace.lat} lng={workplace.lng} onChange={(lat, lng) => setWorkplace((w) => ({ ...w, lat, lng }))} />
              </Suspense>
            )}
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
          <Button onClick={save} disabled={saving || uploading || !name}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}