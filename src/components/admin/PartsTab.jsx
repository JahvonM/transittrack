import React, { useEffect, useState } from "react";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented, StatusChip } from "@/components/admin/kit";
import { ModelChecklist, ReplacementsList, StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { inStockReplacements, partMatches, replacementsFor, stockLevel } from "@/lib/partsCatalogue";
import { Link } from "react-router-dom";
import { Camera, ChevronDown, ChevronUp, ImagePlus, Loader2, MonitorSmartphone, Pencil, Plus, Trash2, Search, Minus, X } from "lucide-react";

const empty = {
  part_name: "", oem_number: "", aftermarket_number: "",
  vehicle_compatibility: "", category: "", quantity_in_stock: 0, unit_price: 0, supplier: "", photo_url: "",
  min_stock: "", bin_location: "", guide_ids: [],
};

async function uploadPhoto(file) {
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
  return file_url;
}

// What to send for the catalogue fields: a warning level or nothing, and
// only models that still have a library page.
function catalogueFields(form, guides) {
  const known = new Set(guides.map((g) => g.id));
  return {
    min_stock: form.min_stock === "" || form.min_stock == null ? null : Number(form.min_stock),
    bin_location: (form.bin_location || "").trim(),
    ...(guides.length ? { guide_ids: (form.guide_ids || []).filter((id) => known.has(id)) } : {}),
  };
}

// Square part photo; tap to add or replace it.
function PartPhoto({ part, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file);
      await base44.entities.Part.update(part.id, { photo_url: url });
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't upload photo", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="relative w-14 h-14 rounded-xl overflow-hidden border bg-muted/50 grid place-items-center shrink-0 cursor-pointer hover:border-primary transition-colors" title={part.photo_url ? "Change photo" : "Add photo"}>
      {part.photo_url ? <img src={part.photo_url} alt={part.part_name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-muted-foreground" />}
      {busy && <span className="absolute inset-0 bg-background/70 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin" /></span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label={`Photo of ${part.part_name}`} />
    </label>
  );
}

// Admin → Parts and the mechanics' Parts tab: the stock, and for each part
// the bus models it fits, when to warn of low stock, where it's kept, and the
// numbers that can replace it (with which of those are on the shelf).
export default function PartsTab({ parts = [], onChange, canDelete = true }) {
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [guides, setGuides] = useState([]);
  const [interchanges, setInterchanges] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);

  // The library's model pages and the replacement numbers. Not every
  // screen that shows parts can read them (a company manager can't), and
  // the tab works without them.
  const loadCatalogue = async () => {
    const [g, i] = await Promise.all([
      base44.entities.VehicleGuide.list("make", 200).catch(() => []),
      base44.entities.PartInterchange.list("-created_date", 5000).catch(() => []),
    ]);
    setGuides(g || []);
    setInterchanges(i || []);
  };
  useEffect(() => { loadCatalogue(); }, []);
  const refresh = async () => { await Promise.all([onChange?.(), loadCatalogue()]); };

  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickNewPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      set("photo_url", await uploadPhoto(file));
    } catch (err) {
      toast({ title: "Couldn't upload photo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!form.part_name.trim()) return;
    setSaving(true);
    try {
      const { min_stock: _m, bin_location: _b, guide_ids: _g, ...base } = form;
      await base44.entities.Part.create({ ...base, part_name: form.part_name.trim(), ...catalogueFields(form, guides) });
      setForm(empty);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't add part", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!(await confirmAction({ title: "Delete this part?", description: "It will be removed from your parts inventory." }))) return;
    try {
      await base44.entities.Part.delete(id);
      onChange();
    } catch (e) {
      // Delete is admin/company-only — a mechanic clicking this needs to see
      // why nothing happened, not a silent no-op.
      toast({ title: "Couldn't delete part", description: e.message, variant: "destructive" });
    }
  };

  const adjustStock = async (part, delta) => {
    const next = Math.max(0, (part.quantity_in_stock || 0) + delta);
    try {
      await base44.entities.Part.update(part.id, { quantity_in_stock: next });
      onChange();
    } catch (e) {
      toast({ title: "Couldn't update stock", description: e.message, variant: "destructive" });
    }
  };

  const saveEdit = async (draft) => {
    try {
      const { id, part_name, oem_number, aftermarket_number, vehicle_compatibility, category, supplier, unit_price } = draft;
      await base44.entities.Part.update(id, {
        part_name: part_name.trim(), oem_number, aftermarket_number, vehicle_compatibility, category, supplier,
        unit_price: Number(unit_price) || 0, ...catalogueFields(draft, guides),
      });
      setEditing(null);
      onChange();
    } catch (e) {
      toast({ title: "Couldn't save part", description: e.message, variant: "destructive" });
    }
  };

  const guideName = (id) => {
    const g = guides.find((x) => x.id === id);
    return g ? [g.make, g.model].filter(Boolean).join(" ") : null;
  };
  const lowCount = parts.filter((p) => stockLevel(p) !== "ok").length;
  const filtered = parts.filter((p) => (show === "low" ? stockLevel(p) !== "ok" : true) && partMatches(p, query, interchanges));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Phones and tablets: adding starts here, not under the whole list. */}
        <Button className="h-11 w-full sm:w-auto lg:hidden" onClick={() => setQuickOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />Add a part
        </Button>
        <Link to="/parts" className="inline-flex items-center gap-1 text-body-sm underline underline-offset-2">
          <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />Parts kiosk: a page just for adding parts
        </Link>
      </div>
      <QuickAddPart open={quickOpen} onOpenChange={setQuickOpen} parts={parts} guides={guides} onSaved={onChange} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parts or any part number…" aria-label="Search parts" className="pl-9" />
          </div>
          <Segmented
            label="Which parts"
            size="sm"
            value={show}
            onChange={setShow}
            options={[{ value: "all", label: "All", count: parts.length }, { value: "low", label: "Low or out of stock", count: lowCount }]}
          />
          {filtered.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{parts.length ? "No parts match." : "No parts yet."}</CardContent></Card>
          )}
          {filtered.map((p) => {
            const reps = replacementsFor(p, interchanges);
            const spare = stockLevel(p) === "ok" ? [] : inStockReplacements(p, parts, interchanges);
            const models = (p.guide_ids || []).map(guideName).filter(Boolean);
            const isOpen = openId === p.id;
            return (
              <Card key={p.id}>
                <CardContent className="py-3">
                  {/* On a phone the stock buttons go under the name, so the name fits. */}
                  <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                    <PartPhoto part={p} onChanged={onChange} />
                    <div className="min-w-0 flex-1 basis-[calc(100%-4.25rem)] sm:basis-auto">
                      <div className="font-medium truncate">{p.part_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[p.oem_number, p.vehicle_compatibility, p.supplier].filter(Boolean).join(" · ") || p.category || "—"}
                      </div>
                      {(models.length > 0 || p.bin_location) && (
                        <div className="text-xs text-muted-foreground truncate">{[models.join(", "), p.bin_location && `Kept: ${p.bin_location}`].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <div className="flex w-full items-center gap-1 sm:w-auto sm:shrink-0">
                      <StockChip part={p} className="mr-auto sm:mr-2" />
                      <Button variant="outline" size="icon" className="h-10 w-10 sm:h-7 sm:w-7" onClick={() => adjustStock(p, -1)} aria-label={`One fewer ${p.part_name}`}><Minus className="w-3 h-3" /></Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 sm:h-7 sm:w-7" onClick={() => adjustStock(p, 1)} aria-label={`One more ${p.part_name}`}><Plus className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => remove(p.id)} aria-label={`Delete ${p.part_name}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {spare.length > 0 && (
                    <p className="mt-2 text-body-sm">Replacement on the shelf: {spare.map(({ part }) => `${part.part_name} (${part.quantity_in_stock})`).join(", ")}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(isOpen ? null : p.id)} aria-expanded={isOpen}>
                      {isOpen ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                      Replacements{reps.length ? ` (${reps.length})` : ""}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...empty, ...p, min_stock: p.min_stock ?? "", bin_location: p.bin_location || "", guide_ids: p.guide_ids || [] })}>
                      <Pencil className="mr-1 h-4 w-4" />Details
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="mt-2 border-t border-border pt-2">
                      <ReplacementsList part={p} parts={parts} interchanges={interchanges} canDelete={canDelete} onChange={refresh} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="hidden lg:block">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Add a part</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              {form.photo_url ? (
                <div className="relative w-full h-36 rounded-xl overflow-hidden border">
                  <img src={form.photo_url} alt="Part" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => set("photo_url", "")} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 grid place-items-center" aria-label="Remove photo">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed cursor-pointer text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {uploading ? "Uploading…" : "Take or choose a photo"}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickNewPhoto} />
                </label>
              )}
            </div>
            <PartFields form={form} set={set} guides={guides} idPrefix="part" />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="part-quantity_in_stock">Qty in stock</Label><Input id="part-quantity_in_stock" type="number" value={form.quantity_in_stock} onChange={(e) => set("quantity_in_stock", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label htmlFor="part-unit_price">Unit price</Label><Input id="part-unit_price" type="number" value={form.unit_price} onChange={(e) => set("unit_price", Number(e.target.value))} /></div>
            </div>
            <Button className="w-full" onClick={create} disabled={saving || uploading || !form.part_name.trim()}>
              {saving ? "Adding…" : "Add part"}
            </Button>
          </CardContent>
        </Card>
      </div>
      {editing && <EditPartDialog initial={editing} guides={guides} onCancel={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
}

// The fields a part has, for adding one and for its Details.
function PartFields({ form, set, guides, idPrefix }) {
  const id = (k) => `${idPrefix}-${k}`;
  return (
    <>
      <div className="space-y-1.5"><Label htmlFor={id("part_name")}>Part name</Label><Input id={id("part_name")} value={form.part_name} onChange={(e) => set("part_name", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5"><Label htmlFor={id("oem_number")}>OEM #</Label><Input id={id("oem_number")} value={form.oem_number} onChange={(e) => set("oem_number", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("aftermarket_number")}>Aftermarket #</Label><Input id={id("aftermarket_number")} value={form.aftermarket_number} onChange={(e) => set("aftermarket_number", e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor={id("vehicle_compatibility")}>Compatible vehicle</Label><Input id={id("vehicle_compatibility")} value={form.vehicle_compatibility} onChange={(e) => set("vehicle_compatibility", e.target.value)} placeholder="e.g. Toyota Hiace" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5"><Label htmlFor={id("category")}>Category</Label><Input id={id("category")} value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("supplier")}>Supplier</Label><Input id={id("supplier")} value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5"><Label htmlFor={id("min_stock")}>Warn at (qty)</Label><Input id={id("min_stock")} type="number" min="0" value={form.min_stock} onChange={(e) => set("min_stock", e.target.value)} placeholder="e.g. 2" /></div>
        <div className="space-y-1.5"><Label htmlFor={id("bin_location")}>Kept at</Label><Input id={id("bin_location")} value={form.bin_location} onChange={(e) => set("bin_location", e.target.value)} placeholder="Shelf B2" /></div>
      </div>
      {guides.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Fits these bus models</legend>
          <ModelChecklist guides={guides} value={form.guide_ids || []} onChange={(v) => set("guide_ids", v)} idPrefix={id("model")} />
        </fieldset>
      )}
    </>
  );
}

function EditPartDialog({ initial, guides, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.part_name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{initial.part_name}</DialogTitle>
            <DialogDescription>Numbers, where it's kept, when to warn of low stock, and which bus models it fits.</DialogDescription>
          </DialogHeader>
          <PartFields form={form} set={set} guides={guides} idPrefix="edit" />
          <div className="space-y-1.5"><Label htmlFor="edit-unit_price">Unit price</Label><Input id="edit-unit_price" type="number" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} /></div>
          {stockLevel(form) !== "ok" && <StatusChip tone="warning">Stock is at or under the warning level</StatusChip>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.part_name.trim()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
