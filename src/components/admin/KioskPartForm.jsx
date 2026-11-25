import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import { PhotoPreview, QuickMoreFields } from "@/components/admin/QuickAddPart";
import useQuickAddPart from "@/hooks/useQuickAddPart";
import ScanNumberButton from "@/components/admin/ScanNumberButton";
import { guideLabel } from "@/lib/partsCatalogue";
import { Camera, Check, CheckCircle2, ChevronRight, ClipboardPaste, Loader2, Minus, Plus } from "lucide-react";

// The parts kiosk's form (/parts): the common path on one phone screen, with
// the main button in a bar pinned to the bottom (it steps aside while the
// keyboard is up; the keyboard's Go key adds the part instead). The rarer
// fields are in a "More details" sheet. On a tablet the bar sits in the card.

const LABEL = "block text-caption font-semibold text-muted-foreground";
const CHIP = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-body-sm font-semibold transition-[transform,background-color,border-color] active:scale-[.97]";
const chip = (on) => `${CHIP} ${on ? "border-primary bg-primary/15 text-foreground" : "border-border bg-secondary/40 text-muted-foreground"}`;
const enter = (e, action) => {
  if (e.key !== "Enter" || e.nativeEvent?.isComposing) return;
  e.preventDefault();
  action();
};

export default function KioskPartForm({ parts, guides = [], ready = true, notReadyLabel = "Loading your parts…", onSaved, onAdded }) {
  const nameRef = useRef(null);
  const q = useQuickAddPart({
    parts, guides, onSaved,
    onAdded: (entry) => {
      try { navigator.vibrate?.(15); } catch { /* no vibration on this device */ }
      onAdded?.(entry);
    },
  });
  const { form, set, qty, matches, primary, saving } = q;
  const toggleModel = (id) => set("guide_ids", form.guide_ids.includes(id) ? form.guide_ids.filter((x) => x !== id) : [...form.guide_ids, id]);

  const status = saving
    ? (q.photo.state === "working" ? "Photo uploading…" : "Adding…")
    : q.added ? `${q.added}. Add the next one.` : "";
  const mainLabel = !ready ? notReadyLabel : primary.label;

  return (
    <form onSubmit={q.submit} noValidate>
      <fieldset disabled={saving} className="min-w-0 space-y-3 border-0 p-0">
        {/* Photo, number, and which kind of number. */}
        <div className="flex gap-3">
          {q.photo.state !== "idle" ? (
            <PhotoPreview q={q} className="h-[120px] w-[104px] shrink-0" />
          ) : (
            <label className="flex h-[120px] w-[104px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-caption text-muted-foreground active:scale-[.97]">
              <Camera className="h-6 w-6" aria-hidden="true" />
              Photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={q.pickPhoto} aria-label="Photo of the part" />
            </label>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor="kiosk-number" className={LABEL}>Part number</label>
            <div className="flex gap-2">
              <Input
                id="kiosk-number" value={form.number} onChange={(e) => set("number", e.target.value)} onPaste={q.onNumberPaste}
                onKeyDown={(e) => enter(e, () => (matches.length ? e.currentTarget.blur() : nameRef.current?.focus()))}
                autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="next"
                placeholder="04465-26420" className="h-12 min-w-0 flex-1 rounded-xl text-title-sm md:text-title-sm"
              />
              <Button type="button" variant="secondary" size="icon" className="h-12 w-12 shrink-0 rounded-xl md:w-auto md:px-4" onClick={q.pasteCopied} aria-label="Paste a copied part number" title="Paste a copied part number">
                <ClipboardPaste className="h-5 w-5" aria-hidden="true" /><span className="ml-1.5 hidden md:inline">Paste</span>
              </Button>
              <ScanNumberButton onScan={q.fill} compact className="h-12 w-12 rounded-xl" />
            </div>
            <div role="group" aria-label="Kind of number" className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={form.kind === "genuine"} onClick={() => set("kind", "genuine")} className={chip(form.kind === "genuine")}>Genuine</button>
              <button type="button" aria-pressed={form.kind === "other"} onClick={() => set("kind", "other")} className={chip(form.kind === "other")}>Other brand</button>
            </div>
          </div>
        </div>

        {matches.length > 0 && (
          <section aria-label="Already in your parts" className="space-y-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2">
            <p className={LABEL}>Already in your parts</p>
            {matches.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">{p.part_name}{p.bin_location ? ` · ${p.bin_location}` : ""}</span>
                <StockChip part={p} className="shrink-0" />
                {matches.length > 1 && (
                  <Button type="button" size="sm" className="h-10 shrink-0 rounded-xl" onClick={() => q.restock(p)} disabled={qty < 1}>Add {qty}</Button>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="space-y-1">
          <label htmlFor="kiosk-name" className={LABEL}>Name</label>
          <Input
            id="kiosk-name" ref={nameRef} value={form.name} onChange={(e) => set("name", e.target.value)}
            onKeyDown={(e) => enter(e, () => { if (ready) q.submit(); })}
            enterKeyHint="go" placeholder="e.g. Front brake pads" className="h-12 rounded-xl text-title-sm md:text-title-sm"
          />
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="kiosk-quantity" className={LABEL}>How many</label>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="secondary" size="icon" className="h-12 w-12 rounded-xl active:scale-[.97]" onClick={() => set("quantity", Math.max(0, qty - 1))} aria-label="One fewer"><Minus className="h-5 w-5" /></Button>
              <Input
                id="kiosk-quantity" inputMode="numeric" pattern="[0-9]*" value={form.quantity}
                onChange={(e) => set("quantity", e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => enter(e, () => e.currentTarget.blur())}
                className="h-12 w-16 rounded-xl text-center font-display text-title tabular-nums md:text-title"
              />
              <Button type="button" variant="secondary" size="icon" className="h-12 w-12 rounded-xl active:scale-[.97]" onClick={() => set("quantity", qty + 1)} aria-label="One more"><Plus className="h-5 w-5" /></Button>
            </div>
          </div>
          <Button type="button" variant="secondary" className="ml-auto h-12 rounded-xl px-3" onClick={() => q.setMore(true)}>
            More details{q.extras ? ` · ${q.extras}` : ""}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {guides.length > 0 && (
          <fieldset className="min-w-0 space-y-1 border-0 p-0">
            <legend className={`${LABEL} mb-1`}>Fits these bus models</legend>
            <div className="flex flex-wrap gap-2">
              {guides.map((g) => {
                const on = form.guide_ids.includes(g.id);
                return (
                  <label key={g.id} htmlFor={`kiosk-model-${g.id}`} className={`${chip(on)} cursor-pointer`}>
                    <input id={`kiosk-model-${g.id}`} type="checkbox" className="sr-only" checked={on} onChange={() => toggleModel(g.id)} />
                    {on && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    {guideLabel(g)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </fieldset>

      {/* The main button, pinned to the bottom of a phone; in the card on a tablet. */}
      <div className="tt-hide-while-typing safe-area-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-2 md:static md:z-auto md:mt-4 md:border-0 md:bg-transparent md:p-0">
        <p role="status" className={`flex items-center gap-1.5 text-body-sm ${status ? "pb-2" : "sr-only"}`}>
          {q.added && !saving && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
          {status}
        </p>
        <div className="flex gap-2 pb-2 md:pb-0">
          {primary.kind === "restock" && (
            <Button type="button" variant="outline" className="h-14 flex-1 whitespace-normal rounded-xl leading-tight active:scale-[.97]" onClick={() => q.addNew()} disabled={!ready || saving || !form.name.trim()}>
              Add as a new part
            </Button>
          )}
          <Button
            type="button" onClick={() => q.submit()} disabled={!ready || saving || !primary.enabled}
            variant={primary.kind === "new" && matches.length ? "outline" : "default"}
            className="h-14 flex-[1.4] rounded-xl text-title-sm active:scale-[.97]"
          >
            {saving && <Loader2 className="mr-1.5 h-5 w-5 animate-spin" aria-hidden="true" />}
            {mainLabel}
          </Button>
        </div>
      </div>

      <Sheet open={q.more} onOpenChange={q.setMore}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5 safe-area-bottom">
          <SheetHeader className="text-left">
            <SheetTitle>More details</SheetTitle>
            <SheetDescription>All optional.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <QuickMoreFields q={q} idPrefix="kiosk" columns={1} inputClassName="h-12 rounded-xl" />
          </div>
          <Button type="button" className="mt-5 h-12 w-full rounded-xl" onClick={() => q.setMore(false)}>Done</Button>
        </SheetContent>
      </Sheet>
    </form>
  );
}
