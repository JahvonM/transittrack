import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const empty = { name: "", plate_number: "", type: "bus", capacity: "", company_id: "", driver_email: "", driver_name: "" };

export default function AddVehicleQuick({ companies, onChange }) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name || !form.company_id) return;
    setBusy(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      await base44.entities.Vehicle.create({
        name: form.name,
        plate_number: form.plate_number,
        type: form.type,
        capacity: Number(form.capacity) || 0,
        driver_email: form.driver_email,
        driver_name: form.driver_name,
        company_id: form.company_id,
        company_name: company?.name || "",
        status: "offline",
      });
      setForm(empty);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add a vehicle
        </CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
          <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Vehicle name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Plate" value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} />
        <Input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bus">Bus</SelectItem>
            <SelectItem value="taxi">Taxi</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Driver name" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
        <Input type="email" placeholder="Driver email" value={form.driver_email} onChange={(e) => setForm({ ...form, driver_email: e.target.value })} />
        <Button className="sm:col-span-2 lg:col-span-3" onClick={submit} disabled={busy || !form.name || !form.company_id}>
          {busy ? "Adding…" : "Add vehicle"}
        </Button>
      </CardContent>
    </Card>
  );
}