import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/admin/kit";
import { ModelChecklist, StockChip } from "@/components/admin/partsCatalogueKit";
import { parsePartText, partsNumbered, quickPartRecord } from "@/lib/partsCatalogue";
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardPaste, ImagePlus, Loader2, Minus, Plus, X } from "lucide-react";

// Add a part from a phone: a photo, the number (pasted from a parts catalogue
// or typed), its name, how many, and the bus models it fits. A number already
// in stock is offered as a restock instead of a second copy of the part. The
// sheet stays open after each one, so a delivery can be added part by part.

const blank = (keep = {}) => ({
  name: "", number: "", other_number: "", kind: keep.kind || "genuine", quantity: 1, photo_url: "",
  guide_ids: keep.guide_ids || [], bin_location: "", min_stock: "", supplier: "", category: "", unit_price: "",
  vehicle_compatibility: "",
});

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

export default function QuickAddPart({ open, onOpenChange, parts = [], guides = [], onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => blank());
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState("");
  const [added, setAdded] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => { if (open) setAdded(""); }, [open]);

  const qty = count(form.quantity);
  const matches = useMemo(() => partsNumbered(form.number, parts), [form.number, parts]);
  const fail = (title) => (err) => toast({ title, description: err?.message, variant: "destructive" });

  // Copied text with more than a number in it goes in as number and name.
  const fill = (text) => {
    const { number, name } = parsePartText(text);
    if (!number && !name) return false;
    setForm((f) => ({ ...f, number: number || f.number, name: name || f.name }));
    return true;
  };
  const pasteCopied = async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast({ title: "Couldn't read what you copied", description: "Press and hold the part number box, then choose Paste." });
      return;
    }
    if (!fill(text)) toast({ title: "Nothing to paste", description: "Copy a part number, or a number and its name, first." });
  };
  const onNumberPaste = (e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!/\s/.test(text.trim())) return;
    e.preventDefault();
    fill(text);
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("photo");
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      set("photo_url", file_url);
    } catch (err) {
      fail("Couldn't upload photo")(err);
    } finally {
      setBusy("");
    }
  };

  // Ready for the next part, keeping the kind of number and the models.
  const done = (message) => {
    setAdded(message);
    setForm((f) => blank(f));
    setMore(false);
  };

  const addNew = async (e) => {
    e?.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy("save");
    try {
      await base44.entities.Part.create(quickPartRecord(form, guides));
      await onSaved?.();
      done(`Added ${form.name.trim()} (${qty})`);
    } catch (err) {
      fail("Couldn't add part")(err);
    } finally {
      setBusy("");
    }
  };

  const restock = async (part) => {
    if (busy || qty < 1) return;
    setBusy("save");
    try {
      const patch = { quantity_in_stock: (Number(part.quantity_in_stock) || 0) + qty };
      if (form.photo_url && !part.photo_url) patch.photo_url = form.photo_url;
      await base44.entities.Part.update(part.id, patch);
      await onSaved?.();
      done(`Added ${qty} to ${part.part_name}: ${patch.quantity_in_stock} in stock`);
    } catch (err) {
      fail("Couldn't update stock")(err);
    } finally {
      setBusy("");
    }
  };

  const otherLabel = form.kind === "other" ? "Genuine number (optional)" : "Other brand's number (optional)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a part</DialogTitle>
          <DialogDescription>Take a photo, paste or type its number, and say how many.</DialogDescription>
        </DialogHeader>

        {added && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-body-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span><strong>{added}.</strong> Add the next one, or tap Done.</span>
          </p>
        )}

        <form id="quick-add-part" onSubmit={addNew} className="space-y-4">
          {form.photo_url ? (
            <div className="relative h-40 w-full overflow-hidden rounded-xl border">
              <img src={form.photo_url} alt="The part" className="h-full w-full object-cover" />
              <button type="button" onClick={() => set("photo_url", "")} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-background/90" aria-label="Remove photo">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-body-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              {busy === "photo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {busy === "photo" ? "Uploading…" : "Take a photo (optional)"}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} aria-label="Photo of the part" />
            </label>
          )}

          <Button type="button" variant="outline" className="h-11 w-full" onClick={pasteCopied}>
            <ClipboardPaste className="mr-2 h-4 w-4" />Paste a copied part number
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="quick-number">Part number</Label>
            <Input
              id="quick-number" value={form.number} onChange={(e) => set("number", e.target.value)} onPaste={onNumberPaste}
              autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="next"
              placeholder="e.g. 04465-26420" className="h-11"
            />
            <Segmented
              label="Kind of number" size="sm" value={form.kind} onChange={(v) => set("kind", v)}
              options={[{ value: "genuine", label: "Genuine (Toyota, Nissan)" }, { value: "other", label: "Other brand" }]}
            />
          </div>

          {matches.length > 0 && (
            <section aria-label="Already in your parts" className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
              <p className="text-body-sm font-semibold">Already in your parts</p>
              {matches.map((p) => (
                <div key={p.id} className="space-y-2">
                  <p className="text-body-sm">{p.part_name}{p.bin_location ? ` · ${p.bin_location}` : ""}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StockChip part={p} />
                    <Button type="button" size="sm" className="h-10" onClick={() => restock(p)} disabled={!!busy || qty < 1}>
                      Add {qty} to its stock
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="quick-name">Name</Label>
            <Input id="quick-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Front brake pads" className="h-11" enterKeyHint="done" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-quantity">How many</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => set("quantity", Math.max(0, qty - 1))} aria-label="One fewer"><Minus className="h-4 w-4" /></Button>
              <Input id="quick-quantity" type="number" inputMode="numeric" min="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} className="h-11 w-20 text-center" />
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => set("quantity", qty + 1)} aria-label="One more"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {guides.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Fits these bus models</legend>
              <ModelChecklist guides={guides} value={form.guide_ids} onChange={(v) => set("guide_ids", v)} idPrefix="quick-model" />
            </fieldset>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={() => setMore(!more)} aria-expanded={more}>
            {more ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}More details
          </Button>
          {more && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1.5"><Label htmlFor="quick-other">{otherLabel}</Label><Input id="quick-other" value={form.other_number} onChange={(e) => set("other_number", e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-bin">Kept at</Label><Input id="quick-bin" value={form.bin_location} onChange={(e) => set("bin_location", e.target.value)} placeholder="Shelf B2" /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-min">Warn at (qty)</Label><Input id="quick-min" type="number" inputMode="numeric" min="0" value={form.min_stock} onChange={(e) => set("min_stock", e.target.value)} placeholder="e.g. 2" /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-supplier">Supplier</Label><Input id="quick-supplier" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-price">Unit price</Label><Input id="quick-price" type="number" inputMode="decimal" min="0" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-category">Category</Label><Input id="quick-category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Brakes" /></div>
              <div className="space-y-1.5"><Label htmlFor="quick-fits">Compatible vehicle</Label><Input id="quick-fits" value={form.vehicle_compatibility} onChange={(e) => set("vehicle_compatibility", e.target.value)} placeholder="The models ticked" /></div>
            </div>
          )}
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
          <Button type="submit" form="quick-add-part" variant={matches.length ? "outline" : "default"} disabled={!!busy || !form.name.trim()}>
            {busy === "save" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {matches.length ? "Add as a new part" : "Add part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
