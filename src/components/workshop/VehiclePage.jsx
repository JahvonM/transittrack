import React, { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { busRecordWarnings, checkedCounts, chunks, guideTitle, modelKey, yearsLabel } from "@/lib/busLibrary";
import { newGroups, parseDiagramIndex, progress, stockFor, stockIndex } from "@/lib/makerCatalogue";
import { pictureSource } from "@/lib/partDrawings";
import {
  catalogueCategories, catalogueName, categorySlug, embeddable, groupMatches, isToyotaDiagram, jpCarPartsLink, jpCarPartsModel,
  modelCodeFor, partsForGuide, pictureForGroup, stockSummary, torqueCounts,
} from "@/lib/workshop";
import { EditSheet, Field, Notice, ScreenBar, pluralize, useVehicleRoute } from "@/components/workshop/kit";
import TorqueSection from "@/components/workshop/TorqueSection";
import SpecsSection from "@/components/workshop/SpecsSection";
import ManualsSection from "@/components/workshop/ManualsSection";
import ModelPartsSection from "@/components/workshop/ModelParts";
import PhotosSection, { Thumb } from "@/components/workshop/Pictures";
import { CarSheet } from "@/components/workshop/Models";
import { JobsSection, TroubleshootingSection } from "@/components/workshop/JobSections";
import { jobsFor, knownProblems, openFaultsFor, pastFixes } from "@/lib/workshopJobs";
import { BookOpen, ClipboardList, ClipboardPaste, Copy, FileText, Hammer, Link2, MapPin, Package, Pencil, Search, Stethoscope, Wrench } from "lucide-react";

// A vehicle's page, laid out like a parts catalogue: the vehicle's details
// at the top; down the side its sections (torque values, specs & service,
// the parts that fit, photos, manuals, and the maker's own categories of
// diagrams, pasted in from Partsouq); and in the middle, the section's table
// or its diagrams as pictures to tap.

function VehicleInfo({ vehicle, guide, modelCode }) {
  const { toast } = useToast();
  const { isAdmin } = useVehicleRoute();
  const [editing, setEditing] = useState(false);
  const r = vehicle.record;
  const vin = String(r.vin || "").trim();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vin);
      toast({ title: "Chassis number copied", description: "Paste it into Partsouq's search to find this vehicle's own diagrams." });
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser didn't allow copying.", variant: "destructive" });
    }
  };
  const rows = [
    ["Model", vehicle.model],
    ["Model page", guide ? `${guideTitle(guide)}${guide.generation ? ` ${guide.generation}` : ""} (${yearsLabel(guide)})` : "None yet"],
    ["Engine", vehicle.engine],
    ["Gearbox", vehicle.transmission],
    ["Model code", modelCode],
    ["Plate", r.plate_number],
  ].filter(([, v]) => v);
  return (
    <section aria-label="Vehicle details" className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="truncate text-body">{value}</dd>
          </div>
        ))}
        {vin && (
          <div className="min-w-0">
            <dt className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Chassis number</dt>
            <dd className="flex items-center gap-1">
              <span className="truncate font-mono text-body">{vin}</span>
              <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={copy} aria-label="Copy the chassis number"><Copy className="h-4 w-4" /></Button>
            </dd>
          </div>
        )}
      </dl>
      {vehicle.kind === "car" && isAdmin && (
        <Button variant="outline" className="mt-3 h-11 rounded-lg" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit car</Button>
      )}
      {editing && <CarSheet editing={r} onClose={() => setEditing(false)} />}
    </section>
  );
}

function CategoryNav({ items, active }) {
  return (
    <nav aria-label="Catalogue" className="hidden md:block">
      <ul className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {items.map((item) => (
          <li key={item.key} className="border-b border-border last:border-b-0">
            <Link
              to={item.to} aria-current={active === item.key ? "page" : undefined}
              className={`flex min-h-[48px] items-center gap-2 border-l-4 px-3 py-2 text-body-sm ${active === item.key ? "border-primary bg-accent font-semibold text-primary" : "border-transparent text-foreground hover:bg-muted"}`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{item.label}</span>
              <span className="text-caption tabular-nums text-muted-foreground">{item.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PasteDiagrams({ vehicle, guide, existing, modelCode, onClose }) {
  const { toast } = useToast();
  const { reload } = useVehicleRoute();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [code, setCode] = useState(modelCode || "");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseDiagramIndex(text), [text]);
  const fresh = newGroups(parsed, existing, { guideId: guide.id, vehicleId: vehicle.id, modelCode: code.trim() });
  const categories = [...new Set(parsed.map((g) => g.category || "Other"))];
  const save = async () => {
    setSaving(true);
    try {
      for (const batch of chunks(fresh)) await base44.entities.CatalogueGroup.bulkCreate(batch);
      toast({ title: `${pluralize(fresh.length, "diagram")} added` });
      await reload();
      onClose();
      navigate(`/workshop/${vehicle.kind}/${vehicle.id}/c/${categorySlug(fresh[0].category || "Other")}`);
    } catch (e) {
      toast({ title: "Couldn't add the diagrams", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };
  return (
    <EditSheet
      open onClose={onClose} saving={saving} onSave={save} saveLabel={fresh.length ? `Add ${fresh.length}` : "Add"}
      problem={!parsed.length ? (text.trim() ? "No diagrams found in that text." : "Paste the list of diagrams, copied from Partsouq.") : !fresh.length ? "Those diagrams are already here." : ""}
      title="Add the maker's diagrams" description={guideTitle(guide)}
    >
      <p className="text-body-sm text-muted-foreground">On Partsouq, look {vehicle.name} up by its chassis number, open a category (like Engine / Fuel / Tool), select the list of diagrams, copy it and paste it here. Do the same for each category.</p>
      <Field id="dia-text" label="Copied text">
        <Textarea id="dia-text" rows={8} className="font-mono text-body-sm md:text-body-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Engine / Fuel / Tool\n1502 OIL FILTER\n2302 FUEL FILTER"} />
      </Field>
      {parsed.length > 0 && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-body-sm">Found {pluralize(parsed.length, "diagram")} in {categories.join(", ")}. {fresh.length} new.</p>}
      <Field id="dia-code" label="Model code (optional)" hint="As Partsouq shows it for this vehicle, e.g. KDH212R-JEMDY.">
        <Input id="dia-code" className="h-12 font-mono text-body md:text-body" value={code} onChange={(e) => setCode(e.target.value)} maxLength={60} />
      </Field>
    </EditSheet>
  );
}

// Every Toyota diagram in a category linked to JP-CarParts in one paste: the
// address of the model's list of diagrams there gives each diagram's own
// address, by Toyota's diagram number. Diagrams that already have a link
// keep it.
function LinkJpCarParts({ groups, onClose }) {
  const { toast } = useToast();
  const { put } = useVehicleRoute();
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const model = jpCarPartsModel(address);
  const toyota = groups.filter((g) => isToyotaDiagram(g.code));
  const fresh = toyota.filter((g) => !String(g.link || "").trim());
  const kept = toyota.length - fresh.length;
  const problem = !address.trim() ? "Paste the address of your model's list of diagrams on JP-CarParts."
    : !model ? "That isn't a Toyota model's list of diagrams on JP-CarParts: its address has figlist.php and a model code."
    : !fresh.length ? "Every diagram here already has a link." : "";
  const save = async () => {
    setSaving(true);
    try {
      for (const batch of chunks(fresh, 5)) {
        const saved = await Promise.all(batch.map((g) => base44.entities.CatalogueGroup.update(g.id, { link: jpCarPartsLink(address, g.code) })));
        saved.forEach((g) => put("groups", g));
      }
      toast({ title: `${pluralize(fresh.length, "diagram")} linked to JP-CarParts`, description: `Model ${model}. Open one to see the maker's diagram beside its parts.` });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't link them all", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };
  return (
    <EditSheet open onClose={onClose} saving={saving} problem={problem} onSave={save} saveLabel={fresh.length && model ? `Link ${fresh.length}` : "Link"} title="Link to JP-CarParts" description="The maker's diagrams, shown inside the Workshop">
      <p className="text-body-sm text-muted-foreground">
        On jp-carparts.com, open Toyota, then your model (the Hiace H200 is HIACE/REGIUSACE), then the model code closest to your bus. Copy that page's address and paste it here. JP-CarParts lists Japanese-market models, so check part numbers against your own list.
      </p>
      <Field id="jp-address" label="JP-CarParts address of your model's list of diagrams">
        <Input id="jp-address" type="url" className="h-12 text-body md:text-body" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://jp-carparts.com/toyota/figlist.php?maker=toyota&…" />
      </Field>
      {model && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-body-sm">
          Model {model}: links {pluralize(fresh.length, "diagram")} that {fresh.length === 1 ? "has" : "have"} no link yet{kept ? `; ${kept} already linked stay as they are` : ""}.
        </p>
      )}
    </EditSheet>
  );
}

function CategorySection({ name, groups, base }) {
  const { diagrams, parts, guide } = useVehicleRoute();
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState(false);
  const canLink = modelKey(guide?.make) === "toyota" && groups.some((g) => isToyotaDiagram(g.code));
  const shelf = useMemo(() => stockIndex(parts), [parts]);
  const shown = groups.filter((g) => groupMatches(g, query));
  const done = progress(groups);
  return (
    <section aria-labelledby="cat-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="cat-title" className="text-title-sm font-semibold">{name}</h3>
          <p className="text-body-sm text-muted-foreground">{pluralize(groups.length, "diagram")} · parts pasted for {done.done}</p>
        </div>
        {canLink && (
          <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setLinking(true)}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Link to JP-CarParts</Button>
        )}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter diagrams" aria-label="Filter diagrams" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-body text-muted-foreground">Nothing matches.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((g) => {
            const picture = pictureForGroup(g, diagrams);
            const listed = (g.parts || []).length;
            const inStock = (g.parts || []).filter((p) => stockFor(p, shelf).length).length;
            return (
              <li key={g.id}>
                <Link to={`${base}/group/${g.id}`} className="block h-full overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-primary">
                  <Thumb source={picture ? pictureSource(picture) : null} code={g.code} />
                  <span className="block p-3">
                    <span className="block text-body-sm font-semibold"><span className="font-mono text-primary">{g.code}</span> {g.title}</span>
                    <span className="block text-caption text-muted-foreground">{listed ? `${pluralize(listed, "part")}${inStock ? `, ${inStock} in stock` : ""}` : "No parts yet"}</span>
                    {!picture && embeddable(g.link) && <span className="block text-caption font-semibold text-primary">Maker's diagram on {catalogueName(g.link)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {linking && <LinkJpCarParts groups={groups} onClose={() => setLinking(false)} />}
    </section>
  );
}

// A vehicle's Jobs and Troubleshooting, with or without a model page.
function workItems({ vehicle, guide, base, jobs, jobParts, faults, facts }) {
  const mine = jobsFor(jobs, vehicle);
  const open = mine.filter((j) => j.status !== "done").length;
  const faulty = openFaultsFor(faults, vehicle).length;
  const known = knownProblems(facts, guide?.id).length + pastFixes(jobs, jobParts, { guideId: guide?.id || "", vehicle }).length;
  return [
    { key: "jobs", label: "Jobs", count: mine.length, to: `${base}/jobs`, icon: Hammer, hint: [open ? `${open} open` : "", faulty ? pluralize(faulty, "open fault") : ""].filter(Boolean).join(" · ") || "Work done and the parts used" },
    { key: "troubleshooting", label: "Troubleshooting", count: known, to: `${base}/troubleshooting`, icon: Stethoscope, hint: "Known problems and past fixes" },
  ];
}

function SectionLinks({ items }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key}>
          <Link to={item.to} className="flex h-full min-h-[5.5rem] items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><item.icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-primary">{item.label} <span className="font-normal tabular-nums text-muted-foreground">({item.count})</span></span>
              <span className="block text-body-sm text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function VehiclePage({ section }) {
  const { category: slug } = useParams();
  const { vehicle, guide, base, kind, specs, diagrams, groups, facts, documents, parts, jobs, jobParts, faults, isAdmin } = useVehicleRoute();
  const [pasting, setPasting] = useState(false);
  const mine = useMemo(() => (guide ? groups.filter((g) => g.guide_id === guide.id) : []), [groups, guide]);
  const categories = useMemo(() => catalogueCategories(mine), [mine]);

  if (!vehicle) return <Navigate to="/workshop" replace />;
  const modelCode = modelCodeFor(vehicle, mine);
  const warnings = kind === "bus" ? busRecordWarnings(vehicle.record) : [];

  // Jobs and past fixes belong to the vehicle, so they work without a model page.
  const work = workItems({ vehicle, guide, base, jobs, jobParts, faults, facts });
  if (!guide) {
    const job = work.find((i) => i.key === section);
    if (job) {
      return (
        <>
          <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { to: base, label: vehicle.name }, { label: job.label }]} title={vehicle.name} subtitle={vehicle.model} />
          {section === "jobs" ? <JobsSection vehicle={vehicle} /> : <TroubleshootingSection vehicle={vehicle} guide={null} base={base} />}
        </>
      );
    }
    return (
      <>
        <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: vehicle.name }]} title={vehicle.name} subtitle={vehicle.model} />
        <VehicleInfo vehicle={vehicle} guide={null} modelCode="" />
        <div className="mb-4"><SectionLinks items={work} /></div>
        <Notice tone="warning" action={isAdmin ? <Button asChild variant="outline" className="h-12 rounded-lg bg-card"><Link to="/workshop/models">Models</Link></Button> : null}>
          <p className="font-semibold">No model page covers this {kind} yet.</p>
          <p className="text-muted-foreground">
            Torque values, photos and the maker's diagrams belong to a model page for its make, model and year ({vehicle.model || "not recorded"}).
            {isAdmin ? " Add one in Models." : " Ask an administrator to add one."}
          </p>
        </Notice>
      </>
    );
  }

  const torque = torqueCounts(specs.filter((s) => s.guide_id === guide.id));
  const library = checkedCounts(facts.filter((f) => f.guide_id === guide.id));
  const fitting = stockSummary(partsForGuide(parts, guide.id));
  const manuals = documents.filter((d) => d.guide_id === guide.id).length;
  const pictures = diagrams.filter((d) => d.guide_id === guide.id).length;
  const items = [
    { key: "torque", label: "Torque values", count: torque.total, to: `${base}/torque`, icon: Wrench, hint: torque.unchecked ? `${torque.unchecked} not checked` : "How tight each bolt goes" },
    { key: "specs", label: "Specs & service", count: library.total, to: `${base}/specs`, icon: ClipboardList, hint: library.unchecked ? `${library.unchecked} not checked` : "Oils, tyres, service schedule" },
    { key: "parts", label: "Parts that fit", count: fitting.total, to: `${base}/parts`, icon: Package, hint: fitting.low ? `${fitting.low} low or out` : "From your shelves" },
    { key: "maps", label: "Photos & bolt maps", count: pictures, to: `${base}/maps`, icon: MapPin, hint: "Numbered pins on your own photos" },
    { key: "manuals", label: "Manuals", count: manuals, to: `${base}/manuals`, icon: FileText, hint: "Owner's and workshop manuals" },
    ...work,
    ...[...categories].map(([name, list]) => ({ key: `c:${categorySlug(name)}`, name, label: name, count: list.length, to: `${base}/c/${categorySlug(name)}`, icon: BookOpen, hint: `Maker's diagrams · parts pasted for ${progress(list).done}` })),
  ];
  const current = section === "category" ? items.find((i) => i.key === `c:${slug}`) : items.find((i) => i.key === section);
  if (section === "category" && !current) return <Navigate to={base} replace />;

  const crumbs = [{ to: "/workshop", label: "Workshop" }, { to: base, label: vehicle.name }, ...(current ? [{ label: current.label }] : [])];
  const pasteButton = (
    <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setPasting(true)}><ClipboardPaste className="mr-1.5 h-4 w-4" aria-hidden="true" />Add the maker's diagrams</Button>
  );

  return (
    <>
      <ScreenBar crumbs={crumbs} title={vehicle.name} subtitle={[vehicle.model, modelCode, vehicle.engine].filter(Boolean).join(" · ")}>
        {!current && pasteButton}
      </ScreenBar>
      {!current && <VehicleInfo vehicle={vehicle} guide={guide} modelCode={modelCode} />}
      {!current && warnings.length > 0 && <Notice tone="warning"><ul className="list-disc space-y-0.5 pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}

      <div className={current ? "md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-5" : ""}>
        {current && <CategoryNav items={items} active={current.key} />}
        <div className="min-w-0">
          {!current && (
            <section aria-label="Sections">
              <SectionLinks items={items} />
              {categories.size === 0 && (
                <p className="mt-4 text-body-sm text-muted-foreground">No maker's diagrams yet: tap Add the maker's diagrams and paste the list from Partsouq.</p>
              )}
            </section>
          )}
          {section === "torque" && <TorqueSection kind={kind} guide={guide} />}
          {section === "specs" && <SpecsSection kind={kind} guide={guide} />}
          {section === "parts" && <ModelPartsSection kind={kind} guide={guide} />}
          {section === "manuals" && <ManualsSection guide={guide} />}
          {section === "maps" && <PhotosSection guide={guide} base={base} />}
          {section === "category" && <CategorySection name={current.name} groups={categories.get(current.name)} base={base} />}
          {section === "jobs" && <JobsSection vehicle={vehicle} />}
          {section === "troubleshooting" && <TroubleshootingSection vehicle={vehicle} guide={guide} base={base} />}
        </div>
      </div>
      {pasting && <PasteDiagrams vehicle={vehicle} guide={guide} existing={mine} modelCode={modelCode} onClose={() => setPasting(false)} />}
    </>
  );
}
