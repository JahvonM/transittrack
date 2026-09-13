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
import { Bus, Camera, Car, Loader2, Mail, Pencil, Phone, Plus, Trash2, User as UserIcon, X } from "lucide-react";

const STATUSES = [
  { value: "offline", label: "Offline" },
  { value: "idle", label: "Idle" },
  { value: "on_trip", label: "On trip" },
  { value: "speeding", label: "Speeding" },
  { value: "emergency", label: "Emergency" },
];

function AddDriverDialog({ onAdded }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(email.trim(), "driver");
      toast({ title: "Driver invited", description: `${email.trim()} can now sign in as a driver.` });
      setEmail("");
      setOpen(false);
      onAdded();
    } catch (e) {
      toast({ title: "Couldn't invite driver", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Add driver
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Invite a driver</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@example.com"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            They'll get an invite to sign in with the Driver role. Once they show up here, you can add their photo, name and assign buses.
          </p>
          <Button className="w-full" onClick={invite} disabled={inviting || !email.trim()}>
            {inviting ? "Inviting…" : "Send invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDriverDialog({ driver, open, onOpenChange, onSaved }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && driver) {
      setFullName(driver.full_name || "");
      setPhone(driver.phone || "");
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
      await base44.entities.User.update(driver.id, {
        full_name: fullName,
        phone,
        photo_url: photoUrl,
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
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Driver name" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 473-..." />
          </div>
          <Button className="w-full" onClick={save} disabled={saving || uploading}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignedVehicleRow({ vehicle: v, routes, onUnassign, onSetStatus, onSetRoute, onSetPin }) {
  const [pin, setPin] = useState(v.driver_pin || "");

  useEffect(() => {
    setPin(v.driver_pin || "");
  }, [v.driver_pin]);

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
          placeholder="PIN"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onBlur={() => { if (pin !== (v.driver_pin || "")) onSetPin(v.id, pin); }}
        />
      </div>
    </div>
  );
}

function DriverCard({ driver, vehicles, companies, routes, onAssign, onUnassign, onSetStatus, onSetRoute, onSetPin, onSaved, onRemove }) {
  const [editOpen, setEditOpen] = useState(false);
  const assigned = vehicles.filter((v) => v.driver_email === driver.email);
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
                  This deletes their account and unassigns any buses currently assigned to them. This can't be undone.
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
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3 shrink-0" /> {driver.email}
            </div>
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
          {pool.length > 0 && (
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
        </div>
      </CardContent>

      <EditDriverDialog driver={driver} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
    </Card>
  );
}

export default function DriversTab({ users, vehicles, companies, routes, onChange }) {
  const { toast } = useToast();
  const drivers = users.filter((u) => u.role === "driver");

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

  const removeDriver = async (driver) => {
    try {
      const assignedVehicles = vehicles.filter((v) => v.driver_email === driver.email);
      await Promise.all(
        assignedVehicles.map((v) =>
          base44.entities.Vehicle.update(v.id, { driver_email: null, driver_name: null })
        )
      );
      await base44.entities.User.delete(driver.id);
      toast({ title: "Driver removed" });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't remove driver", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddDriverDialog onAdded={onChange} />
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
          />
        ))}
      </div>
    </div>
  );
}
