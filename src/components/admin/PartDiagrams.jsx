import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Panel, StatusChip } from "@/components/admin/kit";
import { ArrowLeft, Copy, ExternalLink, ImagePlus, Link2, Loader2, MapPin, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { GUIDE_DRAWINGS, pictureSource } from "@/lib/partDrawings";
import { ReplacementsList, StockChip } from "@/components/admin/partsCatalogueKit";
import { fitsGuide, inStockReplacements, nextPinNumber, partMatches, partsForGuide, pinPlace, stockLevel } from "@/lib/partsCatalogue";

// On a Bus library page: the parts that fit the model, and pictures of its
// areas (front brakes, filters…) with numbered pins on the parts. Pictures are
// the team's own photos, or until there is one a guide drawing built into the
// app (our own, generic); the maker's diagram is a link, never a copy.

const SELECT = "h-10 w-full rounded-lg border border-input bg-background px-3 text-body-sm";
const uploadPhoto = async (file) => (await base44.integrations.Core.UploadPublicFile({ file })).file_url;
const pinCount = (n) => `${n} ${n === 1 ? "pin" : "pins"}`;
const EMPTY_PICTURE = { title: "", system: "", catalogue_link: "", image_url: "", drawing_key: "", notes: "" };
const pictureForm = (d) => ({ title: d.title || "", system: d.system || "", catalogue_link: d.catalogue_link || "", image_url: d.image_url || "", drawing_key: d.drawing_key || "", notes: d.notes || "", hadPins: (d.pins || []).length > 0 });
const pictureData = (f) => ({ title: f.title.trim(), system: f.system.trim(), catalogue_link: f.catalogue_link.trim(), image_url: f.image_url, drawing_key: f.drawing_key || null, notes: f.notes.trim() });
const numbers = (part) => [part.oem_number, part.aftermarket_number].filter(Boolean).join(" · ");

export function ModelPartsPanel({ guide, parts, interchanges, onChange }) {
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const mine = partsForGuide(guide.id, parts);
  const low = mine.filter((p) => stockLevel(p) !== "ok").length;

  const toggle = async (part) => {
    const ids = Array.isArray(part.guide_ids) ? part.guide_ids : [];
    setBusy(part.id);
    try {
      await base44.entities.Part.update(part.id, { guide_ids: ids.includes(guide.id) ? ids.filter((id) => id !== guide.id) : [...ids, guide.id] });
      await onChange();
    } catch (e) {
      toast({ title: "Couldn't change the part", description: e?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel
      title="Parts for this model"
      icon={Package}
      description={mine.length ? `${mine.length} parts${low ? `, ${low} low or out of stock` : ""}.` : "Link the parts in your stock that fit this model."}
      actions={<Button size="sm" variant="outline" onClick={() => setLinking(!linking)}><Link2 className="mr-1.5 h-4 w-4" />{linking ? "Done" : "Link parts"}</Button>}
    >
      {linking ? (
        <div className="space-y-2">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a part" aria-label="Find a part to link" className="pl-9" />
          </div>
          {parts.length === 0 && <p className="text-body-sm text-muted-foreground">No parts in stock yet: add them in Maintenance → Parts.</p>}
          <ul className="divide-y divide-border">
            {parts.filter((p) => partMatches(p, query, interchanges)).slice(0, 100).map((part) => (
              <li key={part.id}>
                <label htmlFor={`link-${part.id}`} className="flex min-h-[44px] items-center gap-3">
                  <input id={`link-${part.id}`} type="checkbox" className="h-4 w-4" checked={fitsGuide(part, guide.id)} disabled={busy === part.id} onChange={() => toggle(part)} />
                  <span className="min-w-0 flex-1"><span className="font-semibold">{part.part_name}</span> <span className="text-body-sm text-muted-foreground">{numbers(part)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {mine.map((part) => {
            const spare = stockLevel(part) === "ok" ? [] : inStockReplacements(part, parts, interchanges);
            return (
              <li key={part.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-[180px] flex-1">
                  <span className="block font-semibold">{part.part_name}</span>
                  <span className="block text-body-sm text-muted-foreground">{[numbers(part), part.bin_location].filter(Boolean).join(" · ") || "No number"}</span>
                  {spare.map(({ part: other }) => (
                    <span key={other.id} className="block text-body-sm">Replacement on the shelf: <strong>{other.part_name}</strong> ({other.quantity_in_stock})</span>
                  ))}
                </span>
                <StockChip part={part} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function DiagramsPanel({ guide, diagrams, parts, interchanges, buses = [], canDelete, onChange }) {
  const { toast } = useToast();
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const open = diagrams.find((d) => d.id === openId);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const made = await base44.entities.PartDiagram.create({ guide_id: guide.id, ...pictureData(form), pins: [], sort_order: (diagrams.length + 1) * 10 });
      setForm(null);
      await onChange();
      setOpenId(made.id);
    } catch (err) {
      toast({ title: "Couldn't add the picture", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (open) {
    return <DiagramView diagram={open} guide={guide} parts={parts} interchanges={interchanges} buses={buses} canDelete={canDelete} onBack={() => setOpenId(null)} onChange={onChange} />;
  }

  return (
    <Panel
      title="Part pictures"
      icon={MapPin}
      description="Each area of the bus with numbered pins on the parts. Tap a pin to see the part, its stock and what can replace it. A guide drawing shows until you add a photo of your own bus."
      actions={!form && <Button size="sm" variant="outline" onClick={() => setForm({ ...EMPTY_PICTURE })}><Plus className="mr-1.5 h-4 w-4" />Add a picture</Button>}
    >
      {form && <PictureForm form={form} setForm={setForm} saving={saving} onSubmit={create} onCancel={() => setForm(null)} />}
      {!form && diagrams.length === 0 && (
        <EmptyState icon={MapPin} title="No pictures yet">
          Photograph an area of the bus (front brakes, the filters under the bonnet), then put numbered pins on its parts.
        </EmptyState>
      )}
      {diagrams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {diagrams.map((d) => {
            const source = pictureSource(d);
            return (
              <button key={d.id} type="button" onClick={() => setOpenId(d.id)} className="overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-accent/40">
                {source ? <img src={source.url} alt="" className={`h-36 w-full ${source.isDrawing ? "bg-white object-contain" : "object-cover"}`} /> : <span className="grid h-36 place-items-center bg-secondary text-body-sm text-muted-foreground">No photo yet</span>}
                <span className="block p-3">
                  <span className="block font-semibold">{d.title}</span>
                  <span className="block text-body-sm text-muted-foreground">{[d.system, pinCount((d.pins || []).length), source?.isDrawing && "guide drawing"].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function PictureForm({ form, setForm, saving, onSubmit, onCancel, submitLabel = "Add picture" }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try { setForm({ ...form, image_url: await uploadPhoto(file) }); }
    catch (err) { toast({ title: "Couldn't upload the photo", description: err?.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };
  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-3 rounded-xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="pic-title">What it shows</Label><Input id="pic-title" value={form.title} onChange={set("title")} placeholder="Front brakes" required /></div>
        <div className="space-y-1"><Label htmlFor="pic-system">Area</Label><Input id="pic-system" value={form.system} onChange={set("system")} placeholder="Brakes" /></div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="pic-link">Maker's diagram link (optional)</Label>
          <Input id="pic-link" type="url" value={form.catalogue_link} onChange={set("catalogue_link")} placeholder="https://partsouq.com/… (the page for this area of your bus)" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pic-drawing">Guide drawing (shown until there's a photo)</Label>
          <select id="pic-drawing" className={SELECT} value={form.drawing_key || ""} onChange={set("drawing_key")}>
            <option value="">None</option>
            {GUIDE_DRAWINGS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="pic-notes">Notes (optional)</Label>
          <Textarea id="pic-notes" rows={3} value={form.notes || ""} onChange={set("notes")} placeholder="How to find this area's diagram, what to check here" />
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-body-sm font-medium">Photo</span>
        {form.image_url ? (
          <div className="flex items-center gap-3">
            <img src={form.image_url} alt="" className="h-20 w-28 rounded-lg object-cover" />
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, image_url: "" })}>Remove</Button>
          </div>
        ) : (
          <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-body-sm text-muted-foreground hover:border-primary hover:text-foreground">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Take or choose a photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label="Photo of this area" />
          </label>
        )}
        {form.hadPins && <p className="text-caption text-muted-foreground">Pins stay where they are: after changing the picture, check them with Edit pins.</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || uploading || !form.title.trim()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{submitLabel}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function DiagramView({ diagram, guide, parts, interchanges, buses = [], canDelete, onBack, onChange }) {
  const { toast } = useToast();
  const [pins, setPins] = useState(diagram.pins || []);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState(null);
  const imageRef = useRef(null);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const modelParts = partsForGuide(guide.id, parts);
  const otherParts = parts.filter((p) => !fitsGuide(p, guide.id));
  const shown = editing ? pins : diagram.pins || [];
  const chosen = shown.find((p) => p.n === selected);
  const chosenPart = chosen?.part_id ? partById.get(chosen.part_id) : null;
  const source = pictureSource(diagram);
  const withVin = buses.filter((b) => String(b.vin || "").trim());

  // The maker's catalogue finds a bus's own diagrams by its chassis number.
  const copyVin = async (bus) => {
    try {
      await navigator.clipboard.writeText(String(bus.vin).trim());
      toast({ title: "Chassis number copied", description: `${bus.name || "Bus"}: paste it into the maker's diagram search.` });
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser didn't allow copying. Find the chassis number in Vehicles.", variant: "destructive" });
    }
  };

  const addPin = (e) => {
    if (!editing || !imageRef.current) return;
    const place = pinPlace(e.clientX, e.clientY, imageRef.current.getBoundingClientRect());
    const n = nextPinNumber(pins);
    setPins([...pins, { n, ...place, part_id: "", label: "" }]);
    setSelected(n);
  };
  const changePin = (n, patch) => setPins(pins.map((p) => (p.n === n ? { ...p, ...patch } : p)));
  const savePins = async () => {
    setSaving(true);
    try {
      await base44.entities.PartDiagram.update(diagram.id, { pins });
      setEditing(false);
      await onChange();
    } catch (e) {
      toast({ title: "Couldn't save the pins", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const saveDetails = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.entities.PartDiagram.update(diagram.id, pictureData(details));
      setDetails(null);
      await onChange();
    } catch (err) {
      toast({ title: "Couldn't save the picture", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: "Delete this picture?", description: `${diagram.title} and its pins. The parts stay in stock.` }))) return;
    try { await base44.entities.PartDiagram.delete(diagram.id); onBack(); await onChange(); }
    catch (e) { toast({ title: "Couldn't delete the picture", description: e?.message, variant: "destructive" }); }
  };

  return (
    <Panel title={diagram.title} icon={MapPin} description={[diagram.system, pinCount(shown.length)].filter(Boolean).join(" · ")}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />All pictures</Button>
          {diagram.catalogue_link && (
            <Button size="sm" variant="outline" asChild>
              <a href={diagram.catalogue_link} target="_blank" rel="noopener noreferrer">Maker's diagram<ExternalLink className="ml-1 h-4 w-4" aria-hidden="true" /></a>
            </Button>
          )}
        </>
      }
    >
      {details ? (
        <PictureForm form={details} setForm={setDetails} saving={saving} onSubmit={saveDetails} onCancel={() => setDetails(null)} submitLabel="Save" />
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={savePins} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save pins</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPins(diagram.pins || []); setEditing(false); setSelected(null); }}>Cancel</Button>
              <span className="self-center text-body-sm text-muted-foreground">Tap the picture where a part is to add a pin.</span>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => { setPins(diagram.pins || []); setEditing(true); }} disabled={!source}><MapPin className="mr-1 h-4 w-4" />Edit pins</Button>
              <Button size="sm" variant="ghost" onClick={() => setDetails(pictureForm(diagram))}><Pencil className="mr-1 h-4 w-4" />Edit picture</Button>
              {canDelete && <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
            </>
          )}
        </div>
      )}

      {(diagram.notes || withVin.length > 0) && !details && (
        <div className="mb-3 space-y-2 rounded-xl bg-secondary p-3">
          {diagram.notes && <p className="whitespace-pre-line text-body-sm">{diagram.notes}</p>}
          {withVin.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {withVin.map((bus) => (
                <Button key={bus.id} size="sm" variant="outline" onClick={() => copyVin(bus)}>
                  <Copy className="mr-1 h-4 w-4" />Copy {bus.name || "bus"}'s chassis number
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {source?.isDrawing && <p className="mb-2 text-caption text-muted-foreground">Guide drawing: generic, not your exact bus. Add a photo of your own bus with Edit picture.</p>}
      {source ? (
        <div className={`relative mx-auto max-w-3xl select-none overflow-hidden rounded-xl border border-border ${source.isDrawing ? "bg-white" : ""}`}>
          {/* Pins are placed with a pointer; every pin is also a button, and listed below. */}
          <img ref={imageRef} src={source.url} alt={source.isDrawing ? `${diagram.title}: guide drawing` : diagram.title} onClick={addPin} className={editing ? "w-full cursor-crosshair" : "w-full"} draggable={false} />
          {shown.map((pin) => {
            const part = pin.part_id ? partById.get(pin.part_id) : null;
            const name = part?.part_name || pin.label || "No part yet";
            return (
              <button
                key={pin.n}
                type="button"
                onClick={(e) => { e.stopPropagation(); setSelected(pin.n); }}
                aria-label={`Pin ${pin.n}: ${name}`}
                aria-pressed={selected === pin.n}
                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-background text-caption font-bold shadow ${selected === pin.n ? "bg-foreground text-background ring-2 ring-primary" : part && stockLevel(part) === "out" ? "bg-danger text-white" : "bg-primary text-primary-foreground"}`}
              >
                {pin.n}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={ImagePlus} title="No photo yet">Use Edit picture to add a photo of this area, then add pins.</EmptyState>
      )}

      {chosen && (
        <div className="mt-4 rounded-xl border border-border p-3">
          <p className="text-caption font-semibold text-muted-foreground">Pin {chosen.n}</p>
          {editing ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pin-part">Part</Label>
                <select id="pin-part" className={SELECT} value={chosen.part_id || ""} onChange={(e) => changePin(chosen.n, { part_id: e.target.value })}>
                  <option value="">No part (label only)</option>
                  {modelParts.length > 0 && <optgroup label="Fits this model">{modelParts.map((p) => <option key={p.id} value={p.id}>{p.part_name}{p.oem_number ? ` (${p.oem_number})` : ""}</option>)}</optgroup>}
                  {otherParts.length > 0 && <optgroup label="Other parts">{otherParts.map((p) => <option key={p.id} value={p.id}>{p.part_name}{p.oem_number ? ` (${p.oem_number})` : ""}</option>)}</optgroup>}
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="pin-label">Label (optional)</Label><Input id="pin-label" value={chosen.label || ""} maxLength={80} onChange={(e) => changePin(chosen.n, { label: e.target.value })} placeholder="Caliper bolt" /></div>
              <div>
                <Button size="sm" variant="ghost" onClick={() => { setPins(pins.filter((p) => p.n !== chosen.n)); setSelected(null); }}><Trash2 className="mr-1 h-4 w-4" />Remove pin</Button>
              </div>
            </div>
          ) : chosenPart ? (
            <div className="mt-1 space-y-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold">{chosenPart.part_name}{chosen.label ? <span className="font-normal text-muted-foreground"> · {chosen.label}</span> : null}</p>
                  <p className="text-body-sm text-muted-foreground">{[numbers(chosenPart), chosenPart.supplier, chosenPart.bin_location, chosenPart.unit_price ? `$${Number(chosenPart.unit_price).toFixed(2)}` : ""].filter(Boolean).join(" · ")}</p>
                </div>
                <StockChip part={chosenPart} />
              </div>
              <p className="text-caption font-semibold text-muted-foreground">What can replace it</p>
              <ReplacementsList part={chosenPart} parts={parts} interchanges={interchanges} canDelete={canDelete} onChange={onChange} />
            </div>
          ) : (
            <p className="mt-1">{chosen.label || "No part linked to this pin yet."}</p>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <ol className="mt-4 divide-y divide-border">
          {[...shown].sort((a, b) => a.n - b.n).map((pin) => {
            const part = pin.part_id ? partById.get(pin.part_id) : null;
            return (
              <li key={pin.n}>
                <button type="button" onClick={() => setSelected(pin.n)} className={`flex min-h-[44px] w-full items-center gap-3 px-1 text-left ${selected === pin.n ? "bg-accent/50" : ""}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-caption font-bold">{pin.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{part?.part_name || pin.label || "No part yet"}</span>
                    {part && <span className="block truncate text-body-sm text-muted-foreground">{[numbers(part), part.bin_location].filter(Boolean).join(" · ")}</span>}
                  </span>
                  {part ? <StockChip part={part} /> : <StatusChip tone="neutral">Label</StatusChip>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
