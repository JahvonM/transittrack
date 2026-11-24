import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chunks, guideTitle, starterFacts, yearsLabel } from "@/lib/busLibrary";
import { starterInterchanges } from "@/lib/partsCatalogue";
import { starterPictures } from "@/lib/partDrawings";
import { blankCar, carData, carForm, carProblem, guideContents, readyStarters, starterTorque } from "@/lib/workshop";
import { STARTERS } from "@/data/busLibrary";
import { TORQUE_STARTERS } from "@/data/workshop/torque";
import REPLACEMENTS from "@/data/partsCatalogue/replacements.json";
import PICTURES from "@/data/partsCatalogue/pictures.json";
import { EditSheet, Field, Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { BookOpen, Loader2, Plus, Sparkles } from "lucide-react";

// Workshop › Models (administrators): the model pages every vehicle's specs,
// torque values, bolt maps and the maker's diagrams hang off, and the
// researched starters ready to add (model pages with their facts and torque
// values, replacement numbers, and picture slots). A car is matched to its
// page by make, model and year, like a bus.

const EMPTY_GUIDE = { make: "", model: "", generation: "", year_from: "", year_to: "", engines: "", market: "", summary: "" };
const guideForm = (g) => Object.fromEntries(Object.keys(EMPTY_GUIDE).map((k) => [k, g?.[k] == null ? "" : String(g[k])]));
const yearOrNull = (v) => (String(v).trim() === "" ? null : Number(v));
const badYear = (v) => String(v).trim() !== "" && !/^(19|20)\d\d$/.test(String(v).trim());

// Runs a save for each record, a few at a time.
async function inBatches(list, save, size = 8) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(save));
}

// Edit a model page, make a new one (editing has no id; it may carry a
// vehicle's make, model and year), or, for an administrator, delete one with
// everything on it.
export function GuideSheet({ editing, onClose }) {
  const { toast } = useToast();
  const data = useWorkshop();
  const { put, reload, isAdmin, missing } = data;
  const [form, setForm] = useState(() => guideForm(editing));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = !form.make.trim() || !form.model.trim() ? "A model page needs a make and a model."
    : badYear(form.year_from) || badYear(form.year_to) ? "Years are four digits, like 2013." : "";
  const save = async () => {
    setSaving(true);
    try {
      const record = {
        make: form.make.trim(), model: form.model.trim(), generation: form.generation.trim(),
        year_from: yearOrNull(form.year_from), year_to: yearOrNull(form.year_to), engines: form.engines.trim(), market: form.market.trim(), summary: form.summary.trim(),
      };
      put("guides", editing?.id ? await base44.entities.VehicleGuide.update(editing.id, record) : await base44.entities.VehicleGuide.create(record));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the model page", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Deleting takes the page's records with it, so everything must have loaded.
  const own = editing?.id ? guideContents(editing.id, data) : null;
  const incomplete = missing.facts || missing.documents || missing.parts;
  const remove = async () => {
    setSaving(true);
    const id = editing.id;
    try {
      await inBatches(own.facts, (r) => base44.entities.GuideFact.delete(r.id));
      await inBatches(own.documents, (r) => base44.entities.GuideDocument.delete(r.id));
      await inBatches(own.pictures, (r) => base44.entities.PartDiagram.delete(r.id));
      await inBatches(own.torque, (r) => base44.entities.TorqueSpec.delete(r.id));
      await inBatches(own.groups, (r) => base44.entities.CatalogueGroup.delete(r.id));
      await inBatches(own.parts, (p) => base44.entities.Part.update(p.id, { guide_ids: p.guide_ids.filter((g) => g !== id) }));
      await base44.entities.VehicleGuide.delete(id);
      toast({ title: `${guideTitle(editing)} page deleted` });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't delete the whole page", description: `${e?.message || "Check the connection."} What was deleted stays deleted; try again to finish.`, variant: "destructive" });
      setSaving(false);
    } finally {
      await reload();
    }
  };
  const goes = own && [
    pluralize(own.facts.length, "fact"), pluralize(own.documents.length, "manual"), pluralize(own.pictures.length, "picture"),
    pluralize(own.torque.length, "torque value"), pluralize(own.groups.length, "maker's diagram", "maker's diagrams"),
  ];

  return (
    <EditSheet
      open onClose={onClose} saving={saving} problem={problem} onSave={save} title={editing?.id ? "Edit model page" : "New model page"} description="Shared by every vehicle of this make and model"
      onDelete={editing?.id && isAdmin && !incomplete ? remove : undefined} deleteLabel="Delete model page"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="g-make" label="Make"><Input id="g-make" className="h-12 text-body md:text-body" value={form.make} onChange={set("make")} maxLength={60} placeholder="BMW" /></Field>
        <Field id="g-model" label="Model"><Input id="g-model" className="h-12 text-body md:text-body" value={form.model} onChange={set("model")} maxLength={60} placeholder="X3" /></Field>
      </div>
      <Field id="g-gen" label="Generation (optional)"><Input id="g-gen" className="h-12 text-body md:text-body" value={form.generation} onChange={set("generation")} maxLength={120} placeholder="F25" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="g-from" label="From year"><Input id="g-from" inputMode="numeric" className="h-12 text-body md:text-body" value={form.year_from} onChange={set("year_from")} placeholder="2010" /></Field>
        <Field id="g-to" label="To year"><Input id="g-to" inputMode="numeric" className="h-12 text-body md:text-body" value={form.year_to} onChange={set("year_to")} placeholder="2017" /></Field>
      </div>
      <Field id="g-engines" label="Engines (optional)"><Input id="g-engines" className="h-12 text-body md:text-body" value={form.engines} onChange={set("engines")} maxLength={300} placeholder="2.0 diesel (N47)" /></Field>
      <Field id="g-market" label="Market (optional)" hint="Where the specs are from, as they differ by market"><Input id="g-market" className="h-12 text-body md:text-body" value={form.market} onChange={set("market")} maxLength={120} placeholder="General export" /></Field>
      <Field id="g-summary" label="Notes (optional)"><Textarea id="g-summary" rows={3} className="text-body md:text-body" value={form.summary} onChange={set("summary")} maxLength={4000} /></Field>
      {editing?.id && isAdmin && (
        <p className="text-body-sm text-muted-foreground">
          {incomplete
            ? "Delete is off: some of this page's records couldn't be loaded. Reload the Workshop and try again."
            : `Deleting it also deletes its ${goes.join(", ")}${own.parts.length ? `, and unlinks ${pluralize(own.parts.length, "part")} from it` : ""}. Jobs keep their records.`}
        </p>
      )}
    </EditSheet>
  );
}

export function CarSheet({ editing, onClose }) {
  const { toast } = useToast();
  const { put, drop, isAdmin } = useWorkshop();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => (editing?.id ? carForm(editing) : blankCar()));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      const saved = editing?.id ? await base44.entities.WorkshopVehicle.update(editing.id, carData(form)) : await base44.entities.WorkshopVehicle.create(carData(form));
      put("cars", saved);
      onClose();
      if (!editing?.id && saved?.id) navigate(`/workshop/car/${saved.id}`);
    } catch (e) {
      toast({ title: "Couldn't save the car", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.WorkshopVehicle.delete(editing.id);
      drop("cars", editing.id);
      onClose();
      navigate("/workshop", { replace: true });
    } catch (e) {
      toast({ title: "Couldn't delete the car", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };
  return (
    <EditSheet
      open onClose={onClose} saving={saving} problem={carProblem(form)} onSave={save}
      title={editing?.id ? "Edit car" : "Add a car"} description="Only in the Workshop: not on the fleet map, kiosks or reports"
      onDelete={editing?.id && isAdmin ? remove : undefined} deleteLabel="Delete car"
    >
      <Field id="c-name" label="Name"><Input id="c-name" className="h-12 text-body md:text-body" value={form.name} onChange={set("name")} maxLength={80} placeholder="The X3" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="c-make" label="Make"><Input id="c-make" className="h-12 text-body md:text-body" value={form.make} onChange={set("make")} maxLength={60} placeholder="BMW" /></Field>
        <Field id="c-model" label="Model"><Input id="c-model" className="h-12 text-body md:text-body" value={form.model} onChange={set("model")} maxLength={60} placeholder="X3" /></Field>
      </div>
      <p className="-mt-2 text-caption text-muted-foreground">Make and model as on its model page, so its torque values and bolt maps show.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field id="c-year" label="Year"><Input id="c-year" inputMode="numeric" className="h-12 text-body md:text-body" value={form.year} onChange={set("year")} placeholder="2013" /></Field>
        <Field id="c-plate" label="Plate"><Input id="c-plate" className="h-12 text-body md:text-body" value={form.plate_number} onChange={set("plate_number")} maxLength={20} /></Field>
      </div>
      <Field id="c-engine" label="Engine"><Input id="c-engine" className="h-12 text-body md:text-body" value={form.engine} onChange={set("engine")} maxLength={120} placeholder="2.0 diesel (N47)" /></Field>
      <Field id="c-gearbox" label="Gearbox"><Input id="c-gearbox" className="h-12 text-body md:text-body" value={form.transmission} onChange={set("transmission")} maxLength={60} placeholder="Automatic" /></Field>
      <Field id="c-vin" label="Chassis number (VIN)"><Input id="c-vin" className="h-12 font-mono text-body md:text-body" value={form.vin} onChange={set("vin")} maxLength={40} autoComplete="off" /></Field>
      <Field id="c-notes" label="Notes"><Textarea id="c-notes" rows={3} className="text-body md:text-body" value={form.notes} onChange={set("notes")} maxLength={2000} /></Field>
    </EditSheet>
  );
}

export default function Models() {
  const { toast } = useToast();
  const { isAdmin, guides, specs, diagrams, interchanges, vehicles, missing, put, reload } = useWorkshop();
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState("");
  if (!isAdmin) return <Navigate to="/workshop" replace />;
  const ready = readyStarters(STARTERS, TORQUE_STARTERS, guides, specs);
  // Added once: numbers already in, and areas a page already has, are left out.
  const replacements = missing.interchanges ? [] : starterInterchanges(REPLACEMENTS, interchanges);
  const pictures = starterPictures(PICTURES, guides, diagrams);
  const picturePages = new Set(pictures.map((p) => p.guide_id)).size;
  const sorted = [...guides].sort((a, b) => guideTitle(a).localeCompare(guideTitle(b)) || (Number(a.year_from) || 0) - (Number(b.year_from) || 0));

  // Runs one import, then shows what the server now holds.
  const run = async (key, work) => {
    setImporting(key);
    try {
      await work();
    } catch (e) {
      toast({ title: "Couldn't add them", description: e?.message, variant: "destructive" });
    } finally {
      await reload();
      setImporting("");
    }
  };
  const add = (item) => run(item.key, async () => {
    let guide = item.guide;
    let facts = 0;
    if (!guide) {
      guide = await base44.entities.VehicleGuide.create(item.page);
      put("guides", guide);
      const rows = item.library ? starterFacts(item.library, guide.id) : [];
      for (const batch of chunks(rows)) await base44.entities.GuideFact.bulkCreate(batch);
      facts = rows.length;
    }
    const torque = item.values ? starterTorque(item.values, guide.id, specs) : [];
    for (const batch of chunks(torque)) await base44.entities.TorqueSpec.bulkCreate(batch);
    const added = [facts && pluralize(facts, "fact"), torque.length && pluralize(torque.length, "torque value")].filter(Boolean).join(" and ");
    toast({ title: `${item.label}: ${item.guide ? "" : "page "}added${added ? ` with ${added}` : ""}`, description: "All marked Not checked until a mechanic confirms them." });
  });
  const addReplacements = () => run("replacements", async () => {
    for (const batch of chunks(replacements)) await base44.entities.PartInterchange.bulkCreate(batch);
    toast({ title: `${pluralize(replacements.length, "replacement number")} added`, description: "Each shows on any part with a matching number, marked Not checked." });
  });
  const addPictures = () => run("pictures", async () => {
    for (const batch of chunks(pictures)) await base44.entities.PartDiagram.bulkCreate(batch);
    toast({ title: `${pluralize(pictures.length, "picture slot")} added`, description: "Each has a guide drawing until you add a photo." });
  });
  const offers = [
    ...ready.map((item) => ({
      key: item.key, title: item.label, onAdd: () => add(item),
      text: `${item.guide
        ? `${pluralize(item.torque, "torque value")} for ${guideTitle(item.guide)}.`
        : `Makes its model page${item.facts ? ` with ${pluralize(item.facts, "researched fact")}` : ""}${item.torque ? `, then adds ${pluralize(item.torque, "torque value")}` : ""}.`} Researched from public sources; each is marked Not checked.`,
    })),
    ...(replacements.length ? [{ key: "replacements", title: "Replacement numbers", onAdd: addReplacements, text: `${pluralize(replacements.length, "number")} that can stand in for a part: other brands, and newer or older genuine numbers. Researched from public sources; each is marked Not checked.` }] : []),
    ...(pictures.length ? [{ key: "pictures", title: "Picture slots", onAdd: addPictures, text: `${pluralize(pictures.length, "area")} on ${pluralize(picturePages, "model page")}, each with a guide drawing until you add a photo.` }] : []),
  ];

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: "Models" }]} title="Models" subtitle="Specs, torque values and bolt maps belong to a model page, shared by every vehicle of that model.">
        <Button className="h-12 rounded-xl text-body" onClick={() => setEditing({})}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />New model page</Button>
      </ScreenBar>

      {offers.length > 0 && (
        <section aria-labelledby="ready" className="mb-6">
          <h3 id="ready" className="mb-2 flex items-center gap-2 text-body font-semibold text-muted-foreground"><Sparkles className="h-4 w-4" aria-hidden="true" />Ready to add</h3>
          <ul className="space-y-3">
            {offers.map((o) => (
              <li key={o.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-title-sm font-semibold">{o.title}</p>
                  <p className="text-body-sm text-muted-foreground">{o.text}</p>
                </div>
                <Button className="h-12 rounded-xl text-body" disabled={!!importing} onClick={o.onAdd} aria-label={`Add ${o.title}`}>
                  {importing === o.key && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Add
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pages">
        <h3 id="pages" className="mb-2 flex items-center gap-2 text-body font-semibold text-muted-foreground"><BookOpen className="h-4 w-4" aria-hidden="true" />Model pages</h3>
        {sorted.length === 0 ? (
          <Notice>No model pages yet.</Notice>
        ) : (
          <ul className="space-y-3">
            {sorted.map((g) => {
              const using = vehicles.filter((v) => v.guide?.id === g.id).map((v) => v.name);
              const torque = specs.filter((s) => s.guide_id === g.id).length;
              const pictures = diagrams.filter((d) => d.guide_id === g.id).length;
              return (
                <li key={g.id}>
                  <button type="button" onClick={() => setEditing(g)} className="w-full rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/30">
                    <span className="block text-title-sm font-semibold">{guideTitle(g)}{g.generation ? <span className="font-normal text-muted-foreground"> · {g.generation}</span> : null}</span>
                    <span className="block text-body-sm text-muted-foreground">{[yearsLabel(g), pluralize(torque, "torque value"), pluralize(pictures, "picture")].join(" · ")}</span>
                    <span className="block text-body-sm">{using.length ? `Used by ${using.join(", ")}` : "No vehicle uses it yet"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <GuideSheet key={editing.id || "new"} editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
