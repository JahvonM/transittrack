import React, { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/admin/kit";
import { FACT_STATUS, guideTitle } from "@/lib/busLibrary";
import {
  TORQUE_SYSTEMS, blankTorque, findVehicle, ftLb, nmText, torqueBySystem, torqueCounts, torqueData, torqueForm, torqueProblem, visibleTorque,
} from "@/lib/workshop";
import { EditSheet, FIELD, Field, Notice, ScreenBar, hostOf, pluralize, useWorkshop } from "@/components/workshop/kit";
import { Check, ExternalLink, Plus, Search, Wrench, X } from "lucide-react";

// A vehicle's torque values, from its model page: by part of the vehicle,
// the N·m in large type, and It's right / It's wrong on every value. Every
// researched value starts "Not checked" until a mechanic confirms it.

const dateLabel = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};

// After the values already on the page.
const nextOrder = (specs, guideId) => specs.filter((s) => s.guide_id === guideId).reduce((max, s) => Math.max(max, Number(s.sort_order) || 0), 0) + 10;

export function TorqueFigure({ spec, size = "lg" }) {
  const nm = nmText(spec.nm);
  if (!nm) return <span className="text-body-sm text-muted-foreground">No figure</span>;
  return (
    <span className="block text-right leading-none">
      <span className={size === "lg" ? "text-4xl font-bold tabular-nums" : "text-3xl font-bold tabular-nums"}>{nm}</span>
      <span className="ml-1 text-body font-semibold">N·m</span>
      <span className="mt-1 block text-body-sm text-muted-foreground tabular-nums">{ftLb(spec.nm)} ft·lb</span>
    </span>
  );
}

export function TorqueBadges({ spec }) {
  return (
    <>
      {spec.new_bolt && <StatusChip tone="warning">New bolt</StatusChip>}
      {spec.thread_lock && <StatusChip tone="neutral">Thread lock: {spec.thread_lock}</StatusChip>}
    </>
  );
}

function TorqueCard({ spec, onEdit, onMark, marking }) {
  const status = FACT_STATUS[spec.status] ? spec.status : "unchecked";
  const host = hostOf(spec.source_link);
  return (
    <li className="rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => onEdit(spec)} className="flex w-full items-start gap-4 rounded-t-2xl p-4 text-left hover:bg-accent/30" aria-label={`Edit ${spec.item}`}>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-title-sm font-semibold">{spec.item}</span>
          {(spec.size || spec.applies_to) && <span className="block text-body-sm text-muted-foreground">{[spec.size, spec.applies_to].filter(Boolean).join(" · ")}</span>}
          {spec.stages && <span className="block text-body font-medium">{spec.stages}</span>}
          {spec.sequence && <span className="block text-body-sm">{spec.sequence}</span>}
          {(spec.new_bolt || spec.thread_lock) && <span className="flex flex-wrap gap-1.5 pt-1"><TorqueBadges spec={spec} /></span>}
        </span>
        <TorqueFigure spec={spec} />
      </button>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        <StatusChip tone={FACT_STATUS[status].tone}>{FACT_STATUS[status].label}</StatusChip>
        {status !== "unchecked" && spec.checked_by && <span className="text-caption text-muted-foreground">{spec.checked_by}{spec.checked_at ? `, ${dateLabel(spec.checked_at)}` : ""}</span>}
        {spec.source_link ? (
          <a href={spec.source_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 text-caption text-muted-foreground underline underline-offset-2">
            {spec.source_name || host}<ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : spec.source_name ? <span className="text-caption text-muted-foreground">{spec.source_name}</span> : null}
        <span className="ml-auto flex gap-2">
          {status !== "checked" && (
            <Button size="sm" variant="secondary" className="h-11 rounded-xl" disabled={marking} onClick={() => onMark(spec, "checked")}><Check className="mr-1 h-4 w-4" aria-hidden="true" />It's right</Button>
          )}
          {status !== "wrong" && (
            <Button size="sm" variant="ghost" className="h-11 rounded-xl" disabled={marking} onClick={() => onMark(spec, "wrong")}><X className="mr-1 h-4 w-4" aria-hidden="true" />It's wrong</Button>
          )}
        </span>
      </div>
    </li>
  );
}

export function TorqueSheet({ editing, guide, onClose }) {
  const { toast } = useToast();
  const { isAdmin, put, drop, specs } = useWorkshop();
  const [form, setForm] = useState(() => (editing?.id ? torqueForm(editing) : { ...blankTorque(editing?.system), ...editing }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const problem = torqueProblem(form);
  const hint = ftLb(String(form.nm).replace(",", "."));
  const wasChecked = editing?.id && editing.status === "checked";

  const save = async () => {
    if (torqueProblem(form)) return;
    setSaving(true);
    try {
      const data = torqueData(form);
      const saved = editing?.id
        ? await base44.entities.TorqueSpec.update(editing.id, data)
        : await base44.entities.TorqueSpec.create({ ...data, guide_id: guide.id, sort_order: nextOrder(specs, guide.id) });
      put("specs", saved);
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the torque", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.TorqueSpec.delete(editing.id);
      drop("specs", editing.id);
      onClose();
    } catch (e) {
      toast({ title: "Couldn't delete it", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet
      open onClose={onClose} saving={saving} problem={problem} onSave={save}
      title={editing?.id ? "Edit torque" : "Add a torque"} description={guideTitle(guide)}
      onDelete={editing?.id && isAdmin ? remove : undefined}
    >
      {wasChecked && <p className="text-body-sm text-muted-foreground">This value is checked. Changing the bolt, size or torque marks it Not checked again.</p>}
      <Field id="tq-system" label="Part of the vehicle">
        <select id="tq-system" className={FIELD} value={form.system} onChange={set("system")}>
          {TORQUE_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      <Field id="tq-item" label="Which bolt">
        <Input id="tq-item" className="h-12 text-body md:text-body" value={form.item} onChange={set("item")} maxLength={120} placeholder="Front caliper bracket bolts" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="tq-nm" label="Torque (N·m)" hint={hint ? `${hint} ft·lb` : "Leave empty if it's only an angle."}>
          <Input id="tq-nm" className="h-12 text-title-sm tabular-nums md:text-title-sm" inputMode="decimal" value={form.nm} onChange={set("nm")} placeholder="100" />
        </Field>
        <Field id="tq-size" label="Size">
          <Input id="tq-size" className="h-12 text-body md:text-body" value={form.size} onChange={set("size")} maxLength={40} placeholder="M12 × 1.5" />
        </Field>
      </div>
      <Field id="tq-stages" label="Stages or angle" hint="For bolts done in steps.">
        <Input id="tq-stages" className="h-12 text-body md:text-body" value={form.stages} onChange={set("stages")} maxLength={300} placeholder="35 N·m, then +90°, then +90°" />
      </Field>
      <Field id="tq-sequence" label="Order or how">
        <Input id="tq-sequence" className="h-12 text-body md:text-body" value={form.sequence} onChange={set("sequence")} maxLength={300} placeholder="Cross pattern, from the middle out" />
      </Field>
      <label htmlFor="tq-new" className="flex min-h-[48px] items-center gap-3 rounded-xl border border-border px-3">
        <input id="tq-new" type="checkbox" className="h-5 w-5" checked={form.new_bolt} onChange={set("new_bolt")} />
        <span className="text-body">Use a new bolt every time</span>
      </label>
      <Field id="tq-lock" label="Thread lock">
        <Input id="tq-lock" className="h-12 text-body md:text-body" value={form.thread_lock} onChange={set("thread_lock")} maxLength={120} placeholder="Medium strength (blue)" />
      </Field>
      <Field id="tq-applies" label="Applies to">
        <Textarea id="tq-applies" rows={2} className="text-body md:text-body" value={form.applies_to} onChange={set("applies_to")} maxLength={200} placeholder="Only the 2KD-FTV engine" />
      </Field>
      <Field id="tq-source" label="Where it's from">
        <Input id="tq-source" className="h-12 text-body md:text-body" value={form.source_name} onChange={set("source_name")} maxLength={200} placeholder="Workshop manual, page 312" />
      </Field>
      <Field id="tq-link" label="Source link (optional)">
        <Input id="tq-link" type="url" className="h-12 text-body md:text-body" value={form.source_link} onChange={set("source_link")} placeholder="https://…" />
      </Field>
    </EditSheet>
  );
}

const SHOW = [
  { id: "all", label: "All" },
  { id: "unchecked", label: "Not checked" },
  { id: "wrong", label: "Wrong" },
];

export default function TorqueScreen() {
  const { kind, id } = useParams();
  const { toast } = useToast();
  const { vehicles, specs, put, isAdmin } = useWorkshop();
  const vehicle = findVehicle(vehicles, kind, id);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [editing, setEditing] = useState(null);
  const [marking, setMarking] = useState("");
  const guide = vehicle?.guide;
  const mine = useMemo(() => (guide ? specs.filter((s) => s.guide_id === guide.id) : []), [specs, guide]);
  const counts = torqueCounts(mine);
  const groups = torqueBySystem(visibleTorque(mine, { query, show }));
  const back = `/workshop/${kind}/${id}`;

  if (!vehicle) return <Navigate to="/workshop" replace />;
  if (!guide) return <Navigate to={back} replace />;

  const mark = async (spec, status) => {
    setMarking(spec.id);
    try {
      put("specs", await base44.entities.TorqueSpec.update(spec.id, { status }));
    } catch (e) {
      toast({ title: "Couldn't save that", description: e?.message, variant: "destructive" });
    } finally {
      setMarking("");
    }
  };

  return (
    <>
      <ScreenBar back={back} backLabel={vehicle.name} title="Torque" subtitle={`${guideTitle(guide)} · ${pluralize(counts.total, "value")}${counts.unchecked ? `, ${counts.unchecked} not checked` : ""}`}>
        <Button className="h-12 rounded-xl text-body" onClick={() => setEditing({})}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a torque</Button>
      </ScreenBar>

      {mine.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a bolt" aria-label="Find a bolt" className="h-12 rounded-xl pl-10 text-body md:text-body" />
          </div>
          <div role="group" aria-label="Show" className="flex rounded-xl border border-border p-1">
            {SHOW.map((s) => (
              <button
                key={s.id} type="button" aria-pressed={show === s.id} onClick={() => setShow(s.id)}
                className={`h-10 rounded-lg px-3 text-body-sm font-semibold ${show === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s.label}{s.id !== "all" && counts[s.id] ? ` ${counts[s.id]}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {mine.length === 0 ? (
        <Notice action={isAdmin ? <Button asChild variant="secondary" className="h-12 rounded-xl"><Link to="/workshop/models">Models</Link></Button> : null}>
          <p className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4" aria-hidden="true" />No torque values for the {guideTitle(guide)} yet.</p>
          <p className="text-muted-foreground">Add them from the manual or your own checks{isAdmin ? ", or add the researched ones in Models › Ready to add" : ""}. Every {kind === "car" ? "car" : "bus"} of this model shares them.</p>
        </Notice>
      ) : groups.size === 0 ? (
        <p className="py-6 text-center text-body text-muted-foreground">Nothing matches.</p>
      ) : (
        <div className="space-y-6">
          {[...groups].map(([system, list]) => (
            <section key={system} aria-labelledby={`sys-${system}`}>
              <h3 id={`sys-${system}`} className="mb-2 text-body font-semibold text-muted-foreground">{TORQUE_SYSTEMS.find((s) => s.id === system)?.label} <span className="tabular-nums">({list.length})</span></h3>
              <ul className="space-y-3">
                {list.map((spec) => <TorqueCard key={spec.id} spec={spec} onEdit={setEditing} onMark={mark} marking={marking === spec.id} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <TorqueSheet key={editing.id || "new"} editing={editing} guide={guide} onClose={() => setEditing(null)} />}
    </>
  );
}
