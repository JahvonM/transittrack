import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/admin/kit";
import { LAYOUT_NAMES } from "@/lib/officeDisplay";
import { cn } from "@/lib/utils";

// Add or change an office display: what it shows and who it shows it for.
// The server checks all of this again (officeDisplay → save).

export const LAYOUT_HELP = {
  fleet: "Map of the buses, which are live, jobs under way and anything that needs attention.",
  cameras: "Map beside up to four bus back cameras. Cameras run only when you start them, 10 minutes at a time.",
  dispatch: "Today's jobs: past their time and not started, under way, next up, and exceptions.",
  maintenance: "Open faults, service due, failed inspections and buses out of service.",
};
const BLANK = {
  name: "", kind: "window", layout: "fleet", company_ids: [], vehicle_ids: [], rotate: false, rotate_layouts: ["fleet", "dispatch"], rotate_seconds: 60,
  theme: "dark", text_size: "large", density: "comfortable", show_driver_names: true, show_client_names: true, show_guest_names: false, camera_device_ids: [],
};
const toggle = (list, id, max = Infinity) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]);

function Field({ label, hint, children }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-body-sm font-semibold">{label}</legend>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}
function Check({ checked, onChange, children, disabled }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-body-sm", checked ? "border-primary bg-primary/5" : "border-border", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
function Choice({ checked, onChange, title, children, name }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", checked ? "border-primary bg-primary/5" : "border-border")}>
      <input type="radio" name={name} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={onChange} />
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold">{title}</span>
        <span className="block text-caption text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}
function Toggle({ checked, onChange, title, children }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold">{title}</span>
        {children && <span className="block text-caption text-muted-foreground">{children}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </label>
  );
}

export default function OfficeDisplayEditor({ open, display, options, onClose, onSave, busy }) {
  const [form, setForm] = useState(BLANK);
  const [someBuses, setSomeBuses] = useState(false);
  const [error, setError] = useState("");
  const creating = !display;
  useEffect(() => {
    if (!open) return;
    const start = display ? { ...BLANK, ...display } : { ...BLANK, company_ids: options.companies.length === 1 ? [options.companies[0].id] : [] };
    setForm(start);
    setSomeBuses((start.vehicle_ids || []).length > 0);
    setError("");
  }, [open, display?.id]);  
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const buses = useMemo(() => options.vehicles.filter((v) => form.company_ids.includes(v.company_id)), [options.vehicles, form.company_ids]);
  const cameras = useMemo(() => options.cameras.filter((k) => form.company_ids.includes(k.company_id) && (!someBuses || form.vehicle_ids.includes(k.vehicle_id))), [options.cameras, form.company_ids, form.vehicle_ids, someBuses]);
  const max = options.limits?.max_cameras || 4;

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Give the display a name, such as Office TV.");
    if (!form.company_ids.length) return setError("Choose at least one company to show.");
    if (someBuses && !form.vehicle_ids.length) return setError("Choose the buses to show, or show all buses.");
    if (form.rotate && form.layout !== "cameras" && form.rotate_layouts.length < 2) return setError("Choose at least two layouts to rotate between.");
    const payload = {
      ...form,
      vehicle_ids: someBuses ? form.vehicle_ids.filter((id) => buses.some((b) => b.id === id)) : [],
      camera_device_ids: form.layout === "cameras" ? form.camera_device_ids.filter((id) => cameras.some((k) => k.id === id)) : form.camera_device_ids,
      rotate: form.layout !== "cameras" && form.rotate,
    };
    const result = await onSave(payload);
    if (result?.error) setError(result.error);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{creating ? "Add an office display" : `Change ${display.name}`}</DialogTitle>
          <DialogDescription>A display shows a read-only view. It never uses your sign-in and gets only what you allow here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <Field label="Name">
            <Input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Office TV" aria-label="Display name" />
          </Field>
          {creating && (
            <Field label="Where it shows">
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice name="kind" checked={form.kind === "window"} onChange={() => set({ kind: "window" })} title="A monitor or TV on this computer">Opens in its own window from McSween Transport Desktop for Windows.</Choice>
                <Choice name="kind" checked={form.kind === "paired"} onChange={() => set({ kind: "paired" })} title="Another computer or a TV browser">The screen shows a code; you enter it here to pair it.</Choice>
              </div>
            </Field>
          )}
          <Field label="Layout">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.keys(LAYOUT_NAMES).map((l) => (
                <Choice key={l} name="layout" checked={form.layout === l} onChange={() => set({ layout: l })} title={LAYOUT_NAMES[l]}>{LAYOUT_HELP[l]}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Companies">
            {options.companies.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.companies.map((c) => <Check key={c.id} checked={form.company_ids.includes(c.id)} onChange={() => set({ company_ids: toggle(form.company_ids, c.id) })}>{c.name}</Check>)}
              </div>
            ) : <p className="text-body-sm text-muted-foreground">No companies yet.</p>}
          </Field>
          <Field label="Buses">
            <Segmented size="sm" label="Buses" value={someBuses ? "some" : "all"} onChange={(v) => setSomeBuses(v === "some")} options={[{ value: "all", label: "All their buses" }, { value: "some", label: "Only some buses" }]} />
            {someBuses && (
              buses.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {buses.map((b) => <Check key={b.id} checked={form.vehicle_ids.includes(b.id)} onChange={() => set({ vehicle_ids: toggle(form.vehicle_ids, b.id) })}>{b.name}{b.plate_number ? ` · ${b.plate_number}` : ""}</Check>)}
                </div>
              ) : <p className="text-body-sm text-muted-foreground">Choose a company first.</p>
            )}
          </Field>
          {form.layout === "cameras" && (
            <Field label={`Cameras (up to ${max})`} hint="Back cameras on driver tablets with the direct-viewing kiosk update. Choosing them here starts nothing: you start viewing from the display's card, 10 minutes at a time, muted and never recorded.">
              {cameras.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {cameras.map((k) => (
                    <Check key={k.id} checked={form.camera_device_ids.includes(k.id)} disabled={!form.camera_device_ids.includes(k.id) && form.camera_device_ids.length >= max} onChange={() => set({ camera_device_ids: toggle(form.camera_device_ids, k.id, max) })}>
                      {k.vehicle_name} · {k.label}
                    </Check>
                  ))}
                </div>
              ) : <p className="text-body-sm text-muted-foreground">No driver tablets with direct viewing for these buses yet.</p>}
            </Field>
          )}
          {form.layout !== "cameras" && (
            <Field label="Rotation">
              <Toggle checked={form.rotate} onChange={(v) => set({ rotate: v })} title="Switch between layouts">The screen shows each chosen layout in turn. Cameras never rotate in. On the screen, Space pauses.</Toggle>
              {form.rotate && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {["fleet", "dispatch", "maintenance"].map((l) => <Check key={l} checked={form.rotate_layouts.includes(l)} onChange={() => set({ rotate_layouts: toggle(form.rotate_layouts, l) })}>{LAYOUT_NAMES[l]}</Check>)}
                  </div>
                  <Segmented size="sm" label="Time on each layout" value={String(form.rotate_seconds)} onChange={(v) => set({ rotate_seconds: Number(v) })}
                    options={[{ value: "30", label: "30 seconds" }, { value: "60", label: "1 minute" }, { value: "120", label: "2 minutes" }, { value: "300", label: "5 minutes" }]} />
                </>
              )}
            </Field>
          )}
          <Field label="Appearance">
            <div className="flex flex-wrap gap-3">
              <Segmented size="sm" label="Theme" value={form.theme} onChange={(v) => set({ theme: v })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
              <Segmented size="sm" label="Text size" value={form.text_size} onChange={(v) => set({ text_size: v })} options={[{ value: "normal", label: "Normal text" }, { value: "large", label: "Large" }, { value: "xlarge", label: "Extra large" }]} />
              <Segmented size="sm" label="Density" value={form.density} onChange={(v) => set({ density: v })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
            </div>
          </Field>
          <Field label="Names on screen" hint="Phone numbers, home addresses, signatures, cards and codes are never sent to a display.">
            <div className="space-y-2">
              <Toggle checked={form.show_driver_names} onChange={(v) => set({ show_driver_names: v })} title="Driver names" />
              <Toggle checked={form.show_client_names} onChange={(v) => set({ show_client_names: v })} title="Client names">Hotels and companies a job is for.</Toggle>
              <Toggle checked={form.show_guest_names} onChange={(v) => set({ show_guest_names: v })} title="Guest and passenger names">Off unless the screen is somewhere only staff can see it.</Toggle>
            </div>
          </Field>
          {error && <p role="alert" className="text-body-sm font-semibold text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : creating ? "Add display" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
