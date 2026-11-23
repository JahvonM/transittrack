import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PartFields, ReplacementsList, StockChip } from "@/components/admin/partsCatalogueKit";
import { uploadPhoto } from "@/components/workshop/Pictures";
import { guideLabel, inStockReplacements, stockLevel } from "@/lib/partsCatalogue";
import { nextStock, partData, partForm, partProblem } from "@/lib/workshop";
import { EditSheet, Field, Notice, ScreenBar, useWorkshop } from "@/components/workshop/kit";
import { Camera, Loader2, Minus, Pencil, Plus, RefreshCw } from "lucide-react";

// One part's own page: its photo, the count on the shelf with big − and +,
// where it's kept and when to warn, its numbers, the models it fits and the
// vehicles they are, and the numbers that can replace it.

// The count changes on screen with every tap; one save follows once the
// taps stop. It adds the taps to the latest count on the server, so the
// parts kiosk and the workshop tablet never overwrite each other's counts.
const SAVE_AFTER_MS = 700;

function StockControl({ part }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const waiting = useRef(0);
  const timer = useRef(null);
  const busy = useRef(false);
  const flushRef = useRef(null);

  const flush = async () => {
    if (busy.current) { timer.current = setTimeout(() => flushRef.current(), 300); return; }
    const delta = waiting.current;
    if (!delta) return;
    busy.current = true;
    setSaving(true);
    try {
      const fresh = await base44.entities.Part.get(part.id);
      const saved = await base44.entities.Part.update(part.id, { quantity_in_stock: nextStock(fresh?.quantity_in_stock, delta) });
      put("parts", saved);
    } catch (e) {
      toast({ title: "Couldn't save the count", description: e?.message || "Check the connection and tap again.", variant: "destructive" });
    } finally {
      // Saved or not, these taps are done: the screen shows the saved count.
      waiting.current -= delta;
      setPending(waiting.current);
      busy.current = false;
      setSaving(false);
    }
  };
  flushRef.current = flush;

  // Taps not saved yet still save when the page is left.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (waiting.current) flushRef.current();
  }, []);

  const shown = nextStock(part.quantity_in_stock, pending);
  const tap = (step) => {
    if (nextStock(part.quantity_in_stock, waiting.current + step) === nextStock(part.quantity_in_stock, waiting.current)) return;
    waiting.current += step;
    setPending(waiting.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_AFTER_MS);
  };

  return (
    <section aria-labelledby="stock-title" className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 id="stock-title" className="mb-2 text-body font-semibold text-muted-foreground">On the shelf</h3>
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" className="h-16 w-16 rounded-xl" onClick={() => tap(-1)} disabled={shown === 0} aria-label={`One fewer ${part.part_name}`}>
          <Minus className="!h-7 !w-7" aria-hidden="true" />
        </Button>
        <p className="min-w-[6rem] text-center" aria-live="polite">
          <span className="block text-5xl font-bold tabular-nums">{shown}</span>
          <span className="block text-body-sm text-muted-foreground">in stock</span>
        </p>
        <Button variant="outline" className="h-16 w-16 rounded-xl" onClick={() => tap(1)} aria-label={`One more ${part.part_name}`}>
          <Plus className="!h-7 !w-7" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex min-h-[1.75rem] flex-wrap items-center justify-center gap-2">
        <StockChip part={{ ...part, quantity_in_stock: shown }} />
        {(saving || pending !== 0) && <span className="inline-flex items-center gap-1 text-caption text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Saving…</span>}
      </div>
    </section>
  );
}

function PartPhoto({ part }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      put("parts", await base44.entities.Part.update(part.id, { photo_url: await uploadPhoto(file) }));
    } catch (err) {
      toast({ title: "Couldn't save the photo", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    // On a phone an empty photo is a short bar, so the stock buttons stay near the top.
    <label className={`relative grid w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-colors hover:border-primary md:aspect-square md:h-auto ${part.photo_url ? "aspect-[4/3]" : "h-24"}`}>
      {part.photo_url
        ? <img src={part.photo_url} alt={part.part_name} className="h-full w-full object-cover" />
        : <span className="flex flex-col items-center gap-2 text-body-sm text-muted-foreground"><Camera className="h-8 w-8" aria-hidden="true" />Take a photo</span>}
      {part.photo_url && <span className="absolute bottom-2 right-2 rounded-lg bg-background/90 px-2 py-1 text-caption font-semibold">Change photo</span>}
      {busy && <span className="absolute inset-0 grid place-items-center bg-background/70"><Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /></span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label={`Photo of ${part.part_name}`} disabled={busy} />
    </label>
  );
}

function PartSheet({ part, onClose }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { guides, put, drop, isAdmin } = useWorkshop();
  const [form, setForm] = useState(() => partForm(part));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problem = partProblem(form);

  const save = async () => {
    setSaving(true);
    try {
      put("parts", await base44.entities.Part.update(part.id, partData(form, guides)));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the part", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.Part.delete(part.id);
      drop("parts", part.id);
      navigate("/workshop/parts", { replace: true });
    } catch (e) {
      toast({ title: "Couldn't delete the part", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={onClose} saving={saving} problem={problem} onSave={save}
      title="Edit part" description={part.part_name}
      onDelete={isAdmin ? remove : undefined} deleteLabel="Delete this part"
    >
      <PartFields form={form} set={set} guides={guides} idPrefix="ws-part" />
      <Field id="ws-part-unit_price" label="Unit price">
        <Input id="ws-part-unit_price" inputMode="decimal" className="h-12 text-body md:text-body" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} />
      </Field>
    </EditSheet>
  );
}

const Detail = ({ label, children }) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
    <dt className="text-body-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-body">{children}</dd>
  </div>
);

export default function PartPage() {
  const { partId } = useParams();
  const { parts, interchanges, guides, vehicles, missing, reload, isAdmin } = useWorkshop();
  const [editing, setEditing] = useState(false);
  const part = parts.find((p) => p.id === partId);

  if (!part) {
    if (!missing.parts) return <Navigate to="/workshop/parts" replace />;
    return (
      <>
        <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { to: "/workshop/parts", label: "Parts" }, { label: "Part" }]} title="Part" />
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the parts. Check the connection.
        </Notice>
      </>
    );
  }

  const models = (part.guide_ids || []).map((id) => guides.find((g) => g.id === id)).filter(Boolean);
  const usedOn = vehicles.filter((v) => v.guide && models.some((g) => g.id === v.guide.id));
  const spare = stockLevel(part) === "ok" ? [] : inStockReplacements(part, parts, interchanges);
  const numbers = [part.oem_number, part.aftermarket_number].filter(Boolean).join(" · ");

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { to: "/workshop/parts", label: "Parts" }, { label: part.part_name || "Part" }]} title={part.part_name || "Part"} subtitle={numbers}>
        <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit details</Button>
      </ScreenBar>

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <div className="space-y-4">
          <PartPhoto part={part} />
          <StockControl key={part.id} part={part} />
        </div>
        <div className="min-w-0 space-y-4">
          {spare.length > 0 && (
            <Notice tone="warning">
              <p className="font-semibold">Replacement on the shelf</p>
              <ul className="mt-1 space-y-0.5">
                {spare.map(({ part: other }) => (
                  <li key={other.id}><Link to={`/workshop/parts/${other.id}`} className="font-medium text-primary underline underline-offset-2">{other.part_name}</Link> ({other.quantity_in_stock}{other.bin_location ? `, ${other.bin_location}` : ""})</li>
                ))}
              </ul>
            </Notice>
          )}

          <section aria-labelledby="part-details" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <h3 id="part-details" className="border-b border-border bg-secondary/60 px-4 py-2 text-body-sm font-semibold">Details</h3>
            <dl className="divide-y divide-border">
              <Detail label="Kept at">{part.bin_location || <span className="text-muted-foreground">Not recorded</span>}</Detail>
              <Detail label="Warn at">{part.min_stock != null && part.min_stock !== "" ? `${part.min_stock} or fewer` : <span className="text-muted-foreground">No warning set</span>}</Detail>
              <Detail label="OEM number"><span className="tabular-nums">{part.oem_number || "—"}</span></Detail>
              <Detail label="Aftermarket"><span className="tabular-nums">{part.aftermarket_number || "—"}</span></Detail>
              {part.supplier && <Detail label="Supplier">{part.supplier}</Detail>}
              {part.category && <Detail label="Category">{part.category}</Detail>}
              {Number(part.unit_price) > 0 && <Detail label="Unit price">{Number(part.unit_price).toFixed(2)}</Detail>}
              {part.vehicle_compatibility && <Detail label="Fits (note)">{part.vehicle_compatibility}</Detail>}
            </dl>
          </section>

          <section aria-labelledby="part-fits" className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 id="part-fits" className="mb-2 text-body-sm font-semibold">Fits these models</h3>
            {models.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">No models ticked yet. Tap Edit details to add them.</p>
            ) : (
              <>
                <p className="text-body">{models.map(guideLabel).join(", ")}</p>
                {usedOn.length > 0 && (
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    On: {usedOn.map((v, i) => (
                      <React.Fragment key={`${v.kind}-${v.id}`}>{i > 0 && ", "}<Link to={`/workshop/${v.kind}/${v.id}`} className="font-medium text-primary underline underline-offset-2">{v.name}</Link></React.Fragment>
                    ))}
                  </p>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="part-replacements" className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 id="part-replacements" className="mb-2 text-body-sm font-semibold">Replacements</h3>
            {missing.interchanges
              ? <p className="text-body-sm text-muted-foreground">Couldn't load the replacement numbers. <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={reload}>Try again</button></p>
              : <ReplacementsList part={part} parts={parts} interchanges={interchanges} canDelete={isAdmin} onChange={reload} />}
          </section>
        </div>
      </div>

      {editing && <PartSheet part={part} onClose={() => setEditing(false)} />}
    </>
  );
}
