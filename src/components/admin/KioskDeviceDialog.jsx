import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const KIOSK_TYPES = [
  { value: "bus_boarding", label: "Bus boarding" },
  { value: "driver", label: "Driver tablet" },
  { value: "front_desk", label: "Front-desk sign-in" },
];

export default function KioskDeviceDialog({ open, onOpenChange, companies, vehicles, device, onSaved }) {
  const isEdit = !!device;
  const [label, setLabel] = useState("");
  const [kioskType, setKioskType] = useState("bus_boarding");
  const [companyId, setCompanyId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(device?.label || "");
      setKioskType(device?.kiosk_type && device.kiosk_type !== "badge_registry" ? device.kiosk_type : "bus_boarding");
      setCompanyId(device?.company_id || "");
      setVehicleId(device?.vehicle_id || "");
    }
  }, [open, device]);

  const filteredVehicles = vehicles.filter((v) => {
    if (!companyId) return [];
    const byCompany = v.company_id === companyId;
    if (kioskType === "bus_boarding" || kioskType === "driver") return byCompany && v.type === "bus";
    return byCompany;
  });

  const needsVehicle = kioskType === "bus_boarding" || kioskType === "driver";

  const handleSave = async () => {
    if (!label.trim()) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    if (!companyId) {
      toast({ title: "Company required", variant: "destructive" });
      return;
    }
    if (needsVehicle && !vehicleId) {
      toast({ title: "Vehicle required for this kiosk type", variant: "destructive" });
      return;
    }

    const company = companies.find((c) => c.id === companyId);
    const vehicle = filteredVehicles.find((v) => v.id === vehicleId);

    setSaving(true);
    try {
      if (isEdit) {
        await base44.entities.KioskDevice.update(device.id, {
          label: label.trim(),
          kiosk_type: kioskType,
          company_id: companyId,
          company_name: company?.name || "",
          vehicle_id: needsVehicle ? vehicleId : "",
          vehicle_name: needsVehicle ? vehicle?.name : "",
        });
        toast({ title: "Device updated" });
      } else {
        const code = randomCode();
        await base44.entities.KioskDevice.create({
          label: label.trim(),
          kiosk_type: kioskType,
          company_id: companyId,
          company_name: company?.name || "",
          vehicle_id: needsVehicle ? vehicleId : "",
          vehicle_name: needsVehicle ? vehicle?.name : "",
          pairing_code: code,
          paired: false,
          status: "active",
        });
        toast({ title: "Device registered", description: `Pairing code: ${code}` });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectClass = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Reassign device" : "Register kiosk tablet"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this device's company, vehicle, or kiosk type."
              : "Create a device record and receive a one-time pairing code for the kiosk app."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Device label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Lobby tablet, Bus 12 tablet"
            />
          </div>
          <div className="space-y-2">
            <Label>Kiosk type</Label>
            <select
              value={kioskType}
              onChange={(e) => setKioskType(e.target.value)}
              className={selectClass}
            >
              {KIOSK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setVehicleId(""); }}
              className={selectClass}
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {needsVehicle && (
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={selectClass}
                disabled={!companyId}
              >
                <option value="">Select vehicle…</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.plate_number ? ` · ${v.plate_number}` : ""}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Register device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}