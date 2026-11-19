import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chunks, guideTitle, yearsLabel } from "@/lib/busLibrary";
import { blankCar, carData, carForm, carProblem, pageFromStarter, readyTorque, starterTorque } from "@/lib/workshop";
import { TORQUE_STARTERS } from "@/data/workshop/torque";
import { EditSheet, Field, Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { BookOpen, Loader2, Plus, Sparkles } from "lucide-react";

// Workshop › Models (administrators): the model pages every vehicle's torque
// values and bolt maps hang off, and the researched starter values ready to
// add. A car is matched to its page by make, model and year, like a bus.

const EMPTY_GUIDE = { make: "", model: "", generation: "", year_from: "", year_to: "", engines: "", summary: "" };
const guideForm = (g) => Object.fromEntries(Object.keys(EMPTY_GUIDE).map((k) => [k, g?.[k] == null ? "" : String(g[k])]));
const yearOrNull = (v) => (String(v).trim() === "" ? null : Number(v));
const badYear = (v) => String(v).trim() !== "" && !/^(19|20)\d\d$/.test(String(v).trim());

function GuideSheet({ editing, onClose }) {
  const { toast } = useToast();
  const { put } = useWorkshop();
  const [form, setForm] = useState(() => guideForm(editing));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = !form.make.trim() || !form.model.trim() ? "A model page needs a make and a model."
    : badYear(form.year_from) || badYear(form.year_to) ? "Years are four digits, like 2013." : "";
  const save = async () => {
    setSaving(true);
    try {
      const data = {
        make: form.make.trim(), model: form.model.trim(), generation: form.generation.trim(),
        year_from: yearOrNull(form.year_from), year_to: yearOrNull(form.year_to), engines: form.engines.trim(), summary: form.summary.trim(),
      };
      put("guides", editing?.id ? await base44.entities.VehicleGuide.update(editing.id, data) : await base44.entities.VehicleGuide.create(data));
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the model page", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <EditSheet open onClose={onClose} saving={saving} problem={problem} onSave={save} title={editing?.id ? "Edit model page" : "New model page"} description="Shared by every vehicle of this make and model">
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
      <Field id="g-summary" label="Notes (optional)"><Textarea id="g-summary" rows={3} className="text-body md:text-body" value={form.summary} onChange={set("summary")} maxLength={4000} /></Field>
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
  const { isAdmin, guides, specs, diagrams, vehicles, put, reload } = useWorkshop();
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState("");
  if (!isAdmin) return <Navigate to="/workshop" replace />;
  const ready = readyTorque(TORQUE_STARTERS, guides, specs);
  const sorted = [...guides].sort((a, b) => guideTitle(a).localeCompare(guideTitle(b)) || (Number(a.year_from) || 0) - (Number(b.year_from) || 0));

  const add = async ({ starter, guide: existing }) => {
    setImporting(starter.key);
    try {
      let guide = existing;
      if (!guide) {
        guide = await base44.entities.VehicleGuide.create(pageFromStarter(starter));
        put("guides", guide);
      }
      const rows = starterTorque(starter, guide.id, specs);
      for (const batch of chunks(rows)) await base44.entities.TorqueSpec.bulkCreate(batch);
      toast({ title: `${starter.label}: ${pluralize(rows.length, "value")} added`, description: "All marked Not checked until a mechanic confirms them." });
    } catch (e) {
      toast({ title: "Couldn't add them", description: e?.message, variant: "destructive" });
    } finally {
      await reload();
      setImporting("");
    }
  };

  return (
    <>
      <ScreenBar back="/workshop" backLabel="Home" title="Models" subtitle="Torque values and bolt maps belong to a model page, shared by every vehicle of that model.">
        <Button className="h-12 rounded-xl text-body" onClick={() => setEditing({})}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />New model page</Button>
      </ScreenBar>

      {ready.length > 0 && (
        <section aria-labelledby="ready" className="mb-6">
          <h3 id="ready" className="mb-2 flex items-center gap-2 text-body font-semibold text-muted-foreground"><Sparkles className="h-4 w-4" aria-hidden="true" />Ready to add</h3>
          <ul className="space-y-3">
            {ready.map((r) => (
              <li key={r.starter.key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-title-sm font-semibold">{r.starter.label}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {r.blocked ? `Add the ${r.starter.label} page in the Bus library first.`
                      : r.needsPage ? `Makes its model page, then adds ${pluralize(r.count, "torque value")}.`
                      : `${pluralize(r.count, "torque value")} for ${guideTitle(r.guide)}.`}
                    {" "}Researched from public sources; each is marked Not checked.
                  </p>
                </div>
                {!r.blocked && (
                  <Button className="h-12 rounded-xl text-body" disabled={!!importing} onClick={() => add(r)}>
                    {importing === r.starter.key && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Add
                  </Button>
                )}
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
                  <button type="button" onClick={() => setEditing(g)} className="w-full rounded-2xl border border-border bg-card p-4 text-left hover:bg-accent/30">
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
