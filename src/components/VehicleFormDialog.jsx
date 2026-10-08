import VehicleArtworkPicker from "@/components/VehicleArtworkPicker";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useToast } from "@/components/ui/use-toast";
import VehicleModelPicker from "@/components/VehicleModelPicker";
import { modelIdFor } from "@/lib/vehicleModels";

const blank = {
  company_id: "", name: "", fleet_number: "", plate_number: "", type: "bus", capacity: "",
  vin: "", current_odometer: "", make: "", model: "", year: "", route_id: "", entry_code: "", model_3d: "city_bus", image_url: "",
};

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const numOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// Add / edit a vehicle. Admins pick the company; a company manager's own
// company is fixed. Includes the vehicle's 3D map model.
export default function VehicleFormDialog({ open, onOpenChange, vehicle, companies = [], fixedCompany, routes = [], onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editing = !!vehicle?.id;

  useEffect(() => {
    if (!open) return;
    setForm(
      vehicle
        ? {
            ...blank,
            ...Object.fromEntries(Object.keys(blank).map((k) => [k, vehicle[k] ?? ""])),
            model_3d: modelIdFor(vehicle),
          }
        : { ...blank, company_id: fixedCompany?.id || "" }
    );
  }, [open, vehicle, fixedCompany]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setType = (t) =>
    setForm((f) => ({
      ...f,
      type: t,
      // Keep the 3D model sensible when switching bus <-> taxi.
      model_3d: t === "taxi" && !["taxi", "sedan"].includes(f.model_3d) ? "taxi" : t === "bus" && ["taxi", "sedan"].includes(f.model_3d) ? "city_bus" : f.model_3d,
    }));

  const companyId = fixedCompany?.id || form.company_id;
  const companyRoutes = routes.filter((r) => !r.company_id || r.company_id === companyId);
  const canSave = form.name.trim() && companyId;

  const save = async () => {
    if (!canSave || uploading) return;
    setSaving(true);
    const company = fixedCompany || companies.find((c) => c.id === companyId);
    const data = {
      name: form.name.trim(),
      fleet_number: form.fleet_number.trim(),
      plate_number: form.plate_number.trim(),
      type: form.type,
      capacity: numOrNull(form.capacity) ?? 0,
      vin: form.vin.trim().toUpperCase(),
      current_odometer: numOrNull(form.current_odometer),
      make: form.make.trim(),
      model: form.model.trim(),
      year: numOrNull(form.year),
      route_id: form.route_id || null,
      model_3d: form.model_3d,
      image_url: form.image_url,
      company_id: companyId,
      company_name: company?.name || "",
    };
    try {
      if (editing) await base44.entities.Vehicle.update(vehicle.id, data);
      else await base44.entities.Vehicle.create({ ...data, status: "offline" });
      toast({ title: editing ? "Vehicle updated" : "Vehicle added" });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Couldn't save vehicle", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${vehicle.name}` : "Add vehicle"}</DialogTitle>
          <DialogDescription>Drivers and their PINs are assigned from the Drivers tab.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1 -mr-1">
          {!fixedCompany && (
            <Field label="Company">
              <MobileSelect value={form.company_id} onValueChange={(v) => set("company_id", v)} placeholder="Choose company" options={companies.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Bus 12" /></Field>
            <Field label="Vehicle number"><Input value={form.fleet_number} onChange={(e) => set("fleet_number", e.target.value)} placeholder="BUS-012" /></Field>
            <Field label="Plate / registration"><Input value={form.plate_number} onChange={(e) => set("plate_number", e.target.value)} placeholder="PE 4512" /></Field>
            <Field label="Type">
              <MobileSelect value={form.type} onValueChange={setType} options={[{ value: "bus", label: "Bus" }, { value: "taxi", label: "Taxi" }]} />
            </Field>
            <Field label="Chassis number (VIN)"><Input value={form.vin} onChange={(e) => set("vin", e.target.value.toUpperCase())} placeholder="JTFSS22P…" className="font-mono" /></Field>
            <Field label="Mileage (km)"><Input type="number" inputMode="numeric" value={form.current_odometer} onChange={(e) => set("current_odometer", e.target.value)} placeholder="84250" /></Field>
            <Field label="Seats"><Input type="number" inputMode="numeric" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="30" /></Field>
            <Field label="Year"><Input type="number" inputMode="numeric" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2021" /></Field>
            <Field label="Make"><Input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" /></Field>
            <Field label="Model"><Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Coaster" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Route">
              <MobileSelect
                value={form.route_id || "none"}
                onValueChange={(v) => set("route_id", v === "none" ? "" : v)}
                options={[{ value: "none", label: "No route" }, ...companyRoutes.map((r) => ({ value: r.id, label: r.name }))]}
              />
            </Field>
          </div>
          <VehicleArtworkPicker value={form.image_url} name={form.name} onChange={(url) => set("image_url", url)} onBusyChange={setUploading} disabled={saving} />
          <Field label="3D model on the map" hint="How this vehicle looks on every live map.">
            <VehicleModelPicker value={form.model_3d} onChange={(v) => set("model_3d", v)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={saving || uploading || !canSave}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add vehicle"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
