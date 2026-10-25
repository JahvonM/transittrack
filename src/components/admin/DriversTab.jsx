import AvatarPicker from "@/components/AvatarPicker";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { driverKey, driverOwnsBus, normalizeDriverUsername, validDriverUsername } from "@/lib/driverAccount";
import DriverDocumentsDialog, { DocChips } from "@/components/admin/DriverDocuments";
import DriverAccountActions, { IssuedCredentials, USERNAME_RULE } from "@/components/admin/DriverAccountActions";
import DriverRequestsPanel from "@/components/admin/DriverRequestsPanel";
import { Bus, Camera, Car, Loader2, Pencil, Phone, Plus, Search, Smartphone, Trash2, User as UserIcon, X } from "lucide-react";
import { EmptyState, PageActions, StatusChip } from "@/components/admin/kit";

const STATUSES = [
  { value: "offline", label: "Offline" },
  { value: "idle", label: "Idle" },
  { value: "on_trip", label: "On trip" },
  { value: "speeding", label: "Speeding" },
  { value: "emergency", label: "Emergency" },
];

// Drivers are entered directly here (a plain Driver record) rather than
// invited as a login. The bus tablet authenticates by paired device + PIN
// (see driverSession). The driver phone app signs in with a username and
// password made here (driverAccounts); drivers don't use email or Google.
function DriverFormFields({ form, setForm, companies, companyLocked = false }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="driver-full-name">Full name</Label>
        <Input id="driver-full-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John D." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="driver-phone">Phone number</Label>
        <Input id="driver-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 473-..." />
      </div>
      <div className="space-y-1.5">
        <Label>Company</Label>
        <Select value={form.company_id || "none"} disabled={companyLocked} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v, vehicle_id: "" })}>
          <SelectTrigger aria-label="Company"><SelectValue placeholder="No company" /></SelectTrigger>
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

// One step: the driver, their company and bus, and their phone app username.
// Saving creates the driver, assigns the bus and shows the username and a
// temporary password to give them.
const NEW_DRIVER = { full_name: "", phone: "", company_id: "", vehicle_id: "", username: "" };
function AddDriverDialog({ companies, vehicles = [], onAdded }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(NEW_DRIVER);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState("");
  const buses = vehicles.filter((v) => form.company_id && v.company_id === form.company_id);
  const username = normalizeDriverUsername(form.username);
  const usernameOk = !username || validDriverUsername(username);

  const reset = () => { setForm(NEW_DRIVER); setCreated(null); setIssued(null); setError(""); };
  const changeOpen = (next) => { if (!next && saving) return; setOpen(next); if (!next) reset(); };

  const save = async () => {
    if (!form.full_name.trim() || !usernameOk || saving) return;
    if (username && !form.company_id) return setError("Choose the driver's company to create their phone login.");
    setSaving(true);
    setError("");
    try {
      let driver = created;
      if (!driver) {
        const company = companies.find((c) => c.id === form.company_id);
        driver = await base44.entities.Driver.create({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          company_id: form.company_id || null,
          company_name: company?.name || "",
          phone_app_access: false,
        });
        if (!driver?.id) throw new Error("The driver was not saved.");
        setCreated({ ...driver, bus: false });
        if (form.vehicle_id) {
          try {
            await base44.entities.Vehicle.update(form.vehicle_id, { driver_id: driver.id, driver_email: null, driver_name: driver.full_name || "" });
            setCreated({ ...driver, bus: true });
          } catch {
            toast({ title: "Driver saved, but the bus wasn't assigned", description: "Assign it from their card.", variant: "destructive" });
          }
        }
        onAdded();
      }
      if (!username) {
        toast({ title: "Driver added", description: "Set up their phone login any time with Set up phone login." });
        changeOpen(false);
        return;
      }
      const { data } = await base44.functions.invoke("driverAccounts", { action: "provision", driver_id: driver.id, username });
      if (!data?.ok || !data.temporary_password) throw new Error("The phone login was not confirmed.");
      setIssued({ username: data.username, password: data.temporary_password });
      onAdded();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Couldn't add the driver");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Add driver
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add driver</DialogTitle>
        </DialogHeader>
        {issued ? (
          <IssuedCredentials issued={issued} onDone={() => changeOpen(false)} />
        ) : (
          <div className="space-y-4">
            {created
              ? <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm"><strong>{created.full_name}</strong> is saved{created.bus ? " with their bus" : ""}. Only the phone login is left.</p>
              : <DriverFormFields form={form} setForm={setForm} companies={companies} />}
            {!created && (
              <div className="space-y-1.5">
                <Label>Bus</Label>
                <Select value={form.vehicle_id || "none"} disabled={!form.company_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v === "none" ? "" : v })}>
                  <SelectTrigger aria-label="Bus"><SelectValue placeholder={form.company_id ? "No bus yet" : "Choose a company first"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No bus yet</SelectItem>
                    {buses.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}{v.plate_number ? ` · ${v.plate_number}` : ""}{v.driver_name ? ` (now ${v.driver_name})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              <Label htmlFor="new-driver-username">Phone app username</Label>
              <Input id="new-driver-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="john.d" autoCapitalize="none" autoComplete="off" spellCheck={false} />
              <p className="text-xs text-muted-foreground">
                {usernameOk ? `The driver signs in with this and a temporary password you'll see next. No email needed. ${USERNAME_RULE}` : `Username: ${USERNAME_RULE}`}
              </p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={save} disabled={saving || !form.full_name.trim() || !usernameOk || (!!created && !username)}>
              {saving ? "Saving…" : created ? "Create phone login" : username ? "Add driver and create login" : "Add driver"}
            </Button>
            {created && <Button variant="ghost" className="w-full" onClick={() => changeOpen(false)} disabled={saving}>Set up the phone login later</Button>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDriverDialog({ driver, companies, open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ full_name: "", phone: "", company_id: "" });
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && driver) {
      setForm({
        full_name: driver.full_name || "",
        phone: driver.phone || "",
        company_id: driver.company_id || "",
      });
      setPhotoUrl(driver.photo_url || "");
    }
  }, [open, driver]);

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setPhotoUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const company = companies.find((c) => c.id === form.company_id);
      // Drivers have no email: they sign in with a username.
      await base44.entities.Driver.update(driver.id, {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        photo_url: photoUrl,
        company_id: form.company_id || null,
        company_name: company?.name || "",
      });
      // A phone-account driver given a company (e.g. after their old one was
      // deleted): their sign-in follows the driver record.
      if (driver.auth_user_id && form.company_id && form.company_id !== (driver.company_id || "")) {
        await base44.functions.invoke("driverAccounts", { action: "sync", driver_id: driver.id });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't save the driver", description: e?.response?.data?.error || e.message, variant: "destructive" });
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
          <DriverFormFields form={form} setForm={setForm} companies={companies} companyLocked={!!driver.auth_user_id && !!driver.company_id} />
          {driver.auth_user_id && driver.company_id && <p className="text-xs text-muted-foreground">A driver with a phone account can't be moved to another company from here. Remove their phone account first (Phone account → Remove phone account).</p>}
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
  const assigned = vehicles.filter((v) => driverOwnsBus(v, driver));
  const companyName = companies.find((c) => c.id === driver.company_id)?.name;
  const pool = vehicles.filter((v) => !!driver.company_id && v.company_id === driver.company_id && !driverOwnsBus(v, driver));

  const initials = (driver.full_name || driver.username || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <li className="flex flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-4 p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary font-display text-title-sm font-semibold">
          {driver.photo_url ? <img src={driver.photo_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">{initials}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-sm font-bold">{driver.full_name || "Unnamed driver"}</h2>
          <p className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {driver.username
              ? <span className="truncate">Username <span className="font-mono text-foreground">{driver.username}</span></span>
              : <span className="truncate">No phone login yet</span>}
          </p>
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
            {driver.phone_app_access && driver.auth_user_id && (
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
                <AlertDialogTitle>Remove {driver.full_name || driver.username || "this driver"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes their driver record{driver.auth_user_id ? " and their phone app sign-in" : ""} and unassigns any buses currently assigned to them. Their past shifts and reports are kept. This can't be undone.
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

      <div className="border-t border-border px-4 py-3">
        <DriverAccountActions driver={driver} onChanged={onSaved} />
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
        {pool.length > 0 && driver.company_id && (
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
      </div>
      <div className="mt-auto border-t border-border px-4 py-3">
        <DocChips docs={docs} onOpen={() => setDocsOpen(true)} />
      </div>

      <EditDriverDialog driver={driver} companies={companies} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
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
      driver_id: driver.id,
      // How shifts, messages and backup GPS find this driver (driverKey).
      driver_email: driverKey(driver) || null,
      driver_name: driver.full_name || driver.username || "",
    });
    onChange();
  };

  const unassign = async (vehicleId) => {
    await base44.entities.Vehicle.update(vehicleId, { driver_id: null, driver_email: null, driver_name: null });
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
      // Their phone sign-in goes first, so a failure leaves everything as it was.
      if (driver.auth_user_id) {
        const { data } = await base44.functions.invoke("driverAccounts", { action: "unlink", driver_id: driver.id });
        if (!data?.ok) throw new Error("The phone account could not be removed.");
      }
      const assignedVehicles = vehicles.filter((v) => driverOwnsBus(v, driver));
      await Promise.all(
        assignedVehicles.map((v) =>
          base44.entities.Vehicle.update(v.id, { driver_id: null, driver_email: null, driver_name: null })
        )
      );
      await base44.entities.Driver.delete(driver.id);
      toast({ title: "Driver removed" });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't remove driver", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
  };

  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const q = query.trim().toLowerCase();
  const shown = drivers
    .filter((d) => company === "all" || (company === "none" ? !d.company_id : d.company_id === company))
    .filter((d) => !q || [d.full_name, d.username, d.phone].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.full_name || a.username || "").localeCompare(String(b.full_name || b.username || "")));

  return (
    <div>
      <PageActions>
        <AddDriverDialog companies={companies} vehicles={vehicles} onAdded={onChange} />
      </PageActions>
      <div className="mb-4"><DriverRequestsPanel /></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search drivers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, username or phone"
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