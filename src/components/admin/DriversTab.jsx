import AvatarPicker from "@/components/AvatarPicker";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { telLink, whatsappLink } from "@/lib/driverPhone";
import DriverDocumentsDialog, { DocChips } from "@/components/admin/DriverDocuments";
import DriverRequestsPanel from "@/components/admin/DriverRequestsPanel";
import { Bus, Camera, Car, Loader2, Mail, Pencil, Phone, Plus, Search, Smartphone, Trash2, User as UserIcon, X } from "lucide-react";
import { EmptyState, PageActions, StatusChip } from "@/components/admin/kit";

const STATUSES = [
  { value: "offline", label: "Offline" },
  { value: "idle", label: "Idle" },
  { value: "on_trip", label: "On trip" },
  { value: "speeding", label: "Speeding" },
  { value: "emergency", label: "Emergency" },
];

// Drivers are entered directly here (a plain Driver record) rather than
// invited as a base44 login. The bus tablet authenticates by paired device +
// PIN (see driverSession). The driver phone app is the one place a driver
// signs in: with Google, using the email on this record, and only while
// "Can use the phone app" is on (see driverPhone).
function DriverFormFields({ form, setForm, companies }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Full name</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John D." />
      </div>
      <div className="space-y-1.5">
        <Label>Email (Gmail)</Label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="driver@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 473-..." />
      </div>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <Label htmlFor="driver-phone-app">Can use the phone app</Label>
          <p className="text-body-sm text-muted-foreground">
            {form.email.trim()
              ? "The driver signs in with Google using the email above. Turn off to remove access."
              : "Add the driver's Gmail address first."}
          </p>
        </div>
        <Switch id="driver-phone-app" checked={!!form.phone_app_access && !!form.email.trim()} disabled={!form.email.trim()}
          onCheckedChange={(on) => setForm({ ...form, phone_app_access: on })} />
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
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company_id: "", phone_app_access: false });
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
        phone_app_access: !!form.phone_app_access && !!form.email.trim(),
      });
      toast({ title: "Driver added" });
      setForm({ full_name: "", email: "", phone: "", company_id: "", phone_app_access: false });
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

function EditDriverDialog({ driver, companies, vehicles = [], open, onOpenChange, onSaved }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company_id: "", phone_app_access: false });
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
        phone_app_access: !!driver.phone_app_access,
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
      const email = form.email.trim();
      await base44.entities.Driver.update(driver.id, {
        full_name: form.full_name.trim(),
        email,
        phone: form.phone.trim(),
        photo_url: photoUrl,
        company_id: form.company_id || null,
        company_name: company?.name || "",
        phone_app_access: !!form.phone_app_access && !!email,
      });
      // Buses are matched to drivers by email, so a new email keeps them.
      const oldEmail = (driver.email || "").trim();
      if (oldEmail && email && oldEmail.toLowerCase() !== email.toLowerCase()) {
        await Promise.all(vehicles.filter((v) => v.driver_email === oldEmail)
          .map((v) => base44.entities.Vehicle.update(v.id, { driver_email: email })));
      }
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
          <AvatarPicker onChange={setPhotoUrl} disabled={saving || uploading} />
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
    <li className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary" aria-hidden="true">
          {v.type === "taxi" ? <Car className="h-4 w-4" /> : <Bus className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{v.name}</div>
          <div className="truncate text-caption text-muted-foreground">{[v.plate_number, v.company_name].filter(Boolean).join(" · ")}</div>
        </div>
        <StatusChip status={v.status || "offline"} />
        <Button variant="ghost" size="icon" className="h-9 w-9 text-danger hover:text-danger" onClick={() => onUnassign(v.id)} aria-label={`Unassign ${v.name}`} title="Unassign">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.3fr_0.9fr]">
        <Select value={v.status || "offline"} onValueChange={(st) => onSetStatus(v.id, st)}>
          <SelectTrigger className="h-9" aria-label={`Status of ${v.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((st) => (
              <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={v.route_id || "none"} onValueChange={(r) => onSetRoute(v.id, r === "none" ? null : r)}>
          <SelectTrigger className="h-9" aria-label={`Route of ${v.name}`}>
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
          className="h-9"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          type="password"
          autoComplete="new-password"
          placeholder="New PIN"
          aria-label={`New PIN for ${v.name}`}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          disabled={pinSaving}
        />
        <Button size="sm" disabled={pin.length !== 4 || pinSaving} onClick={async () => {
          setPinSaving(true); setPinMessage("");
          try { await onSetPin(v.id, pin); setPin(""); setPinMessage("PIN saved"); }
          catch (e) { setPinMessage(e?.response?.data?.error || e.message || "Could not save PIN"); }
          finally { setPinSaving(false); }
        }}>{pinSaving ? "Saving…" : "Save PIN"}</Button>
        {pinMessage && <p role="status" className="w-full text-caption">{pinMessage}</p>}
      </div>
    </li>
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

  const initials = (driver.full_name || driver.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <li className="flex flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-4 p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary font-display text-title-sm font-semibold">
          {driver.photo_url ? <img src={driver.photo_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">{initials}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-sm font-bold">{driver.full_name || "Unnamed driver"}</h2>
          {driver.email && (
            <p className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{driver.email}</span>
            </p>
          )}
          {driver.phone && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
              <a href={telLink(driver.phone) || undefined} className="flex items-center gap-1.5 hover:text-foreground hover:underline">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {driver.phone}
              </a>
              {whatsappLink(driver.phone) && (
                <a href={whatsappLink(driver.phone)} target="_blank" rel="noreferrer" className="font-semibold hover:text-foreground hover:underline">WhatsApp</a>
              )}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip tone="neutral" dot={false}>{companyName || "No company"}</StatusChip>
            <StatusChip tone={assigned.length ? "success" : "neutral"} dot={false}>
              <Bus className="h-3.5 w-3.5" aria-hidden="true" /> {assigned.length} {assigned.length === 1 ? "bus" : "buses"}
            </StatusChip>
            {driver.phone_app_access && driver.email && (
              <StatusChip tone="info" dot={false}>
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Phone app
              </StatusChip>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label={`Edit ${driver.full_name || "driver"}`} title="Edit driver">
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-danger hover:text-danger" aria-label={`Remove ${driver.full_name || "driver"}`} title="Remove driver">
                <Trash2 className="h-4 w-4" />
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

      <div className="space-y-2 border-t border-border px-4 py-3">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Assigned buses</h3>
        {assigned.length === 0 && <p className="text-body-sm text-muted-foreground">No buses assigned yet.</p>}
        {assigned.length > 0 && (
          <ul className="space-y-2">
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
          </ul>
        )}
        {pool.length > 0 && driver.email && (
          <Select onValueChange={(vid) => onAssign(driver, vid)}>
            <SelectTrigger className="h-10" aria-label={`Assign a bus to ${driver.full_name || "this driver"}`}>
              <SelectValue placeholder="Assign a bus to this driver" />
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
          <p className="text-body-sm text-warning">Add an email for this driver to assign a bus (vehicles are matched by driver email).</p>
        )}
      </div>
      <div className="mt-auto border-t border-border px-4 py-3">
        <DocChips docs={docs} onOpen={() => setDocsOpen(true)} />
      </div>

      <EditDriverDialog driver={driver} companies={companies} vehicles={vehicles} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
      <DriverDocumentsDialog driver={driver} docs={docs} open={docsOpen} onOpenChange={setDocsOpen} onChanged={onDocsChanged} />
    </li>
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
      const response = await base44.functions.invoke("manageDriverPin", { vehicle_id: vehicleId, pin: pin || "" });
      if (response.data?.ok !== true) throw new Error(response.data?.error || "PIN save was not confirmed");
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

  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const q = query.trim().toLowerCase();
  const shown = drivers
    .filter((d) => company === "all" || (company === "none" ? !d.company_id : d.company_id === company))
    .filter((d) => !q || [d.full_name, d.email, d.phone].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));

  return (
    <div>
      <PageActions>
        <AddDriverDialog companies={companies} onAdded={onChange} />
      </PageActions>
      <div className="mb-4"><DriverRequestsPanel /></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search drivers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or phone"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="h-10 w-48 bg-card" aria-label="Filter by company"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            <SelectItem value="none">No company</SelectItem>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="ml-auto text-body-sm text-muted-foreground">{drivers.length} driver{drivers.length === 1 ? "" : "s"}</p>
      </div>
      {drivers.length === 0 ? (
        <EmptyState icon={UserIcon} title="No drivers yet">Add a driver, then assign their bus here.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="No drivers match">Try another search or company.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((d) => (
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
        </ul>
      )}
    </div>
  );
}
