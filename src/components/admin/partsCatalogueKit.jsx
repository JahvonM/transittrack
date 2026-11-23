import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/admin/kit";
import { Check, ExternalLink, Loader2, Plus, Trash2, Undo2, X } from "lucide-react";
import { FACT_STATUS } from "@/lib/busLibrary";
import { KIND_LABEL, guideLabel, partsNumbered, replacementsFor, stockLabel } from "@/lib/partsCatalogue";

// Pieces of the parts catalogue shared by Admin → Parts and the part
// pictures on a Bus library page.

const SELECT = "h-10 w-full rounded-lg border border-input bg-background px-3 text-body-sm";
const hostOf = (link) => {
  try { return new URL(link).hostname; } catch { return "link"; }
};

export function StockChip({ part, className }) {
  const { tone, text } = stockLabel(part);
  return <StatusChip tone={tone} className={className}>{text}</StatusChip>;
}

// The numbers that can replace a part: each with its source and whether a
// mechanic has checked it, and which of them are on the shelf now.
export function ReplacementsList({ part, parts, interchanges, canDelete = false, onChange }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const list = replacementsFor(part, interchanges);
  const fail = (title) => (e) => toast({ title, description: e?.message, variant: "destructive" });

  const mark = async (row, status) => {
    setBusy(row.id);
    try { await base44.entities.PartInterchange.update(row.id, { status }); await onChange(); }
    catch (e) { fail("Couldn't mark it")(e); }
    finally { setBusy(""); }
  };
  const remove = async (rep) => {
    if (!(await confirmAction({ title: "Remove this replacement?", description: `${rep.brand ? rep.brand + " " : ""}${rep.number}` }))) return;
    try { await base44.entities.PartInterchange.delete(rep.row.id); await onChange(); }
    catch (e) { fail("Couldn't remove it")(e); }
  };

  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-body-sm text-muted-foreground">No replacement numbers yet.</p>}
      <ul className="divide-y divide-border">
        {list.map((rep) => {
          const status = FACT_STATUS[rep.row.status] ? rep.row.status : "unchecked";
          const onShelf = partsNumbered(rep.number, parts, part.id);
          return (
            <li key={rep.row.id} className="py-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold">{rep.brand ? `${rep.brand} ` : ""}{rep.number}</p>
                  <p className="text-caption text-muted-foreground">{KIND_LABEL[rep.kind] || "Replacement"}{rep.row.applies_to ? ` · ${rep.row.applies_to}` : ""}</p>
                  {rep.row.notes && <p className="text-body-sm text-muted-foreground">{rep.row.notes}</p>}
                  <p className="text-caption text-muted-foreground">
                    {rep.row.source_link ? (
                      <a href={rep.row.source_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                        Source: {rep.row.source_name || hostOf(rep.row.source_link)}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : rep.row.source_name ? `Source: ${rep.row.source_name}` : "No source given"}
                  </p>
                  {onShelf.map((other) => (
                    <p key={other.id} className="mt-1 text-body-sm">
                      On the shelf as <strong>{other.part_name}</strong>{other.bin_location ? ` (${other.bin_location})` : ""}: <StockChip part={other} />
                    </p>
                  ))}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusChip tone={FACT_STATUS[status].tone}>{FACT_STATUS[status].label}</StatusChip>
                  {status !== "unchecked" && rep.row.checked_by && <span className="text-caption text-muted-foreground">{rep.row.checked_by}</span>}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {status !== "checked" && <Button size="sm" variant="outline" disabled={busy === rep.row.id} onClick={() => mark(rep.row, "checked")}><Check className="mr-1 h-4 w-4" />It fits</Button>}
                {status !== "wrong" && <Button size="sm" variant="outline" disabled={busy === rep.row.id} onClick={() => mark(rep.row, "wrong")}><X className="mr-1 h-4 w-4" />Doesn't fit</Button>}
                {status !== "unchecked" && <Button size="sm" variant="ghost" disabled={busy === rep.row.id} onClick={() => mark(rep.row, "unchecked")} aria-label="Undo: mark not checked"><Undo2 className="mr-1 h-4 w-4" />Undo</Button>}
                {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(rep)} aria-label={`Remove ${rep.number}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <AddReplacement part={part} onCancel={() => setAdding(false)} onSaved={async () => { setAdding(false); await onChange(); }} />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!part.oem_number && !part.aftermarket_number}>
          <Plus className="mr-1 h-4 w-4" />Add a replacement number
        </Button>
      )}
      {!part.oem_number && !part.aftermarket_number && <p className="text-caption text-muted-foreground">Give this part a number first.</p>}
    </div>
  );
}

function AddReplacement({ part, onCancel, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ alt_number: "", alt_brand: "", kind: "aftermarket", applies_to: "", source_name: "", source_link: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const base = part.oem_number || part.aftermarket_number;
  const save = async (e) => {
    e.preventDefault();
    if (!form.alt_number.trim()) return;
    setSaving(true);
    try {
      await base44.entities.PartInterchange.create({ part_number: base, ...form, alt_number: form.alt_number.trim() });
      await onSaved();
    } catch (err) {
      toast({ title: "Couldn't add it", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const id = (k) => `rep-${part.id}-${k}`;
  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-body-sm">Another number that can be used instead of <strong>{base}</strong>.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={id("number")}>Number</Label><Input id={id("number")} value={form.alt_number} onChange={set("alt_number")} placeholder="Z418" required /></div>
        <div className="space-y-1"><Label htmlFor={id("brand")}>Brand</Label><Input id={id("brand")} value={form.alt_brand} onChange={set("alt_brand")} placeholder="Ryco" /></div>
        <div className="space-y-1">
          <Label htmlFor={id("kind")}>Kind</Label>
          <select id={id("kind")} className={SELECT} value={form.kind} onChange={set("kind")}>
            {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor={id("applies")}>Only for (optional)</Label><Input id={id("applies")} value={form.applies_to} onChange={set("applies_to")} placeholder="1KD-FTV only" /></div>
        <div className="space-y-1"><Label htmlFor={id("source")}>Source</Label><Input id={id("source")} value={form.source_name} onChange={set("source_name")} placeholder="Ryco catalogue" /></div>
        <div className="space-y-1"><Label htmlFor={id("link")}>Source link (https://)</Label><Input id={id("link")} type="url" value={form.source_link} onChange={set("source_link")} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !form.alt_number.trim()}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// Which bus models a part fits, as tick boxes of the library's pages.
export function ModelChecklist({ guides, value = [], onChange, idPrefix }) {
  if (!guides.length) return <p className="text-caption text-muted-foreground">Add model pages in the Bus library to link parts to them.</p>;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {guides.map((g) => (
        <label key={g.id} htmlFor={`${idPrefix}-${g.id}`} className="flex min-h-[32px] items-center gap-2 text-body-sm">
          <input id={`${idPrefix}-${g.id}`} type="checkbox" className="h-4 w-4" checked={value.includes(g.id)} onChange={() => toggle(g.id)} />
          {guideLabel(g)}
        </label>
      ))}
    </div>
  );
}

// The fields a part has, for adding one and for its Details (Admin › Parts
// and the Workshop's part page).
export function PartFields({ form, set, guides, idPrefix }) {
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
