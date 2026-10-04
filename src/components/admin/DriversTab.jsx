import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import DriverDocumentsDialog, { DocChips } from "@/components/admin/DriverDocuments";
import { Bus, Camera, Car, Loader2, Mail, Pencil, Phone, Plus, Trash2, User as UserIcon, X } from "lucide-react";

const STATUSES = [
  { value: "offline", label: "Offline" },
  { value: "idle", label: "Idle" },
  { value: "on_trip", label: "On trip" },
  { value: "speeding", label: "Speeding" },
  { value: "emergency", label: "Emergency" },
];

// Drivers are entered directly here (a plain Driver record) rather than
// invited as a base44 login — the actual driver-tablet flow authenticates by
// paired device + PIN (see driverSession), never by email/password, and the
// platform won't let a User account be created without going through the
// invite/signup flow anyway. So there's nothing an email invite would buy a
// driver here — this is just their roster entry.
function DriverFormFields({ form, setForm, companies }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Full name</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John D." />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="driver@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 473-..." />
      </div>
      <div className="space-y-1.5">
        <Label>Company</Label>
        <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No company</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AddDriverDialog({ companies, onAdded }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company_id: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      await base44.entities.Driver.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        company_id: form.company_id || null,
        company_name: company?.name || "",
      });
      toast({ title: "Driver added" });
      setForm({ full_name: "", email: "", phone: "", company_id: "" });
      setOpen(false);
      onAdded();
    } catch (e) {
      toast({ title: "Couldn't add driver", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Add driver
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add driver</DialogTitle>
        </DialogHeader>
        <DriverFormFields form={form} setForm={setForm} companies={companies} />
        <Button className="w-full" onClick={save} disabled={saving || !form.full_name.trim()}>
          {saving ? "Adding…" : "Add driver"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function EditDriverDialog({ driver, companies, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company_id: "" });
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && driver) {
      setForm({
        full_name: driver.full_name || "",
        email: driver.email || "",
        phone: driver.phone || "",
        company_id: driver.company_id || "",
      });
      setPhotoUrl(driver.photo_url || "");
    }
  }, [open, driver]);

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      await base44.entities.Driver.update(driver.id, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        photo_url: photoUrl,
        company_id: form.company_id || null,
        company_name: company?.name || "",
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
          <DialogTitle>Edit driver</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted border shrink-0 grid place-items-center">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            <label className="flex items-center gap-2 px-3 h-9 rounded-lg border cursor-pointer text-sm hover:bg-accent">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              Change photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </label>
          </div>
          <DriverFormFields form={form} setForm={setForm} companies={companies} />
          <Button className="w-full" onClick={save} disabled={saving || uploading || !form.full_name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignedVehicleRow({ vehicle: v, routes, onUnassign, onSetStatus, onSetRoute, onSetPin }) {
  const [pin, setPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState("");

  useEffect(() => {
    setPin("");
  }, [v.id]);

  return (
    <div className="p-2 rounded-lg border space-y-2 mt-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
          {v.type === "taxi" ? <Car className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{v.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {v.plate_number} · {v.company_name}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onUnassign(v.id)}>
          <X className="w-4 h-4 text-destructive" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 pl-10">
        <Select value={v.status || "offline"} onValueChange={(s) => onSetStatus(v.id, s)}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={v.route_id || "none"} onValueChange={(r) => onSetRoute(v.id, r === "none" ? null : r)}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Assign route" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No route</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 w-28"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          type="password"
          aria-label={`New PIN for ${v.name}`}
          autoComplete="new-password"
          placeholder="New PIN"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          disabled={pinSaving}
        />
        <Button size="sm" disabled={pin.length !== 4 || pinSaving} onClick={async () => {
          setPinSaving(true); setPinMessage("");
          try { await onSetPin(v.id, pin); setPin(""); setPinMessage("PIN saved"); }
          catch (e) { setPinMessage(e?.response?.data?.error || e.message || "Could not save PIN"); }
          finally { setPinSaving(false); }
        }}>{pinSaving ? "Saving…" : "Save PIN"}</Button>
        {pinMessage && <p role="status" className="w-full text-xs">{pinMessage}</p>}
      </div>
    </div>
  );
}

function DriverCard({ driver, vehicles, companies, routes, docs = [], onDocsChanged, onAssign, onUnassign, onSetStatus, onSetRoute, onSetPin, onSaved, onRemove }) {
  const [editOpen, setEditOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const assigned = vehicles.filter((v) => driver.email && v.driver_email === driver.email);
  const companyName = companies.find((c) => c.id === driver.company_id)?.name;
  const pool = vehicles.filter(
    (v) => (!driver.company_id || v.company_id === driver.company_id) && v.driver_email !== driver.email
  );

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-primary to-primary/70 px-4 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.15em] text-primary-foreground uppercase">
          Driver ID
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
            onClick={() => setEditOpen(true)}
            title="Edit driver"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
                title="Remove driver"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {driver.full_name || driver.email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes their driver record and unassigns any buses currently assigned to them. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemove(driver)}>Remove driver</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted border-2 border-border shrink-0 grid place-items-center">
            {driver.photo_url ? (
              <img src={driver.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-7 h-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight truncate">{driver.full_name || "Unnamed driver"}</div>
            {driver.email && (
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 shrink-0" /> {driver.email}
              </div>
            )}
            {driver.phone && (
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Phone className="w-3 h-3 shrink-0" /> {driver.phone}
              </div>
            )}
            {companyName && (
              <Badge variant="secondary" className="font-normal mt-1">{companyName}</Badge>
            )}
          </div>
          <div className="text-center shrink-0 pl-3 border-l">
            <div className="text-xl font-bold">{assigned.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {assigned.length === 1 ? "Bus" : "Buses"}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1 border-t">
          {assigned.length === 0 && (
            <p className="text-sm text-muted-foreground pt-2">No buses assigned yet.</p>
          )}
          {assigned.map((v) => (
            <AssignedVehicleRow
              key={v.id}
              vehicle={v}
              routes={routes}
              onUnassign={onUnassign}
              onSetStatus={onSetStatus}
              onSetRoute={onSetRoute}
              onSetPin={onSetPin}
            />
          ))}
          {pool.length > 0 && driver.email && (
            <Select onValueChange={(vid) => onAssign(driver, vid)}>
              <SelectTrigger className="h-8 mt-2">
                <SelectValue placeholder="+ Assign a bus to this driver" />
              </SelectTrigger>
              <SelectContent>
                {pool.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {v.plate_number} ({v.company_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {pool.length > 0 && !driver.email && (
            <p className="text-xs text-amber-600">Add an email for this driver to assign a bus (vehicles are matched by driver email).</p>
          )}
        </div>
        <DocChips docs={docs} onOpen={() => setDocsOpen(true)} />
      </CardContent>

      <EditDriverDialog driver={driver} companies={companies} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
      <DriverDocumentsDialog driver={driver} docs={docs} open={docsOpen} onOpenChange={setDocsOpen} onChanged={onDocsChanged} />
    </Card>
  );
}

export default function DriversTab({ drivers, vehicles, companies, routes, onChange }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const loadDocs = () => base44.entities.DriverDocument.list("-updated_date", 1000).then(setDocs).catch(() => {});
  useEffect(() => { loadDocs(); }, []);

  const assign = async (driver, vehicleId) => {
    if (!vehicleId) return;
    await base44.entities.Vehicle.update(vehicleId, {
      driver_email: driver.email,
      driver_name: driver.full_name || driver.email,
    });
    onChange();
  };

  const unassign = async (vehicleId) => {
    await base44.entities.Vehicle.update(vehicleId, { driver_email: null, driver_name: null });
    onChange();
  };

  const setStatus = async (vehicleId, status) => {
    await base44.entities.Vehicle.update(vehicleId, { status });
    onChange();
  };

  const setRoute = async (vehicleId, routeId) => {
    await base44.entities.Vehicle.update(vehicleId, { route_id: routeId || null });
    onChange();
  };

  const setPin = async (vehicleId, pin) => {
    try {
      await base44.functions.invoke("manageDriverPin", { vehicle_id: vehicleId, pin: pin || "" });
      toast({ title: "Driver PIN updated" });
      onChange();
    } catch (e) { toast({ title: "Could not save driver PIN", description: e?.response?.data?.error || e.message, variant: "destructive" }); throw e; }
  };

  const removeDriver = async (driver) => {
    try {
      const assignedVehicles = vehicles.filter((v) => driver.email && v.driver_email === driver.email);
      await Promise.all(
        assignedVehicles.map((v) =>
          base44.entities.Vehicle.update(v.id, { driver_email: null, driver_name: null })
        )
      );
      await base44.entities.Driver.delete(driver.id);
      toast({ title: "Driver removed" });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't remove driver", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddDriverDialog companies={companies} onAdded={onChange} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {drivers.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center sm:col-span-2">
            No drivers yet. Add one above, then assign buses here.
          </p>
        )}
        {drivers.map((d) => (
          <DriverCard
            key={d.id}
            driver={d}
            vehicles={vehicles}
            companies={companies}
            routes={routes}
            onAssign={assign}
            onUnassign={unassign}
            onSetStatus={setStatus}
            onSetRoute={setRoute}
            onSetPin={setPin}
            onSaved={onChange}
            onRemove={removeDriver}
            docs={docs.filter((doc) => doc.driver_id === d.id)}
            onDocsChanged={loadDocs}
          />
        ))}
      </div>
    </div>
  );
}
