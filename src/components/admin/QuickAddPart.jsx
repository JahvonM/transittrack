import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/admin/kit";
import { ModelChecklist, StockChip } from "@/components/admin/partsCatalogueKit";
import useQuickAddPart from "@/hooks/useQuickAddPart";
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardPaste, ImagePlus, Loader2, Minus, Plus, RotateCcw, X } from "lucide-react";

// Add a part from a phone: a photo, the number (pasted from a parts catalogue
// or typed), its name, how many, and the bus models it fits. A number already
// in stock is offered as a restock instead of a second copy of the part. The
// form stays after each one, so a delivery can be added part by part. This is
// the sheet on the Parts screen; the parts kiosk (/parts) has its own compact
// layout on the same useQuickAddPart.

export default function QuickAddPart({ open, onOpenChange, parts = [], guides = [], onSaved }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a part</DialogTitle>
          <DialogDescription>Take a photo, paste or type its number, and say how many.</DialogDescription>
        </DialogHeader>
        <QuickAddPartForm parts={parts} guides={guides} onSaved={onSaved} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// The photo: shown from the phone while it uploads; Retry if it didn't.
export function PhotoPreview({ q, className = "h-40 w-full" }) {
  const { state, preview } = q.photo;
  return (
    <div className={`relative overflow-hidden rounded-xl border ${className}`}>
      {preview ? <img src={preview} alt="The part" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /></div>}
      {state === "working" && preview && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-caption">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Uploading
        </span>
      )}
      {state === "failed" && (
        <button type="button" onClick={q.retryPhoto} className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-lg bg-destructive px-2 py-1 text-caption text-destructive-foreground">
          <RotateCcw className="h-3 w-3" aria-hidden="true" />Try again
        </button>
      )}
      <button type="button" onClick={q.removePhoto} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-background/90" aria-label="Remove photo">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// The fields under "More details", shared with the kiosk's sheet.
export function QuickMoreFields({ q, idPrefix = "quick", columns = 2, inputClassName = "" }) {
  const { form, set } = q;
  const id = (k) => `${idPrefix}-${k}`;
  const otherLabel = form.kind === "other" ? "Genuine number (optional)" : "Other brand's number (optional)";
  const field = (key, label, props = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={id(key)}>{label}</Label>
      <Input id={id(key)} value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClassName} {...props} />
    </div>
  );
  return (
    <div className={columns === 2 ? "grid grid-cols-2 gap-2" : "space-y-3"}>
      <div className={columns === 2 ? "col-span-2" : undefined}>
        {field("other_number", otherLabel, { autoCapitalize: "characters", autoCorrect: "off", spellCheck: false })}
      </div>
      {field("bin_location", "Kept at", { placeholder: "Shelf B2" })}
      {field("min_stock", "Warn at (qty)", { type: "number", inputMode: "numeric", min: "0", placeholder: "e.g. 2" })}
      {field("supplier", "Supplier")}
      {field("unit_price", "Unit price", { type: "number", inputMode: "decimal", min: "0" })}
      {field("category", "Category", { placeholder: "Brakes" })}
      {field("vehicle_compatibility", "Compatible vehicle", { placeholder: "The models ticked" })}
    </div>
  );
}

export function QuickAddPartForm({ parts = [], guides = [], onSaved, onDone, onAdded }) {
  const q = useQuickAddPart({ parts, guides, onSaved, onAdded });
  const { form, set, qty, matches, more, setMore, saving, added } = q;

  return (
    <div className="space-y-4">
      {added && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-body-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span><strong>{added}.</strong> {onDone ? "Add the next one, or tap Done." : "Add the next one."}</span>
        </p>
      )}

      <form id="quick-add-part" onSubmit={q.addNew}>
        <fieldset disabled={saving} className="min-w-0 space-y-4 border-0 p-0">
          {q.photo.state !== "idle" ? (
            <PhotoPreview q={q} />
          ) : (
            <label className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-body-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <ImagePlus className="h-5 w-5" />
              Take a photo (optional)
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={q.pickPhoto} aria-label="Photo of the part" />
            </label>
          )}

          <Button type="button" variant="outline" className="h-11 w-full" onClick={q.pasteCopied}>
            <ClipboardPaste className="mr-2 h-4 w-4" />Paste a copied part number
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="quick-number">Part number</Label>
            <Input
              id="quick-number" value={form.number} onChange={(e) => set("number", e.target.value)} onPaste={q.onNumberPaste}
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
                    <Button type="button" size="sm" className="h-10" onClick={() => q.restock(p)} disabled={saving || qty < 1}>
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
              <Input id="quick-quantity" type="number" inputMode="numeric" min="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} className="h-11 w-24 text-center" />
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
          {more && <QuickMoreFields q={q} />}
        </fieldset>
      </form>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Done</Button>}
        <Button type="submit" form="quick-add-part" variant={matches.length ? "outline" : "default"} disabled={saving || !form.name.trim()}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {saving && q.photo.state === "working" ? "Photo uploading…" : matches.length ? "Add as a new part" : "Add part"}
        </Button>
      </div>
    </div>
  );
}
