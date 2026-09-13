import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bus, Car, Check, FileSpreadsheet, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { exportToCSV, exportToPDF } from "@/lib/exporters";

const VEHICLE_COLS = [
  { key: "name", label: "Name" },
  { key: "plate_number", label: "Plate" },
  { key: "type", label: "Type" },
  { key: "company_name", label: "Company" },
  { key: "driver_name", label: "Driver" },
  { key: "driver_email", label: "Driver email" },
  { key: "status", label: "Status" },
  { key: "capacity", label: "Capacity" },
  { key: "entry_code", label: "Entry code" },
  { key: "created_date", label: "Created" },
];

const empty = {
  name: "",
  plate_number: "",
  type: "bus",
  capacity: "",
  company_id: "",
  driver_email: "",
  driver_name: "",
  driver_pin: "",
  entry_code: "",
  route_id: "",
};

function AddVehicleDialog({ companies, onChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!form.name || !form.company_id) return;
    setAdding(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      await base44.entities.Vehicle.create({
        name: form.name,
        plate_number: form.plate_number,
        type: form.type,
        capacity: Number(form.capacity) || 0,
        driver_email: form.driver_email,
        driver_name: form.driver_name,
        driver_pin: form.driver_pin || null,
        entry_code: form.entry_code || null,
        route_id: form.route_id || null,
        company_id: form.company_id,
        company_name: company?.name || "",
        status: "offline",
      });
      setForm(empty);
      setOpen(false);
      onChange();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Add vehicle
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select value={form.company_id} onValueChange={(c) => setForm({ ...form, company_id: c })}>
              <SelectTrigger><SelectValue placeholder="Choose company" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bus 12" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Plate</Label>
              <Input value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="ISL-101" />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="30" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(t) => setForm({ ...form, type: t })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bus">Bus</SelectItem>
                <SelectItem value="taxi">Taxi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Driver name</Label>
            <Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="John D." />
          </div>
          <div className="space-y-1.5">
            <Label>Driver email (their login)</Label>
            <Input type="email" value={form.driver_email} onChange={(e) => setForm({ ...form, driver_email: e.target.value })} placeholder="driver@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Driver PIN (4 digits)</Label>
            <Input inputMode="numeric" maxLength={4} value={form.driver_pin} onChange={(e) => setForm({ ...form, driver_pin: e.target.value.replace(/\D/g, "") })} placeholder="1234" />
          </div>
          <div className="space-y-1.5">
            <Label>Bus entry code</Label>
            <Input value={form.entry_code} onChange={(e) => setForm({ ...form, entry_code: e.target.value.toUpperCase() })} placeholder="BUS12" />
          </div>
          <Button className="w-full" onClick={add} disabled={adding || !form.name || !form.company_id}>
            {adding ? "Adding…" : "Add vehicle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VehiclesTab({ vehicles, companies, routes, onChange }) {
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  const remove = async (id) => {
    await base44.entities.Vehicle.delete(id);
    onChange();
  };

  const startEdit = (v) => {
    setEditId(v.id);
    setEdit({
      name: v.name,
      plate_number: v.plate_number || "",
      driver_name: v.driver_name || "",
      driver_email: v.driver_email || "",
      driver_pin: v.driver_pin || "",
      entry_code: v.entry_code || "",
      company_id: v.company_id || "",
      route_id: v.route_id || "",
    });
  };

  const saveEdit = async () => {
    const company = companies.find((c) => c.id === edit.company_id);
    await base44.entities.Vehicle.update(editId, {
      name: edit.name,
      plate_number: edit.plate_number,
      driver_name: edit.driver_name,
      driver_email: edit.driver_email,
      driver_pin: edit.driver_pin || null,
      entry_code: edit.entry_code || null,
      company_id: edit.company_id || null,
      company_name: company?.name || "",
      route_id: edit.route_id || null,
    });
    setEditId(null);
    setEdit({});
    onChange();
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <AddVehicleDialog companies={companies} onChange={onChange} />
        <Button size="sm" variant="outline" onClick={() => exportToCSV("vehicles", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportToPDF("vehicles", "Vehicle fleet", VEHICLE_COLS, vehicles)} disabled={!vehicles.length}>
          <FileText className="w-4 h-4" /> PDF
        </Button>
      </div>
      {vehicles.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl">
          No vehicles yet. Add your first bus or taxi.
        </p>
      )}
      {vehicles.map((v) => (
        <div key={v.id} className="p-3 rounded-xl border bg-card">
          {editId === v.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Name" />
                <Input value={edit.plate_number} onChange={(e) => setEdit({ ...edit, plate_number: e.target.value })} placeholder="Plate" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={edit.driver_name} onChange={(e) => setEdit({ ...edit, driver_name: e.target.value })} placeholder="Driver name" />
                <Input value={edit.driver_email} onChange={(e) => setEdit({ ...edit, driver_email: e.target.value })} placeholder="Driver email" />
              </div>
              <Input inputMode="numeric" maxLength={4} value={edit.driver_pin} onChange={(e) => setEdit({ ...edit, driver_pin: e.target.value.replace(/\D/g, "") })} placeholder="Driver PIN (4 digits)" />
              <Input value={edit.entry_code} onChange={(e) => setEdit({ ...edit, entry_code: e.target.value.toUpperCase() })} placeholder="Bus entry code (e.g. BUS12)" />
              <Select value={edit.company_id} onValueChange={(c) => setEdit({ ...edit, company_id: c })}>
                <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4 mr-1" />Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}><X className="w-4 h-4 mr-1" />Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                {v.type === "taxi" ? <Car className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {v.name} <span className="text-xs text-muted-foreground font-normal">· {v.plate_number}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {v.company_name} · Driver: {v.driver_name || v.driver_email || "Unassigned"} · PIN: {v.driver_pin || "—"} · Code: {v.entry_code || "—"}
                </div>
              </div>
              <Badge variant={v.status === "on_trip" ? "default" : v.status === "idle" ? "secondary" : "outline"}>
                {v.status === "on_trip" ? "On trip" : v.status === "idle" ? "Idle" : "Offline"}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => startEdit(v)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
