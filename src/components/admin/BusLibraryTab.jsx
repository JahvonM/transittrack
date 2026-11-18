import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel, PageIntro, Segmented, StatusChip, Toolbar } from "@/components/admin/kit";
import BusLoader from "@/components/BusLoader";
import { ArrowLeft, BookOpen, Bus, Check, ExternalLink, FileText, Loader2, Pencil, Plus, Search, Trash2, TriangleAlert, Undo2, Upload, X } from "lucide-react";
import { STARTERS } from "@/data/busLibrary";
import { DiagramsPanel, ModelPartsPanel } from "@/components/admin/PartDiagrams";
import REPLACEMENTS from "@/data/partsCatalogue/replacements.json";
import { starterInterchanges } from "@/lib/partsCatalogue";
import {
  DOCUMENT_KINDS, FACT_STATUS, MAX_DOCUMENT_BYTES, SECTIONS,
  busRecordWarnings, busesOf, bySection, checkedCounts, chunks, documentKindLabel, documentText,
  guideFromStarter, guideTitle, intervalLabel, matchesSearch, starterFacts, uncoveredBuses,
  unimportedStarters, visibleFacts, yearsLabel,
} from "@/lib/busLibrary";

// Admin → Bus library, and the mechanics' Library tab: everything known about
// each bus model in one place. Facts come with where they came from and stay
// "Not checked" until someone confirms them on a bus or in a manual.
const SELECT = "h-10 w-full rounded-lg border border-input bg-background px-3 text-body-sm";
const EMPTY_FACT = { section: "specs", label: "", value: "", applies_to: "", detail: "", interval_km: "", interval_months: "", source_name: "", source_link: "" };
const EMPTY_GUIDE = { make: "", model: "", generation: "", year_from: "", year_to: "", engines: "", market: "", summary: "" };

const dateLabel = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};
const hostOf = (link) => {
  try { return new URL(link).hostname; } catch { return "link"; }
};
const busLabel = (bus) =>[bus.name || bus.fleet_number || "Bus", bus.plate_number, bus.year].filter(Boolean).join(" · ");

export default function BusLibraryTab({ vehicles = [], canDelete = false }) {
  const { toast } = useToast();
  const [guides, setGuides] = useState([]);
  const [facts, setFacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [parts, setParts] = useState([]);
  const [diagrams, setDiagrams] = useState([]);
  const [interchanges, setInterchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [guideForm, setGuideForm] = useState(null);
  const [importing, setImporting] = useState("");

  const load = async () => {
    try {
      const [g, f, d, p, pd, pi] = await Promise.all([
        base44.entities.VehicleGuide.list("make", 200),
        base44.entities.GuideFact.list("sort_order", 5000),
        base44.entities.GuideDocument.list("-created_date", 500),
        base44.entities.Part.list("part_name", 2000),
        base44.entities.PartDiagram.list("sort_order", 500),
        base44.entities.PartInterchange.list("-created_date", 5000),
      ]);
      setGuides(g || []);
      setFacts(f || []);
      setDocuments(d || []);
      setParts(p || []);
      setDiagrams(pd || []);
      setInterchanges(pi || []);
      setLoadError("");
    } catch (e) {
      setLoadError(e?.message || "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const fail = (title) => (e) => toast({ title, description: e?.message, variant: "destructive" });

  const importStarter = async (starter) => {
    setImporting(starter.key);
    try {
      const guide = await base44.entities.VehicleGuide.create(guideFromStarter(starter));
      for (const batch of chunks(starterFacts(starter, guide.id))) await base44.entities.GuideFact.bulkCreate(batch);
      await load();
      setOpenId(guide.id);
      toast({ title: `${guideTitle(starter)} added`, description: `${starter.facts.length} facts, all marked not checked.` });
    } catch (e) {
      fail("Couldn't add the starter page")(e);
      await load();
    } finally {
      setImporting("");
    }
  };

  const importReplacements = async () => {
    setImporting("replacements");
    try {
      const rows = starterInterchanges(REPLACEMENTS, interchanges);
      for (const batch of chunks(rows)) await base44.entities.PartInterchange.bulkCreate(batch);
      toast({ title: "Replacement numbers added", description: `${rows.length} numbers, all marked not checked. They show on any part with a matching number.` });
    } catch (e) {
      fail("Couldn't add the replacement numbers")(e);
    } finally {
      await load();
      setImporting("");
    }
  };

  const saveGuide = async (form) => {
    const data = {
      ...form,
      make: form.make.trim(),
      model: form.model.trim(),
      year_from: form.year_from === "" ? null : Number(form.year_from),
      year_to: form.year_to === "" ? null : Number(form.year_to),
    };
    delete data.id;
    try {
      const saved = form.id ? await base44.entities.VehicleGuide.update(form.id, data) : await base44.entities.VehicleGuide.create(data);
      setGuideForm(null);
      await load();
      setOpenId(saved.id);
    } catch (e) {
      fail("Couldn't save the page")(e);
    }
  };

  const deleteGuide = async (guide) => {
    const own = facts.filter((f) => f.guide_id === guide.id);
    const docs = documents.filter((d) => d.guide_id === guide.id);
    const pictures = diagrams.filter((d) => d.guide_id === guide.id);
    const linked = parts.filter((p) => Array.isArray(p.guide_ids) && p.guide_ids.includes(guide.id));
    if (!(await confirmAction({ title: `Delete the ${guideTitle(guide)} page?`, description: `Its ${own.length} facts, ${docs.length} documents and ${pictures.length} part pictures are deleted with it. Parts stay in stock.` }))) return;
    try {
      for (const f of own) await base44.entities.GuideFact.delete(f.id);
      for (const d of docs) await base44.entities.GuideDocument.delete(d.id);
      for (const d of pictures) await base44.entities.PartDiagram.delete(d.id);
      for (const p of linked) await base44.entities.Part.update(p.id, { guide_ids: p.guide_ids.filter((id) => id !== guide.id) });
      await base44.entities.VehicleGuide.delete(guide.id);
      setOpenId(null);
    } catch (e) {
      fail("Couldn't delete the page")(e);
    }
    await load();
  };

  if (loading) return <BusLoader className="py-8" />;
  if (loadError) {
    return (
      <EmptyState icon={TriangleAlert} title="The library could not be loaded" action={<Button onClick={() => { setLoading(true); load(); }}>Try again</Button>}>
        {loadError}
      </EmptyState>
    );
  }

  const open = guides.find((g) => g.id === openId);
  const guideDialog = guideForm && <GuideDialog initial={guideForm} onCancel={() => setGuideForm(null)} onSave={saveGuide} />;

  if (open) {
    return (
      <>
        <GuidePage
          guide={open}
          facts={facts.filter((f) => f.guide_id === open.id)}
          documents={documents.filter((d) => d.guide_id === open.id)}
          diagrams={diagrams.filter((d) => d.guide_id === open.id)}
          parts={parts}
          interchanges={interchanges}
          buses={busesOf(open, vehicles)}
          canDelete={canDelete}
          onBack={() => setOpenId(null)}
          onEdit={() => setGuideForm({ ...EMPTY_GUIDE, ...open, year_from: open.year_from ?? "", year_to: open.year_to ?? "" })}
          onDelete={() => deleteGuide(open)}
          onChange={load}
        />
        {guideDialog}
      </>
    );
  }

  return (
    <>
      <LibraryHome
        guides={guides}
        facts={facts}
        documents={documents}
        vehicles={vehicles}
        importing={importing}
        onOpen={setOpenId}
        onImport={importStarter}
        newReplacements={starterInterchanges(REPLACEMENTS, interchanges).length}
        onImportReplacements={importReplacements}
        onNew={(bus) => setGuideForm({ ...EMPTY_GUIDE, make: bus?.make || "", model: bus?.model || "", year_from: bus?.year || "", year_to: bus?.year || "" })}
      />
      {guideDialog}
    </>
  );
}

function LibraryHome({ guides, facts, documents, vehicles, importing, onOpen, onImport, onNew, newReplacements = 0, onImportReplacements }) {
  const [query, setQuery] = useState("");
  const starters = unimportedStarters(STARTERS, guides);
  const uncovered = uncoveredBuses(guides, vehicles);
  const q = query.trim();
  const hits = q ? visibleFacts(facts, { query: q }).slice(0, 50) : [];
  const docHits = q ? documents.filter((d) => matchesSearch(q, ...documentText(d))).slice(0, 20) : [];
  const guideOf = (id) => guides.find((g) => g.id === id);

  return (
    <div className="space-y-4">
      <PageIntro>
        Everything known about each bus model: specs, oils, the service schedule, known problems and your manuals. Facts from the web
        stay marked <strong>Not checked</strong> until a mechanic confirms them on a bus or in a manual.
      </PageIntro>
      <Toolbar actions={<Button onClick={() => onNew(null)}><Plus className="mr-1.5 h-4 w-4" />New model page</Button>}>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search every page: oil, tyre, glow plug…" aria-label="Search the library" className="pl-9" />
        </div>
      </Toolbar>

      {q && (
        <Panel title={`Results for “${q}”`} description={`${hits.length} facts, ${docHits.length} documents`}>
          {hits.length === 0 && docHits.length === 0 && <p className="text-body-sm text-muted-foreground">Nothing matches. Try fewer words.</p>}
          <ul className="divide-y divide-border">
            {hits.map((fact) => (
              <li key={fact.id} className="py-2">
                <button type="button" className="w-full text-left" onClick={() => onOpen(fact.guide_id)}>
                  <span className="text-caption text-muted-foreground">{guideTitle(guideOf(fact.guide_id))}</span>
                  <span className="block font-semibold">{fact.label}{fact.value ? <>: <span className="font-normal">{fact.value}</span></> : null}</span>
                </button>
              </li>
            ))}
            {docHits.map((doc) => (
              <li key={doc.id} className="py-2">
                <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => onOpen(doc.guide_id)}>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span><span className="font-semibold">{doc.title}</span> <span className="text-caption text-muted-foreground">{guideTitle(guideOf(doc.guide_id))}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {guides.length === 0 && starters.length === 0 && (
        <EmptyState icon={BookOpen} title="No model pages yet" action={<Button onClick={() => onNew(null)}>New model page</Button>}>
          Add a page for each kind of bus you run.
        </EmptyState>
      )}

      {guides.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {guides.map((guide) => {
            const own = facts.filter((f) => f.guide_id === guide.id);
            const counts = checkedCounts(own);
            const buses = busesOf(guide, vehicles);
            return (
              <button key={guide.id} type="button" onClick={() => onOpen(guide.id)} className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40">
                <p className="text-title-sm font-bold">{guideTitle(guide)}</p>
                <p className="text-body-sm text-muted-foreground">{[guide.generation, yearsLabel(guide)].filter(Boolean).join(" · ")}</p>
                <p className="mt-2 text-body-sm">
                  {buses.length ? `${buses.length} of your buses: ${buses.map((b) => b.name || b.plate_number).filter(Boolean).join(", ")}` : "None of your buses yet"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusChip tone="neutral">{counts.total} facts</StatusChip>
                  <StatusChip tone={counts.checked ? "success" : "neutral"}>{counts.checked} checked</StatusChip>
                  {counts.wrong > 0 && <StatusChip tone="danger">{counts.wrong} wrong</StatusChip>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {(starters.length > 0 || newReplacements > 0) && (
        <Panel title="Ready to add" description="Researched from public sources. Everything comes with its source and starts as not checked.">
          <ul className="divide-y divide-border">
            {starters.map((starter) => (
              <li key={starter.key} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-semibold">{guideTitle(starter)} <span className="font-normal text-muted-foreground">{[starter.generation, yearsLabel(starter)].filter(Boolean).join(" · ")}</span></p>
                  <p className="text-body-sm text-muted-foreground">{starter.facts.length} facts{starter.market ? ` · ${starter.market}` : ""}</p>
                </div>
                <Button onClick={() => onImport(starter)} disabled={!!importing}>
                  {importing === starter.key ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Add this page
                </Button>
              </li>
            ))}
            {newReplacements > 0 && (
              <li className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-semibold">Replacement part numbers</p>
                  <p className="text-body-sm text-muted-foreground">{newReplacements} aftermarket numbers for Hiace and NV350 filters, from parts catalogues</p>
                </div>
                <Button onClick={onImportReplacements} disabled={!!importing}>
                  {importing === "replacements" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Add these
                </Button>
              </li>
            )}
          </ul>
        </Panel>
      )}

      {uncovered.length > 0 && (
        <Panel title="Buses with no page" icon={Bus} description="Their make and model has no page yet, or their year is outside every page's years.">
          <ul className="divide-y divide-border">
            {uncovered.map((bus) => (
              <li key={bus.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-[160px] flex-1">{busLabel(bus)} <span className="text-muted-foreground">{bus.make} {bus.model}</span></span>
                <Button variant="outline" size="sm" onClick={() => onNew(bus)}>Make a page</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function GuidePage({ guide, facts, documents, diagrams = [], parts = [], interchanges = [], buses, canDelete, onBack, onEdit, onDelete, onChange }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [factForm, setFactForm] = useState(null);
  const [busy, setBusy] = useState("");
  const counts = checkedCounts(facts);
  const shown = useMemo(() => bySection(visibleFacts(facts, { query, show })), [facts, query, show]);
  const fail = (title) => (e) => toast({ title, description: e?.message, variant: "destructive" });

  const mark = async (fact, status) => {
    setBusy(fact.id);
    try { await base44.entities.GuideFact.update(fact.id, { status }); await onChange(); }
    catch (e) { fail("Couldn't mark the fact")(e); }
    finally { setBusy(""); }
  };
  const saveFact = async (form) => {
    const data = { ...form, guide_id: guide.id };
    for (const k of ["interval_km", "interval_months"]) data[k] = data[k] === "" || data[k] == null ? null : Number(data[k]);
    delete data.id; delete data.status; delete data.checked_by; delete data.checked_at;
    delete data.created_date; delete data.updated_date; delete data.created_by; delete data.created_by_id; delete data.is_sample;
    try {
      if (form.id) await base44.entities.GuideFact.update(form.id, data);
      else await base44.entities.GuideFact.create({ ...data, sort_order: (facts.length + 1) * 10 });
      setFactForm(null);
      await onChange();
    } catch (e) { fail("Couldn't save the fact")(e); }
  };
  const removeFact = async (fact) => {
    if (!(await confirmAction({ title: "Delete this fact?", description: fact.label }))) return;
    try { await base44.entities.GuideFact.delete(fact.id); await onChange(); }
    catch (e) { fail("Couldn't delete the fact")(e); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button variant="ghost" className="-ml-3" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" />All models</Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[200px] flex-1">
            <h2 className="font-display text-title font-bold">{guideTitle(guide)}</h2>
            <p className="text-body-sm text-muted-foreground">{[guide.generation, yearsLabel(guide), guide.market].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-4 w-4" />Edit page</Button>
            {canDelete && <Button variant="outline" onClick={onDelete}><Trash2 className="mr-1.5 h-4 w-4" />Delete page</Button>}
          </div>
        </div>
      </div>

      {(guide.summary || guide.engines) && (
        <Panel>
          {guide.engines && <p className="text-body-sm"><strong>Engines:</strong> {guide.engines}</p>}
          {guide.summary && <p className="mt-2 whitespace-pre-line text-body-sm text-muted-foreground">{guide.summary}</p>}
        </Panel>
      )}

      <Panel title="Your buses" icon={Bus} description={buses.length ? "Matched by make, model and year." : "None of your buses match this page's make, model and years."}>
        <ul className="divide-y divide-border">
          {buses.map((bus) => {
            const warnings = busRecordWarnings(bus);
            return (
              <li key={bus.id} className="py-2">
                <p className="font-semibold">{busLabel(bus)}</p>
                <p className="text-body-sm text-muted-foreground">{[bus.engine && `Engine: ${bus.engine}`, bus.transmission && `Gearbox: ${bus.transmission}`, bus.current_odometer && `${Number(bus.current_odometer).toLocaleString("en-US")} km`].filter(Boolean).join(" · ")}</p>
                {warnings.map((w) => (
                  <p key={w} className="mt-1 flex items-start gap-1.5 text-body-sm text-warning"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{w}</p>
                ))}
              </li>
            );
          })}
        </ul>
      </Panel>

      <ModelPartsPanel guide={guide} parts={parts} interchanges={interchanges} onChange={onChange} />
      <DiagramsPanel guide={guide} diagrams={diagrams} parts={parts} interchanges={interchanges} canDelete={canDelete} onChange={onChange} />

      <Toolbar actions={<Button onClick={() => setFactForm({ ...EMPTY_FACT })}><Plus className="mr-1.5 h-4 w-4" />Add a fact</Button>}>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this page" aria-label="Search this page" className="pl-9" />
        </div>
        <Segmented
          label="Which facts"
          value={show}
          onChange={setShow}
          size="sm"
          options={[
            { value: "all", label: "All", count: counts.total },
            { value: "unchecked", label: "Not checked", count: counts.unchecked },
            { value: "checked", label: "Checked", count: counts.checked },
            { value: "wrong", label: "Wrong", count: counts.wrong },
          ]}
        />
      </Toolbar>

      {facts.length === 0 && (
        <EmptyState icon={BookOpen} title="No facts yet" action={<Button onClick={() => setFactForm({ ...EMPTY_FACT })}>Add a fact</Button>}>
          Add what you know about this model: oil amounts, tyre pressures, filter numbers.
        </EmptyState>
      )}

      {SECTIONS.map((section) => {
        const list = shown.get(section.id);
        if (!list.length) return null;
        return (
          <Panel key={section.id} title={section.label} description={section.hint}>
            <ul className="divide-y divide-border">
              {list.map((fact) => (
                <FactRow
                  key={fact.id}
                  fact={fact}
                  busy={busy === fact.id}
                  canDelete={canDelete}
                  onMark={(status) => mark(fact, status)}
                  onEdit={() => setFactForm({ ...EMPTY_FACT, ...fact, interval_km: fact.interval_km ?? "", interval_months: fact.interval_months ?? "" })}
                  onDelete={() => removeFact(fact)}
                />
              ))}
            </ul>
          </Panel>
        );
      })}
      {facts.length > 0 && SECTIONS.every((s) => !shown.get(s.id).length) && <p className="text-body-sm text-muted-foreground">No facts match.</p>}

      <DocumentsPanel guide={guide} documents={documents.filter((d) => matchesSearch(query, ...documentText(d)))} canDelete={canDelete} onChange={onChange} />

      {factForm && <FactDialog initial={factForm} onCancel={() => setFactForm(null)} onSave={saveFact} />}
    </div>
  );
}

function FactRow({ fact, busy, canDelete, onMark, onEdit, onDelete }) {
  const status = FACT_STATUS[fact.status] ? fact.status : "unchecked";
  const interval = intervalLabel(fact);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-[200px] flex-1">
          <p className="font-semibold">{fact.label}</p>
          {fact.value && <p className="text-body">{fact.value}</p>}
          {interval && <p className="text-body-sm">{interval}</p>}
          {fact.applies_to && <p className="text-caption text-muted-foreground">Applies to: {fact.applies_to}</p>}
          {fact.detail && <p className="mt-1 whitespace-pre-line text-body-sm text-muted-foreground">{fact.detail}</p>}
          <p className="mt-1 text-caption text-muted-foreground">
            {fact.source_link ? (
              <a href={fact.source_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                Source: {fact.source_name || hostOf(fact.source_link)}<ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : fact.source_name ? `Source: ${fact.source_name}` : "No source given"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusChip tone={FACT_STATUS[status].tone}>{FACT_STATUS[status].label}</StatusChip>
          {status !== "unchecked" && fact.checked_by && <span className="text-caption text-muted-foreground">{fact.checked_by}{fact.checked_at ? `, ${dateLabel(fact.checked_at)}` : ""}</span>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {status !== "checked" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onMark("checked")}><Check className="mr-1 h-4 w-4" />It's right</Button>}
        {status !== "wrong" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onMark("wrong")}><X className="mr-1 h-4 w-4" />It's wrong</Button>}
        {status !== "unchecked" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onMark("unchecked")} aria-label="Undo: mark not checked"><Undo2 className="mr-1 h-4 w-4" />Undo</Button>}
        <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
        {canDelete && <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${fact.label}`}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </li>
  );
}

function DocumentsPanel({ guide, documents, canDelete, onChange }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", kind: "owners_manual", notes: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState("");

  const upload = async () => {
    if (!file || !form.title.trim()) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast({ title: "That file is too big", description: "Up to 25 MB. Split a big manual into chapters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await base44.entities.GuideDocument.create({ guide_id: guide.id, title: form.title.trim(), kind: form.kind, notes: form.notes.trim(), file_uri, file_name: file.name });
      setForm({ title: "", kind: "owners_manual", notes: "" });
      setFile(null);
      await onChange();
    } catch (e) {
      toast({ title: "Couldn't add the document", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const openDoc = async (doc) => {
    setOpening(doc.id);
    // Opened in the click, before the link arrives, so pop-up blockers allow it.
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 300 });
      if (win) win.location.href = signed_url; else window.location.assign(signed_url);
    } catch (e) {
      win?.close();
      toast({ title: "Couldn't open the document", description: e?.message, variant: "destructive" });
    } finally {
      setOpening("");
    }
  };
  const remove = async (doc) => {
    if (!(await confirmAction({ title: "Delete this document?", description: doc.title }))) return;
    try { await base44.entities.GuideDocument.delete(doc.id); await onChange(); }
    catch (e) { toast({ title: "Couldn't delete the document", description: e?.message, variant: "destructive" }); }
  };

  return (
    <Panel title="Manuals & documents" icon={FileText} description="PDFs or photos you own (up to 25 MB each). Kept private: only administrators and mechanics can open them.">
      {documents.length > 0 && (
        <ul className="mb-4 divide-y divide-border">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold">{doc.title} <span className="font-normal text-muted-foreground">· {documentKindLabel(doc.kind)}</span></p>
                {doc.notes && <p className="text-body-sm text-muted-foreground">{doc.notes}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => openDoc(doc)} disabled={opening === doc.id}>Open</Button>
              {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(doc)} aria-label={`Delete ${doc.title}`}><Trash2 className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="doc-title">Title</Label><Input id="doc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Owner's manual 2017" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-kind">Kind</Label>
          <select id="doc-kind" className={SELECT} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {DOCUMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="doc-notes">What's in it (helps searching)</Label><Input id="doc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Maintenance schedule, fuses, tyre pressures" /></div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="doc-file">File</Label>
          <Input id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      </div>
      <Button className="mt-3" onClick={upload} disabled={saving || !file || !form.title.trim()}>
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}Add document
      </Button>
    </Panel>
  );
}

function FactDialog({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    setSaving(true);
    await onSave({ ...form, label: form.label.trim() });
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{initial.id ? "Edit fact" : "Add a fact"}</DialogTitle>
            <DialogDescription>{initial.id ? "Changing the answer marks it not checked again." : "Say where it came from, so the next person can check it."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fact-section">Section</Label>
            <select id="fact-section" className={SELECT} value={form.section} onChange={set("section")}>
              {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="fact-label">What it is</Label><Input id="fact-label" value={form.label} onChange={set("label")} placeholder="Engine oil with filter" required /></div>
          <div className="space-y-1.5"><Label htmlFor="fact-value">Answer</Label><Input id="fact-value" value={form.value} onChange={set("value")} placeholder="7.0 litres" /></div>
          <div className="space-y-1.5"><Label htmlFor="fact-applies">Only for (optional)</Label><Input id="fact-applies" value={form.applies_to} onChange={set("applies_to")} placeholder="2.5 diesel (2KD-FTV)" /></div>
          {form.section === "service" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="fact-km">Every … km</Label><Input id="fact-km" type="number" min="0" value={form.interval_km} onChange={set("interval_km")} /></div>
              <div className="space-y-1.5"><Label htmlFor="fact-months">or every … months</Label><Input id="fact-months" type="number" min="0" value={form.interval_months} onChange={set("interval_months")} /></div>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="fact-detail">More detail (optional)</Label><Textarea id="fact-detail" value={form.detail} onChange={set("detail")} rows={3} /></div>
          <div className="space-y-1.5"><Label htmlFor="fact-source">Source</Label><Input id="fact-source" value={form.source_name} onChange={set("source_name")} placeholder="Owner's manual, page 312" /></div>
          <div className="space-y-1.5"><Label htmlFor="fact-link">Source link (optional, https://)</Label><Input id="fact-link" type="url" value={form.source_link} onChange={set("source_link")} placeholder="https://" /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.label.trim()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuideDialog({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = form.make.trim() && form.model.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    const { id, make, model, generation, year_from, year_to, engines, market, summary } = form;
    await onSave({ ...(id ? { id } : {}), make, model, generation, year_from, year_to, engines, market, summary });
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{initial.id ? "Edit model page" : "New model page"}</DialogTitle>
            <DialogDescription>Buses of this make and model, in these years, are listed on the page.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="guide-make">Make</Label><Input id="guide-make" value={form.make} onChange={set("make")} placeholder="Toyota" required /></div>
            <div className="space-y-1.5"><Label htmlFor="guide-model">Model</Label><Input id="guide-model" value={form.model} onChange={set("model")} placeholder="Hiace" required /></div>
            <div className="space-y-1.5"><Label htmlFor="guide-from">From year</Label><Input id="guide-from" type="number" value={form.year_from} onChange={set("year_from")} /></div>
            <div className="space-y-1.5"><Label htmlFor="guide-to">To year</Label><Input id="guide-to" type="number" value={form.year_to} onChange={set("year_to")} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="guide-gen">Generation</Label><Input id="guide-gen" value={form.generation} onChange={set("generation")} placeholder="H200 (5th generation)" /></div>
          <div className="space-y-1.5"><Label htmlFor="guide-engines">Engines</Label><Input id="guide-engines" value={form.engines} onChange={set("engines")} placeholder="2.5 diesel (2KD-FTV), 3.0 diesel (1KD-FTV)" /></div>
          <div className="space-y-1.5"><Label htmlFor="guide-market">Market</Label><Input id="guide-market" value={form.market} onChange={set("market")} placeholder="General export (Caribbean)" /></div>
          <div className="space-y-1.5"><Label htmlFor="guide-summary">Summary</Label><Textarea id="guide-summary" value={form.summary} onChange={set("summary")} rows={3} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving || !ready}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
