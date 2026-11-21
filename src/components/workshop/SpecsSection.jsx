import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/admin/kit";
import { FACT_STATUS, SECTIONS, bySection, checkedCounts, guideTitle, intervalLabel, visibleFacts } from "@/lib/busLibrary";
import { blankFact, factData, factForm, factProblem, nextFactOrder } from "@/lib/workshop";
import { EditSheet, FIELD, Field, Notice, hostOf, pluralize, useWorkshop } from "@/components/workshop/kit";
import { BookOpen, Check, ExternalLink, Plus, RefreshCw, Search, Undo2, X } from "lucide-react";

// Specs & service: the model page's facts (specs, oils and fluids, the
// service schedule, tyres, electrical, part numbers, known problems,
// recalls and the team's notes), moved here from the Bus library. Each has
// its source, and It's right / It's wrong like the torque values: a fact
// found on the web is a lead until a mechanic confirms it.

const dateLabel = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};

const SHOW = [
  { id: "all", label: "All" },
  { id: "unchecked", label: "Not checked" },
  { id: "wrong", label: "Wrong" },
];

// Torque values have their own page, so new facts don't go in that section.
const NEW_SECTIONS = SECTIONS.filter((s) => s.id !== "torque");

const ROW = "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_16rem] lg:items-start lg:gap-4";

function FactRow({ fact, onEdit, onMark, marking }) {
  const status = FACT_STATUS[fact.status] ? fact.status : "unchecked";
  const interval = intervalLabel(fact);
  return (
    <li className={`${ROW} grid grid-cols-[minmax(0,1fr)] gap-y-2 px-4 py-3`}>
      <button type="button" onClick={() => onEdit(fact)} className="min-w-0 space-y-0.5 rounded text-left" aria-label={`Edit ${fact.label}`}>
        <span className="block text-body font-semibold text-primary hover:underline">{fact.label}</span>
        {fact.applies_to && <span className="block text-body-sm text-muted-foreground">Only for: {fact.applies_to}</span>}
        {fact.detail && <span className="block whitespace-pre-line text-body-sm text-muted-foreground">{fact.detail}</span>}
      </button>
      <div className="min-w-0 lg:text-right">
        {fact.value && <p className="break-words text-title-sm font-bold">{fact.value}</p>}
        {interval && <p className="text-body-sm font-medium">{interval}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <StatusChip tone={FACT_STATUS[status].tone}>{FACT_STATUS[status].label}</StatusChip>
        {status !== "unchecked" && fact.checked_by && <span className="text-caption text-muted-foreground">{fact.checked_by}{fact.checked_at ? `, ${dateLabel(fact.checked_at)}` : ""}</span>}
        <span className="flex flex-wrap gap-1.5">
          {status !== "checked" && <Button size="sm" variant="outline" className="h-10 rounded-lg" disabled={marking} onClick={() => onMark(fact, "checked")}><Check className="mr-1 h-4 w-4" aria-hidden="true" />It's right</Button>}
          {status !== "wrong" && <Button size="sm" variant="ghost" className="h-10 rounded-lg" disabled={marking} onClick={() => onMark(fact, "wrong")}><X className="mr-1 h-4 w-4" aria-hidden="true" />It's wrong</Button>}
          {status !== "unchecked" && <Button size="sm" variant="ghost" className="h-10 rounded-lg" disabled={marking} onClick={() => onMark(fact, "unchecked")} aria-label={`Undo: mark ${fact.label} not checked`}><Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />Undo</Button>}
        </span>
        {fact.source_link ? (
          <a href={fact.source_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] w-full items-center gap-1 text-caption text-muted-foreground underline underline-offset-2 lg:justify-end">
            Source: {fact.source_name || hostOf(fact.source_link)}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        ) : <span className="w-full text-caption text-muted-foreground lg:text-right">{fact.source_name ? `Source: ${fact.source_name}` : "No source given"}</span>}
      </div>
    </li>
  );
}

function FactSheet({ editing, guide, onClose }) {
  const { toast } = useToast();
  const { isAdmin, put, drop, facts } = useWorkshop();
  const [form, setForm] = useState(() => (editing?.id ? factForm(editing) : blankFact(editing?.section || "specs")));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = factProblem(form);
  const wasChecked = editing?.id && editing.status === "checked";
  // An old fact can stay in "Tightening torques"; new ones go elsewhere.
  const sections = editing?.section === "torque" ? SECTIONS : NEW_SECTIONS;

  const save = async () => {
    if (factProblem(form)) return;
    setSaving(true);
    try {
      if (editing?.id) {
        const changes = factData(form, editing);
        if (Object.keys(changes).length) put("facts", await base44.entities.GuideFact.update(editing.id, changes));
      } else {
        put("facts", await base44.entities.GuideFact.create({ ...factData(form), guide_id: guide.id, sort_order: nextFactOrder(facts, guide.id) }));
      }
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the fact", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.GuideFact.delete(editing.id);
      drop("facts", editing.id);
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
      title={editing?.id ? "Edit fact" : "Add a fact"} description={guideTitle(guide)}
      onDelete={editing?.id && isAdmin ? remove : undefined}
    >
      {wasChecked
        ? <p className="text-body-sm text-muted-foreground">This fact is checked. Changing the answer marks it Not checked again.</p>
        : !editing?.id && <p className="text-body-sm text-muted-foreground">Say where it came from, so the next person can check it.</p>}
      <Field id="fact-section" label="Section" hint={sections === NEW_SECTIONS ? "Torque values have their own page." : undefined}>
        <select id="fact-section" className={FIELD} value={form.section} onChange={set("section")}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      <Field id="fact-label" label="What it is">
        <Input id="fact-label" className="h-12 text-body md:text-body" value={form.label} onChange={set("label")} maxLength={200} placeholder="Engine oil with filter" />
      </Field>
      <Field id="fact-value" label="Answer">
        <Input id="fact-value" className="h-12 text-body md:text-body" value={form.value} onChange={set("value")} maxLength={500} placeholder="7.0 litres" />
      </Field>
      {form.section === "service" && (
        <div className="grid grid-cols-2 gap-3">
          <Field id="fact-km" label="Every … km">
            <Input id="fact-km" inputMode="numeric" className="h-12 text-body tabular-nums md:text-body" value={form.interval_km} onChange={set("interval_km")} placeholder="10000" />
          </Field>
          <Field id="fact-months" label="or every … months">
            <Input id="fact-months" inputMode="numeric" className="h-12 text-body tabular-nums md:text-body" value={form.interval_months} onChange={set("interval_months")} placeholder="6" />
          </Field>
        </div>
      )}
      <Field id="fact-applies" label="Only for (optional)">
        <Input id="fact-applies" className="h-12 text-body md:text-body" value={form.applies_to} onChange={set("applies_to")} maxLength={200} placeholder="2.5 diesel (2KD-FTV)" />
      </Field>
      <Field id="fact-detail" label="More detail (optional)">
        <Textarea id="fact-detail" rows={3} className="text-body md:text-body" value={form.detail} onChange={set("detail")} maxLength={4000} />
      </Field>
      <Field id="fact-source" label="Where it's from">
        <Input id="fact-source" className="h-12 text-body md:text-body" value={form.source_name} onChange={set("source_name")} maxLength={200} placeholder="Owner's manual, page 312" />
      </Field>
      <Field id="fact-link" label="Source link (optional)">
        <Input id="fact-link" type="url" className="h-12 text-body md:text-body" value={form.source_link} onChange={set("source_link")} placeholder="https://…" />
      </Field>
    </EditSheet>
  );
}

export default function SpecsSection({ kind, guide }) {
  const { toast } = useToast();
  const { facts, put, missing, reload, isAdmin } = useWorkshop();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [editing, setEditing] = useState(null);
  const [marking, setMarking] = useState("");
  const mine = useMemo(() => facts.filter((f) => f.guide_id === guide.id), [facts, guide]);
  const counts = checkedCounts(mine);
  const shown = bySection(visibleFacts(mine, { query, show }));
  const blocks = SECTIONS.filter((s) => shown.get(s.id).length);

  const mark = async (fact, status) => {
    setMarking(fact.id);
    try {
      put("facts", await base44.entities.GuideFact.update(fact.id, { status }));
    } catch (e) {
      toast({ title: "Couldn't save that", description: e?.message, variant: "destructive" });
    } finally {
      setMarking("");
    }
  };

  return (
    <section aria-labelledby="specs-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="specs-title" className="text-title-sm font-semibold">Specs &amp; service</h3>
          <p className="text-body-sm text-muted-foreground">{pluralize(counts.total, "fact")}{counts.unchecked ? `, ${counts.unchecked} not checked` : ""} · shared by every {kind === "car" ? "car" : "bus"} of this model</p>
        </div>
        <Button className="h-12 rounded-lg text-body" onClick={() => setEditing({})}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a fact</Button>
      </div>

      {missing.facts && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the specs. Check the connection.
        </Notice>
      )}

      {mine.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Oil, tyre pressure, filter…" aria-label="Find a fact" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
          </div>
          <div role="group" aria-label="Show" className="flex rounded-lg border border-border bg-card p-1">
            {SHOW.map((s) => (
              <button
                key={s.id} type="button" aria-pressed={show === s.id} onClick={() => setShow(s.id)}
                className={`h-10 rounded-md px-3 text-body-sm font-semibold ${show === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s.label}{s.id !== "all" && counts[s.id] ? ` ${counts[s.id]}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {mine.length === 0 && !missing.facts ? (
        <Notice action={isAdmin ? <Button asChild variant="outline" className="h-12 rounded-lg"><Link to="/workshop/models">Models</Link></Button> : null}>
          <p className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" aria-hidden="true" />No specs for the {guideTitle(guide)} yet.</p>
          <p className="text-muted-foreground">Add them from the owner's manual or your own checks: oil and amounts, tyre sizes and pressures, the service schedule.</p>
        </Notice>
      ) : mine.length > 0 && blocks.length === 0 ? (
        <p className="py-6 text-center text-body text-muted-foreground">Nothing matches.</p>
      ) : mine.length > 0 && (
        <div className="space-y-4">
          {blocks.map((s) => (
            <section key={s.id} aria-labelledby={`facts-${s.id}`} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <h4 id={`facts-${s.id}`} className="border-b border-border bg-secondary/60 px-4 py-2 text-body-sm font-semibold">
                {s.label} <span className="tabular-nums text-muted-foreground">({shown.get(s.id).length})</span>
                <span className="ml-2 font-normal text-muted-foreground">{s.hint}</span>
              </h4>
              <ul className="divide-y divide-border">
                {shown.get(s.id).map((fact) => <FactRow key={fact.id} fact={fact} onEdit={setEditing} onMark={mark} marking={marking === fact.id} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <FactSheet key={editing.id || "new"} editing={editing} guide={guide} onClose={() => setEditing(null)} />}
    </section>
  );
}
