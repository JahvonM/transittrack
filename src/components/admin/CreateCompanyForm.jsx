import CompanyLogoPicker from "@/components/CompanyLogoPicker";
import { toast } from "@/components/ui/use-toast";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";


export default function CreateCompanyForm({ onChange }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bossPhone, setBossPhone] = useState("");
  const [secretaryPhone, setSecretaryPhone] = useState("");
  const [staff, setStaff] = useState(true);
  const [taxi, setTaxi] = useState(false);
  const [airport, setAirport] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name) return;
    setSaving(true);
    const service_types = [staff && "staff_bus", taxi && "taxi", airport && "airport"].filter(Boolean);
    try {
      await base44.entities.Company.create({ name, phone, boss_phone: bossPhone, secretary_phone: secretaryPhone, service_types, logo_url: logoUrl });
      setName(""); setPhone(""); setBossPhone(""); setSecretaryPhone(""); setLogoUrl("");
      setStaff(true); setTaxi(false); setAirport(false);
      onChange();
    } catch (e) { toast({ title: "Couldn't create company", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggles = [
    { key: "staff", label: "Staff bus", val: staff, set: setStaff },
    { key: "taxi", label: "Taxi", val: taxi, set: setTaxi },
    { key: "airport", label: "Airport", val: airport, set: setAirport },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4" /> New company
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Company name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Island Transit Co." />
        </div>
        <CompanyLogoPicker name={name} value={logoUrl} onChange={setLogoUrl} onBusyChange={setUploading} disabled={saving} />
        <div className="space-y-1.5">
          <Label>Contact phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 473-..." />
        </div>
        <div className="space-y-1.5">
          <Label>Boss / owner's phone (WhatsApp, for SOS alerts)</Label>
          <Input value={bossPhone} onChange={(e) => setBossPhone(e.target.value)} placeholder="+1 473-..." />
        </div>
        <div className="space-y-1.5">
          <Label>Secretary / dispatch phone (WhatsApp, for SOS alerts)</Label>
          <Input value={secretaryPhone} onChange={(e) => setSecretaryPhone(e.target.value)} placeholder="+1 473-..." />
        </div>
        <div className="space-y-1.5">
          <Label>Services</Label>
          <div className="flex flex-wrap gap-2">
            {toggles.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => s.set(!s.val)}
                className={`px-3 h-9 rounded-lg border text-sm transition-colors ${
                  s.val ? "bg-primary text-primary-foreground border-primary" : "bg-card"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={submit} disabled={saving || uploading || !name}>
          {saving ? "Creating…" : "Create company"}
        </Button>
      </CardContent>
    </Card>
  );
}