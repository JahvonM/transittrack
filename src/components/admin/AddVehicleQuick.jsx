import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const empty = { name: "", plate_number: "", type: "bus", capacity: "", company_id: "", driver_email: "", driver_name: "" };

export default function AddVehicleQuick({ companies, onChange }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="rounded-full h-11 w-11 shadow-md" title="Add a vehicle">
          <Plus className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add a vehicle</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-2">
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
          <Input type="email" placeholder="Driver email" value={form.driver_email} onChange={(e) => setForm({ ...form, driver_email: e.target.value })} className="sm:col-span-2" />
          <Button className="sm:col-span-2" onClick={submit} disabled={busy || !form.name || !form.company_id}>
            {busy ? "Adding…" : "Add vehicle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}