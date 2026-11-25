import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { guideTitle } from "@/lib/busLibrary";
import { groupLabel } from "@/lib/makerCatalogue";
import { GUIDE_DRAWINGS, pictureSource } from "@/lib/partDrawings";
import { fitsGuide } from "@/lib/partsCatalogue";
import { optimizeBus360Photo } from "@/lib/vehicle360Optimize";
import { TORQUE_SYSTEMS, groupRefs, nmText, torqueBySystem } from "@/lib/workshop";
import { EditSheet, FIELD, Field, Notice, pluralize, useWorkshop } from "@/components/workshop/kit";
import { ImageIcon, ImagePlus, Loader2, Plus } from "lucide-react";

// Pictures of a model's areas (the team's photos, or a guide drawing until
// there is one) with numbered pins: the Photos section of a vehicle's page,
// and the sheets for a picture and for one pin.

// A photo from the tablet's camera, made smaller on the tablet first.
export const uploadPhoto = async (file) => (await base44.integrations.Core.UploadPublicFile({ file: await optimizeBus360Photo(file) })).file_url;

export const pinSummary = (pins = []) => {
  const torque = pins.filter((p) => p.torque_id).length;
  return [pluralize(pins.length, "pin"), torque ? `${torque} with torque` : ""].filter(Boolean).join(" · ");
};

const nextOrder = (diagrams, guideId) => diagrams.filter((d) => d.guide_id === guideId).reduce((max, d) => Math.max(max, Number(d.sort_order) || 0), 0) + 10;
const isHttps = (link) => /^https:\/\/\S+$/i.test(link);

// group: the maker's diagram a new picture is a photo of.
export function PictureSheet({ editing, guide, group = null, onClose, onDeleted }) {
  const { toast } = useToast();
  const { isAdmin, put, drop, diagrams } = useWorkshop();
  const [form, setForm] = useState(() => ({
    title: editing?.title || (group ? groupLabel(group) : ""),
    system: editing?.system || group?.category || "",
    drawing_key: editing?.drawing_key || "",
    image_url: editing?.image_url || "",
    notes: editing?.notes || "",
    catalogue_link: editing?.catalogue_link || group?.link || "",
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const link = form.catalogue_link.trim();

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast({ title: "Couldn't upload the photo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const data = { title: form.title.trim(), system: form.system.trim(), drawing_key: form.drawing_key || null, image_url: form.image_url, notes: form.notes.trim(), catalogue_link: link };
      const saved = editing?.id
        ? await base44.entities.PartDiagram.update(editing.id, data)
        : await base44.entities.PartDiagram.create({ ...data, guide_id: guide.id, catalogue_group_id: group?.id || "", pins: [], sort_order: nextOrder(diagrams, guide.id) });
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
      problem={!form.title.trim() ? "Say what the picture shows." : link && !isHttps(link) ? "The maker's diagram link must start with https://" : ""}
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
            <img src={form.image_url} alt="" className="h-24 w-32 rounded-lg border border-border object-cover" />
            <Button type="button" variant="ghost" className="h-12 rounded-lg" onClick={() => setForm({ ...form, image_url: "" })}>Remove photo</Button>
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-body text-muted-foreground hover:border-primary hover:text-foreground">
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
      <Field id="pic-link" label="Maker's diagram link (optional)" hint="The address of this area's diagram (Partsouq, JP-CarParts…). A JP-CarParts address shows inside the Workshop; others open in a new tab.">
        <Input id="pic-link" type="url" className="h-12 text-body md:text-body" value={form.catalogue_link} onChange={set("catalogue_link")} placeholder="https://partsouq.com/…" />
      </Field>
      <Field id="pic-notes" label="Notes (optional)">
        <Textarea id="pic-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={2000} placeholder="What to check here" />
      </Field>
    </EditSheet>
  );
}

// One pin: the row of the maker's list it marks (on a photo of a maker's
// diagram), the torque value, the part in stock, a label.
export function PinSheet({ pin, isNew, guide, group, onClose, onSave, onRemove, saving }) {
  const { specs, parts } = useWorkshop();
  const [form, setForm] = useState({ ref: pin.ref || "", torque_id: pin.torque_id || "", part_id: pin.part_id || "", label: pin.label || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const refs = groupRefs(group);
  const torqueGroups = torqueBySystem(specs.filter((s) => s.guide_id === guide.id));
  const modelParts = parts.filter((p) => fitsGuide(p, guide.id));
  const otherParts = parts.filter((p) => !fitsGuide(p, guide.id));
  const empty = !form.ref && !form.torque_id && !form.part_id && !form.label.trim();
  return (
    <EditSheet
      open onClose={onClose} saving={saving} onSave={() => onSave({ ...pin, ...form, label: form.label.trim() })}
      problem={empty ? (refs.length ? "Choose the part's number on the maker's list, a torque value or a part." : "Choose a torque value or a part, or give the pin a label.") : ""}
      title={isNew ? "New pin" : `Pin ${pin.ref || pin.n}`} description={guideTitle(guide)}
      onDelete={isNew ? undefined : onRemove} deleteLabel="Remove pin"
    >
      {refs.length > 0 && (
        <Field id="pin-ref" label="Number on the maker's list" hint="The pin shows this number, and tapping it finds the row.">
          <select id="pin-ref" className={FIELD} value={form.ref} onChange={set("ref")}>
            <option value="">None</option>
            {refs.map(({ ref, part }) => <option key={ref} value={ref}>{ref} — {part.name || part.number}</option>)}
          </select>
        </Field>
      )}
      <Field id="pin-torque" label="Torque value" hint={torqueGroups.size ? "" : "This model has no torque values yet: add them under Torque values."}>
        <select id="pin-torque" className={FIELD} value={form.torque_id} onChange={set("torque_id")}>
          <option value="">None</option>
          {[...torqueGroups].map(([system, list]) => (
            <optgroup key={system} label={TORQUE_SYSTEMS.find((s) => s.id === system)?.label}>
              {list.map((s) => <option key={s.id} value={s.id}>{s.item}{nmText(s.nm) ? ` — ${nmText(s.nm)} N·m` : ""}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field id="pin-part" label="Part in stock">
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

export function Thumb({ source, code }) {
  if (source) return <img src={source.url} alt="" loading="lazy" className={`h-36 w-full border-b border-border ${source.isDrawing ? "bg-white object-contain p-2" : "object-cover"}`} />;
  return (
    <span className="grid h-36 w-full place-items-center border-b border-border bg-muted text-muted-foreground">
      <span className="text-center">
        <ImageIcon className="mx-auto h-7 w-7" aria-hidden="true" />
        {code && <span className="mt-1 block font-mono text-title-sm font-semibold text-foreground">{code}</span>}
      </span>
    </span>
  );
}

// The Photos & bolt maps section of a vehicle's page.
export default function PhotosSection({ guide, base }) {
  const { diagrams, groups } = useWorkshop();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const mine = diagrams.filter((d) => d.guide_id === guide.id).sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const groupOf = (d) => (d.catalogue_group_id ? groups.find((g) => g.id === d.catalogue_group_id) : null);

  return (
    <section aria-labelledby="photos-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="photos-title" className="text-title-sm font-semibold">Photos & bolt maps</h3>
          <p className="text-body-sm text-muted-foreground">{pluralize(mine.length, "picture")} · numbered pins on the bolts and parts</p>
        </div>
        <Button className="h-12 rounded-lg text-body" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a picture</Button>
      </div>
      {mine.length === 0 ? (
        <Notice>
          <p className="font-semibold">No pictures yet.</p>
          <p className="text-muted-foreground">Photograph an area (front brakes, the engine bay), then put numbered pins on its bolts and parts.</p>
        </Notice>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mine.map((d) => {
            const source = pictureSource(d);
            const group = groupOf(d);
            return (
              <li key={d.id}>
                <button type="button" onClick={() => navigate(`${base}/maps/${d.id}`)} className="block h-full w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-colors hover:border-primary">
                  <Thumb source={source} />
                  <span className="block p-3">
                    <span className="block truncate text-body font-semibold text-primary">{d.title}</span>
                    <span className="block text-caption text-muted-foreground">{[group && `Maker's ${group.code}`, pinSummary(d.pins), (!source || source.isDrawing) && "needs a photo"].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <PictureSheet guide={guide} onClose={(made) => { setAdding(false); if (made?.id) navigate(`${base}/maps/${made.id}`); }} onDeleted={() => setAdding(false)} />}
    </section>
  );
}
