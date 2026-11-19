import React, { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/admin/kit";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import { FACT_STATUS, guideTitle } from "@/lib/busLibrary";
import { GUIDE_DRAWINGS, pictureSource } from "@/lib/partDrawings";
import { fitsGuide, nextPinNumber, pinPlace, stockLevel } from "@/lib/partsCatalogue";
import { optimizeBus360Photo } from "@/lib/vehicle360Optimize";
import { TORQUE_SYSTEMS, findVehicle, nmText, torqueBySystem } from "@/lib/workshop";
import { EditSheet, FIELD, Field, Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { TorqueBadges, TorqueFigure } from "@/components/workshop/TorqueScreen";
import { Camera, Check, ExternalLink, ImagePlus, Loader2, MapPin, Pencil, Plus } from "lucide-react";

// A model's bolt maps: its part pictures (the team's photos, or a guide
// drawing until there is one) with numbered pins. A pin points at a torque
// value, a part, or both; tap one for a big card with the bolt's torque and
// the part's stock.

const numbers = (part) => [part?.oem_number, part?.aftermarket_number].filter(Boolean).join(" · ");
const pinSummary = (pins = []) => {
  const torque = pins.filter((p) => p.torque_id).length;
  return [pluralize(pins.length, "pin"), torque ? `${torque} with torque` : ""].filter(Boolean).join(" · ");
};

function useModelPage() {
  const { kind, id } = useParams();
  const data = useWorkshop();
  const vehicle = findVehicle(data.vehicles, kind, id);
  const guide = vehicle?.guide || null;
  return { ...data, kind, id, vehicle, guide, base: `/workshop/${kind}/${id}` };
}

function PictureSheet({ editing, guide, onClose, onDeleted }) {
  const { toast } = useToast();
  const { isAdmin, put, drop, diagrams } = useWorkshop();
  const [form, setForm] = useState(() => ({
    title: editing?.title || "", system: editing?.system || "", drawing_key: editing?.drawing_key || "", image_url: editing?.image_url || "", notes: editing?.notes || "",
    catalogue_link: editing?.catalogue_link || "",
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: await optimizeBus360Photo(file) });
      setForm((f) => ({ ...f, image_url: file_url }));
    } catch (err) {
      toast({ title: "Couldn't upload the photo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const data = { title: form.title.trim(), system: form.system.trim(), drawing_key: form.drawing_key || null, image_url: form.image_url, notes: form.notes.trim(), catalogue_link: form.catalogue_link.trim() };
      const order = diagrams.filter((d) => d.guide_id === guide.id).reduce((max, d) => Math.max(max, Number(d.sort_order) || 0), 0) + 10;
      const saved = editing?.id
        ? await base44.entities.PartDiagram.update(editing.id, data)
        : await base44.entities.PartDiagram.create({ ...data, guide_id: guide.id, pins: [], sort_order: order });
      put("diagrams", saved);
      onClose(saved);
    } catch (err) {
      toast({ title: "Couldn't save the picture", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.PartDiagram.delete(editing.id);
      drop("diagrams", editing.id);
      onDeleted();
    } catch (err) {
      toast({ title: "Couldn't delete the picture", description: err?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={() => onClose(null)} saving={saving || uploading} onSave={save}
      problem={!form.title.trim() ? "Say what the picture shows." : form.catalogue_link.trim() && !/^https:\/\/\S+$/i.test(form.catalogue_link.trim()) ? "The maker's diagram link must start with https://" : ""}
      title={editing?.id ? "Edit picture" : "Add a picture"} description={guideTitle(guide)}
      onDelete={editing?.id && isAdmin ? remove : undefined} deleteLabel="Delete picture"
    >
      <Field id="pic-title" label="What it shows">
        <Input id="pic-title" className="h-12 text-body md:text-body" value={form.title} onChange={set("title")} maxLength={120} placeholder="Front brakes, left side" />
      </Field>
      <Field id="pic-system" label="Area (optional)">
        <Input id="pic-system" className="h-12 text-body md:text-body" value={form.system} onChange={set("system")} maxLength={60} placeholder="Brakes" />
      </Field>
      <div className="space-y-1.5">
        <span className="block text-body-sm font-semibold">Photo</span>
        {form.image_url ? (
          <div className="flex items-center gap-3">
            <img src={form.image_url} alt="" className="h-24 w-32 rounded-xl object-cover" />
            <Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => setForm({ ...form, image_url: "" })}>Remove photo</Button>
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-body text-muted-foreground hover:border-primary hover:text-foreground">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
            {uploading ? "Uploading…" : "Take or choose a photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label="Photo of this area" />
          </label>
        )}
        {editing?.id && (editing.pins || []).length > 0 && <p className="text-caption text-muted-foreground">Pins stay where they are: after changing the photo, check them.</p>}
      </div>
      <Field id="pic-drawing" label="Guide drawing" hint="Shown until there's a photo. Generic drawings, not your exact vehicle.">
        <select id="pic-drawing" className={FIELD} value={form.drawing_key} onChange={set("drawing_key")}>
          <option value="">None</option>
          {GUIDE_DRAWINGS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </Field>
      <Field id="pic-link" label="Maker's diagram link (optional)" hint="The address of this area's diagram on Partsouq, to open it from here.">
        <Input id="pic-link" type="url" className="h-12 text-body md:text-body" value={form.catalogue_link} onChange={set("catalogue_link")} placeholder="https://partsouq.com/…" />
      </Field>
      <Field id="pic-notes" label="Notes (optional)">
        <Textarea id="pic-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={2000} placeholder="What to check here" />
      </Field>
    </EditSheet>
  );
}

export function BoltMaps() {
  const { vehicle, guide, diagrams, base } = useModelPage();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  if (!vehicle) return <Navigate to="/workshop" replace />;
  if (!guide) return <Navigate to={base} replace />;
  const mine = diagrams.filter((d) => d.guide_id === guide.id).sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

  return (
    <>
      <ScreenBar back={base} backLabel={vehicle.name} title="Bolt maps" subtitle={`${guideTitle(guide)} · ${pluralize(mine.length, "picture")}`}>
        <Button className="h-12 rounded-xl text-body" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a picture</Button>
      </ScreenBar>
      {mine.length === 0 ? (
        <Notice>
          <p className="font-semibold">No pictures yet.</p>
          <p className="text-muted-foreground">Photograph an area (front brakes, the engine bay), then put numbered pins on its bolts and parts.</p>
        </Notice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((d) => {
            const source = pictureSource(d);
            return (
              <button key={d.id} type="button" onClick={() => navigate(`${base}/maps/${d.id}`)} className="overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:bg-accent/40">
                {source
                  ? <img src={source.url} alt="" className={`h-44 w-full ${source.isDrawing ? "bg-white object-contain p-2" : "object-cover"}`} />
                  : <span className="grid h-44 place-items-center bg-secondary text-body text-muted-foreground">No photo yet</span>}
                <span className="block p-4">
                  <span className="block truncate text-title-sm font-semibold">{d.title}</span>
                  <span className="block text-body-sm text-muted-foreground">{[d.system, pinSummary(d.pins), (!source || source.isDrawing) && "needs a photo"].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {adding && <PictureSheet guide={guide} onClose={(made) => { setAdding(false); if (made?.id) navigate(`${base}/maps/${made.id}`); }} onDeleted={() => setAdding(false)} />}
    </>
  );
}

function PinSheet({ pin, isNew, guide, onClose, onSave, onRemove, saving }) {
  const { specs, parts } = useWorkshop();
  const [form, setForm] = useState({ torque_id: pin.torque_id || "", part_id: pin.part_id || "", label: pin.label || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const torqueGroups = torqueBySystem(specs.filter((s) => s.guide_id === guide.id));
  const modelParts = parts.filter((p) => fitsGuide(p, guide.id));
  const otherParts = parts.filter((p) => !fitsGuide(p, guide.id));
  const empty = !form.torque_id && !form.part_id && !form.label.trim();
  return (
    <EditSheet
      open onClose={onClose} saving={saving} onSave={() => onSave({ ...pin, ...form, label: form.label.trim() })}
      problem={empty ? "Choose a torque value or a part, or give the pin a label." : ""}
      title={isNew ? `New pin ${pin.n}` : `Pin ${pin.n}`} description={guideTitle(guide)}
      onDelete={isNew ? undefined : onRemove} deleteLabel="Remove pin"
    >
      <Field id="pin-torque" label="Torque value" hint={torqueGroups.size ? "" : "This model has no torque values yet: add them on its Torque screen."}>
        <select id="pin-torque" className={FIELD} value={form.torque_id} onChange={set("torque_id")}>
          <option value="">None</option>
          {[...torqueGroups].map(([system, list]) => (
            <optgroup key={system} label={TORQUE_SYSTEMS.find((s) => s.id === system)?.label}>
              {list.map((s) => <option key={s.id} value={s.id}>{s.item}{nmText(s.nm) ? ` — ${nmText(s.nm)} N·m` : ""}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field id="pin-part" label="Part">
        <select id="pin-part" className={FIELD} value={form.part_id} onChange={set("part_id")}>
          <option value="">None</option>
          {modelParts.length > 0 && <optgroup label="Fits this model">{modelParts.map((p) => <option key={p.id} value={p.id}>{p.part_name}{p.oem_number ? ` (${p.oem_number})` : ""}</option>)}</optgroup>}
          {otherParts.length > 0 && <optgroup label="Other parts">{otherParts.map((p) => <option key={p.id} value={p.id}>{p.part_name}{p.oem_number ? ` (${p.oem_number})` : ""}</option>)}</optgroup>}
        </select>
      </Field>
      <Field id="pin-label" label="Label (optional)">
        <Input id="pin-label" className="h-12 text-body md:text-body" value={form.label} onChange={set("label")} maxLength={80} placeholder="Upper bolt" />
      </Field>
    </EditSheet>
  );
}

function PinCard({ pin, torque, part, onClose }) {
  const status = FACT_STATUS[torque?.status] ? torque.status : "unchecked";
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5 safe-area-bottom">
        <SheetTitle className="pr-8 text-title-sm">Pin {pin.n}{pin.label ? ` · ${pin.label}` : ""}</SheetTitle>
        <SheetDescription className="sr-only">The bolt's torque and the part at this pin.</SheetDescription>
        <div className="mt-4 space-y-4">
          {torque && (
            <section aria-label="Torque" className="rounded-2xl border border-border p-4">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-title-sm font-semibold">{torque.item}</p>
                  {torque.size && <p className="text-body-sm text-muted-foreground">{torque.size}</p>}
                  {torque.stages && <p className="text-body font-medium">{torque.stages}</p>}
                  {torque.sequence && <p className="text-body-sm">{torque.sequence}</p>}
                  <p className="flex flex-wrap gap-1.5 pt-1"><StatusChip tone={FACT_STATUS[status].tone}>{FACT_STATUS[status].label}</StatusChip><TorqueBadges spec={torque} /></p>
                </div>
                <TorqueFigure spec={torque} />
              </div>
            </section>
          )}
          {part && (
            <section aria-label="Part" className="flex flex-wrap items-start gap-3 rounded-2xl border border-border p-4">
              <div className="min-w-0 flex-1">
                <p className="text-title-sm font-semibold">{part.part_name}</p>
                <p className="text-body-sm text-muted-foreground">{[numbers(part), part.bin_location].filter(Boolean).join(" · ") || "No number"}</p>
              </div>
              <StockChip part={part} />
            </section>
          )}
          {!torque && !part && <p className="text-body">{pin.label ? "Nothing else is linked to this pin." : "Nothing linked to this pin yet. Use Edit pins."}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BoltMap() {
  const { diagramId } = useParams();
  const { vehicle, guide, diagrams, specs, parts, put, base } = useModelPage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const imageRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(null); // { pin, isNew }
  const [details, setDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const diagram = diagrams.find((d) => d.id === diagramId);
  const specById = useMemo(() => new Map(specs.map((s) => [s.id, s])), [specs]);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  if (!vehicle) return <Navigate to="/workshop" replace />;
  if (!guide || !diagram || diagram.guide_id !== guide.id) return <Navigate to={guide ? `${base}/maps` : base} replace />;
  const pins = diagram.pins || [];
  const source = pictureSource(diagram);

  const savePins = async (next) => {
    setSaving(true);
    try {
      put("diagrams", await base44.entities.PartDiagram.update(diagram.id, { pins: next }));
      setOpen(null);
    } catch (e) {
      toast({ title: "Couldn't save the pin", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const place = (e) => {
    if (!editing || !imageRef.current) return;
    const at = pinPlace(e.clientX, e.clientY, imageRef.current.getBoundingClientRect());
    setOpen({ pin: { n: nextPinNumber(pins), ...at, part_id: "", torque_id: "", label: "" }, isNew: true });
  };
  // A photo of this area on the vehicle itself, straight from the camera:
  // it replaces the guide drawing, and the pins go on the real thing.
  const takePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: await optimizeBus360Photo(file) });
      put("diagrams", await base44.entities.PartDiagram.update(diagram.id, { image_url: file_url }));
      toast({ title: "Photo added", description: pins.length ? "The pins were placed on the drawing: check them with Edit pins." : "Now put pins on its bolts and parts with Edit pins." });
    } catch (err) {
      toast({ title: "Couldn't add the photo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };
  const savePin = (pin) => savePins(open.isNew ? [...pins, pin] : pins.map((p) => (p.n === pin.n ? pin : p)));

  const pinTone = (pin) => {
    const part = pin.part_id ? partById.get(pin.part_id) : null;
    if (part && stockLevel(part) === "out") return "bg-danger text-white";
    return pin.torque_id ? "bg-primary text-primary-foreground" : "bg-foreground text-background";
  };
  const pinName = (pin) => specById.get(pin.torque_id)?.item || partById.get(pin.part_id)?.part_name || pin.label || "Nothing linked yet";

  return (
    <>
      <ScreenBar back={`${base}/maps`} backLabel="Bolt maps" title={diagram.title} subtitle={[guideTitle(guide), diagram.system, pinSummary(pins)].filter(Boolean).join(" · ")}>
        {editing ? (
          <Button className="h-12 rounded-xl text-body" onClick={() => setEditing(false)}><Check className="mr-1.5 h-5 w-5" aria-hidden="true" />Done</Button>
        ) : (
          <>
            {diagram.catalogue_link && (
              <Button asChild variant="secondary" className="h-12 rounded-xl text-body">
                <a href={diagram.catalogue_link} target="_blank" rel="noopener noreferrer">Maker's diagram<ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" /></a>
              </Button>
            )}
            <Button variant="secondary" className="h-12 rounded-xl text-body" onClick={() => setDetails(true)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Picture</Button>
            <Button className="h-12 rounded-xl text-body" onClick={() => setEditing(true)} disabled={!source}><MapPin className="mr-1.5 h-5 w-5" aria-hidden="true" />Edit pins</Button>
          </>
        )}
      </ScreenBar>

      {editing && <Notice tone="warning"><p className="font-semibold">Tap the picture where a bolt or part is to add a pin. Tap a pin to change it.</p></Notice>}
      {!editing && (!source || source.isDrawing) && (
        <Notice
          tone="warning"
          action={
            <label className={`inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-body font-semibold text-primary-foreground ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
              {uploading ? "Adding the photo…" : "Take a photo"}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={takePhoto} disabled={uploading} aria-label={`Take a photo of ${diagram.title} on ${vehicle.name}`} />
            </label>
          }
        >
          <p className="font-semibold">{source ? "This is a generic guide drawing, not your vehicle." : "No picture yet."}</p>
          <p className="text-muted-foreground">Photograph this area on {vehicle.name} and the pins go on the real thing.</p>
        </Notice>
      )}
      {diagram.notes && !editing && <p className="mb-3 whitespace-pre-line rounded-2xl bg-secondary p-4 text-body-sm">{diagram.notes}</p>}

      {source ? (
        <div className={`relative mx-auto max-w-4xl select-none overflow-hidden rounded-2xl border border-border ${source.isDrawing ? "bg-white" : ""}`}>
          {/* Pins are placed by tapping the picture; every pin is also a button and is listed below. */}
          <img ref={imageRef} src={source.url} alt={source.isDrawing ? `${diagram.title}: guide drawing` : diagram.title} onClick={place} className={editing ? "w-full cursor-crosshair" : "w-full"} draggable={false} />
          {pins.map((pin) => (
            <button
              key={pin.n} type="button"
              onClick={(e) => { e.stopPropagation(); setOpen({ pin, isNew: false }); }}
              aria-label={`Pin ${pin.n}: ${pinName(pin)}`}
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              className={`absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-background text-body font-bold shadow-lg ${pinTone(pin)}`}
            >
              {pin.n}
            </button>
          ))}
        </div>
      ) : null}

      {pins.length > 0 && (
        <ol className="mx-auto mt-4 max-w-4xl divide-y divide-border rounded-2xl border border-border bg-card">
          {[...pins].sort((a, b) => a.n - b.n).map((pin) => {
            const torque = specById.get(pin.torque_id);
            const part = partById.get(pin.part_id);
            return (
              <li key={pin.n}>
                <button type="button" onClick={() => setOpen({ pin, isNew: false })} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent/30">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-body-sm font-bold ${pinTone(pin)}`}>{pin.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{pinName(pin)}</span>
                    <span className="block truncate text-body-sm text-muted-foreground">{[torque && part ? part.part_name : "", pin.label && (torque || part) ? pin.label : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  {torque && nmText(torque.nm) && <span className="text-title-sm font-bold tabular-nums">{nmText(torque.nm)} <span className="text-body-sm font-semibold">N·m</span></span>}
                  {!torque && part && <StockChip part={part} />}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {open && editing && (
        <PinSheet
          key={`${open.pin.n}-${open.isNew}`} pin={open.pin} isNew={open.isNew} guide={guide} saving={saving}
          onClose={() => setOpen(null)} onSave={savePin} onRemove={() => savePins(pins.filter((p) => p.n !== open.pin.n))}
        />
      )}
      {open && !editing && <PinCard pin={open.pin} torque={specById.get(open.pin.torque_id)} part={partById.get(open.pin.part_id)} onClose={() => setOpen(null)} />}
      {details && <PictureSheet editing={diagram} guide={guide} onClose={() => setDetails(false)} onDeleted={() => navigate(`${base}/maps`, { replace: true })} />}
    </>
  );
}
