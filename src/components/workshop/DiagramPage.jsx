import React, { useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { groupLabel, parsePartsList, stockFor, stockIndex } from "@/lib/makerCatalogue";
import { pictureSource } from "@/lib/partDrawings";
import { inStockReplacements, nextPinNumber, pinPlace, stockLevel } from "@/lib/partsCatalogue";
import { catalogueName, categorySlug, diagramRows, embeddable, ftLb, linkHost, nmText, pictureForGroup, pinKey, pinLabel } from "@/lib/workshop";
import { EditSheet, Field, ScreenBar, pluralize, useVehicleRoute } from "@/components/workshop/kit";
import { PictureSheet, PinSheet, pinSummary, uploadPhoto } from "@/components/workshop/Pictures";
import { Camera, Check, ClipboardPaste, Copy, ExternalLink, Loader2, MapPin, Maximize2, Pencil, Plus, ZoomIn, ZoomOut } from "lucide-react";

// One diagram, laid out like a parts catalogue: the picture with its
// numbered callouts on one side, the table of parts on the other. Tap a
// number and its row lights up; tap a row and its number does. A maker's
// diagram (pasted from Partsouq) lists the maker's parts, with what's on the
// shelf; on a photo, a pinned part opens its page and, when it is low or
// out, names the replacement on the shelf. The picture is the team's own
// photo of that area, as the maker's drawing itself is not kept. A catalogue
// site that allows it (JP-CarParts) shows its own diagram page here, beside
// the table, under "Maker's diagram"; others open in a new tab.

const ZOOMS = [1, 1.5, 2, 3];
const isHttps = (link) => /^https:\/\/\S+$/i.test(link);

// The diagram's own sheet: paste its table of parts and its page's address.
// An administrator can delete the diagram here; a photo linked to it stays,
// unlinked, under Photos & bolt maps.
function PasteParts({ group, onClose, onDeleted }) {
  const { toast } = useToast();
  const { put, drop, diagrams, isAdmin } = useVehicleRoute();
  const [text, setText] = useState("");
  const [link, setLink] = useState(group.link || "");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parsePartsList(text), [text]);
  const linkChanged = link.trim() !== (group.link || "");
  const problem = link.trim() && !isHttps(link.trim()) ? "The link must start with https://"
    : !parsed.length && !linkChanged ? (text.trim() ? "No part numbers found in that text." : "Paste the diagram's table of parts, copied from Partsouq.") : "";
  const save = async () => {
    setSaving(true);
    try {
      const data = { link: link.trim() };
      if (parsed.length) data.parts = parsed;
      put("groups", await base44.entities.CatalogueGroup.update(group.id, data));
      toast({ title: parsed.length ? `${pluralize(parsed.length, "part")} saved` : "Link saved" });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the parts", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      for (const photo of diagrams.filter((d) => d.catalogue_group_id === group.id)) {
        put("diagrams", await base44.entities.PartDiagram.update(photo.id, { catalogue_group_id: "" }));
      }
      await base44.entities.CatalogueGroup.delete(group.id);
      drop("groups", group.id);
      toast({ title: `${groupLabel(group)} deleted` });
      onClose();
      onDeleted();
    } catch (e) {
      toast({ title: "Couldn't delete the diagram", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };
  return (
    <EditSheet
      open onClose={onClose} saving={saving} problem={problem} onSave={save} title="Paste parts" description={groupLabel(group)}
      onDelete={isAdmin ? remove : undefined} deleteLabel="Delete this diagram"
    >
      <p className="text-body-sm text-muted-foreground">On Partsouq or JP-CarParts, open this diagram, select its table of parts, copy it, and paste it here. {(group.parts || []).length ? "It replaces the parts listed now." : ""}</p>
      <Field id="paste-text" label="Copied text">
        <Textarea id="paste-text" rows={8} className="font-mono text-body-sm md:text-body-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"No.  Part number  Name  Qty\n15601  90915-YZZD2  ELEMENT KIT, OIL FILTER  1"} />
      </Field>
      {parsed.length > 0 && (
        <div role="status" className="rounded-lg border border-border bg-muted p-3 text-body-sm">
          <p className="font-semibold">Found {pluralize(parsed.length, "part")}.</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {parsed.slice(0, 4).map((p, i) => <li key={i}><span className="font-mono">{p.ref || "—"}</span> · <span className="font-mono">{p.number}</span> {p.name}</li>)}
            {parsed.length > 4 && <li>…and {parsed.length - 4} more</li>}
          </ul>
        </div>
      )}
      <Field id="paste-link" label="This diagram's page (optional)" hint="Copy the address of the diagram's page. A JP-CarParts address shows inside the Workshop; others open in a new tab.">
        <Input id="paste-link" type="url" className="h-12 text-body md:text-body" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://partsouq.com/…" />
      </Field>
    </EditSheet>
  );
}

function PhotoButton({ onFile, busy, label, variant = "primary", vehicleName, title }) {
  return (
    <label className={`inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg px-4 text-body font-semibold ${variant === "primary" ? "bg-primary text-primary-foreground" : "border border-input bg-card text-foreground"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
      {busy ? "Adding the photo…" : label}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} disabled={busy} aria-label={`Take a photo of ${title} on ${vehicleName}`} />
    </label>
  );
}

export default function DiagramPage({ mode }) {
  const { diagramId, groupId } = useParams();
  const { vehicle, guide, base, diagrams, groups, specs, parts, interchanges, guides, put, reload } = useVehicleRoute();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(null); // the pin sheet: { pin, isNew }
  const [details, setDetails] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [adding, setAdding] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState(null); // "photo" or "maker"; at first, the photo if there is one
  const boxRef = useRef(null);
  const imageRef = useRef(null);
  const rowRefs = useRef(new Map());
  const specById = useMemo(() => new Map(specs.map((s) => [s.id, s])), [specs]);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const shelf = useMemo(() => stockIndex(parts), [parts]);

  let group = null;
  let picture = null;
  if (mode === "group") {
    group = groups.find((g) => g.id === groupId) || null;
    picture = pictureForGroup(group, diagrams);
  } else {
    picture = diagrams.find((d) => d.id === diagramId) || null;
    group = picture?.catalogue_group_id ? groups.find((g) => g.id === picture.catalogue_group_id) || null : null;
  }

  if (!vehicle) return <Navigate to="/workshop" replace />;
  if (!guide) return <Navigate to={base} replace />;
  if (mode === "group" && group?.guide_id !== guide.id) return <Navigate to={base} replace />;
  if (mode === "picture" && picture?.guide_id !== guide.id) return <Navigate to={`${base}/maps`} replace />;

  const pins = picture?.pins || [];
  const source = picture ? pictureSource(picture) : null;
  const rows = diagramRows({ group, pins });
  const title = group ? groupLabel(group) : picture.title;
  const link = group?.link || picture?.catalogue_link || "";
  const site = catalogueName(link);
  // The maker's own diagram page, shown from its site, when the site allows it.
  const inside = embeddable(link);
  const showing = inside && !editing ? view || (source && !source.isDrawing ? "photo" : "maker") : "photo";
  const category = group ? String(group.category || "").trim() || "Other" : "";
  const crumbs = [
    { to: "/workshop", label: "Workshop" },
    { to: base, label: vehicle.name },
    group ? { to: `${base}/c/${categorySlug(category)}`, label: category } : { to: `${base}/maps`, label: "Photos & bolt maps" },
    { label: group ? group.code : picture.title },
  ];

  // Tap a number: its row lights up and comes into view. Tap a row: its
  // number does, and the picture scrolls to it.
  const choosePin = (pin) => {
    const key = pinKey(pin, !!group);
    setSelected(key);
    rowRefs.current.get(key)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  const chooseRow = (row) => {
    setSelected(row.key);
    const pin = row.pins[0];
    const box = boxRef.current;
    if (!pin || !box) return;
    const inner = box.firstElementChild;
    box.scrollTo?.({ left: pin.x * inner.offsetWidth - box.clientWidth / 2, top: pin.y * inner.offsetHeight - box.clientHeight / 2, behavior: "smooth" });
    box.closest("section")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  const savePins = async (next) => {
    setSaving(true);
    try {
      put("diagrams", await base44.entities.PartDiagram.update(picture.id, { pins: next }));
      setOpen(null);
    } catch (e) {
      toast({ title: "Couldn't save the pin", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const place = (e) => {
    if (!editing || !imageRef.current) return;
    const at = pinPlace(e.clientX, e.clientY, imageRef.current.getBoundingClientRect());
    setOpen({ pin: { n: nextPinNumber(pins), ...at, ref: "", part_id: "", torque_id: "", label: "" }, isNew: true });
  };

  // A photo of this area on the vehicle itself, straight from the camera. On
  // a maker's diagram with no picture yet, it makes the picture.
  const takePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const image_url = await uploadPhoto(file);
      if (picture) {
        put("diagrams", await base44.entities.PartDiagram.update(picture.id, { image_url }));
      } else {
        const order = diagrams.filter((d) => d.guide_id === guide.id).reduce((max, d) => Math.max(max, Number(d.sort_order) || 0), 0) + 10;
        put("diagrams", await base44.entities.PartDiagram.create({
          guide_id: guide.id, title: groupLabel(group), system: category, catalogue_group_id: group.id, catalogue_link: group.link || "", image_url, pins: [], sort_order: order,
        }));
      }
      toast({ title: "Photo added", description: pins.length ? "The pins were placed on the drawing: check them with Edit pins." : "Now put numbers on it with Edit pins." });
    } catch (err) {
      toast({ title: "Couldn't add the photo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const torqueOf = (row) => row.pins.map((p) => specById.get(p.torque_id)).find(Boolean) || null;
  const zoomIndex = ZOOMS.indexOf(zoom);
  const vin = String(vehicle.record?.vin || "").trim();
  const copyVin = async () => {
    try {
      await navigator.clipboard.writeText(vin);
      toast({ title: "Chassis number copied", description: "Paste it into the catalogue's search to find this vehicle's own diagrams." });
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser didn't allow copying. The chassis number is on the vehicle's page.", variant: "destructive" });
    }
  };

  return (
    <>
      <ScreenBar crumbs={crumbs} title={title} subtitle={group ? [group.detail, pluralize((group.parts || []).length, "part"), picture && pinSummary(pins)].filter(Boolean).join(" · ") : [picture.system, pinSummary(pins)].filter(Boolean).join(" · ")}>
        {editing ? (
          <Button className="h-12 rounded-lg text-body" onClick={() => setEditing(false)}><Check className="mr-1.5 h-5 w-5" aria-hidden="true" />Done</Button>
        ) : (
          <>
            {link && (
              <Button asChild variant="outline" className="h-12 rounded-lg bg-card text-body">
                <a href={link} target="_blank" rel="noopener noreferrer">Open on {site}<ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" /></a>
              </Button>
            )}
            {group && <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setPasting(true)}><ClipboardPaste className="mr-1.5 h-4 w-4" aria-hidden="true" />Paste parts</Button>}
            {picture && <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setDetails(true)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Picture</Button>}
            {picture && <Button className="h-12 rounded-lg text-body" onClick={() => setEditing(true)} disabled={!source}><MapPin className="mr-1.5 h-5 w-5" aria-hidden="true" />Edit pins</Button>}
          </>
        )}
      </ScreenBar>

      {/* The picture's notes: how to find this area's diagram, what to check.
          The maker's catalogue finds a vehicle by its chassis number. */}
      {picture?.notes && !editing && (
        <section aria-label="Notes" className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-body-sm shadow-sm">
          <p className="whitespace-pre-line">{picture.notes}</p>
          {vin && (
            <Button variant="outline" className="mt-2 h-11 rounded-lg bg-card" onClick={copyVin}>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />Copy {vehicle.name}'s chassis number
            </Button>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <section aria-label="Picture" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:sticky lg:top-3">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
            {inside && !editing ? (
              <div role="group" aria-label="Show" className="flex flex-1 flex-wrap gap-1">
                {[["photo", "Your photo"], ["maker", "Maker's diagram"]].map(([id, label]) => (
                  <button
                    key={id} type="button" aria-pressed={showing === id} onClick={() => setView(id)}
                    className={`h-10 rounded-md px-3 text-body-sm font-semibold ${showing === id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-card"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex-1 text-body-sm font-semibold">{!source ? "No photo yet" : source.isDrawing ? "Guide drawing (generic)" : "Photo"}</span>
            )}
            {source && showing === "photo" && (
              <span className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Zoom out" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[zoomIndex - 1])}><ZoomOut className="h-5 w-5" /></Button>
                <span className="w-12 text-center text-caption tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Zoom in" disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zoomIndex + 1])}><ZoomIn className="h-5 w-5" /></Button>
                <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Fit the picture" disabled={zoom === 1} onClick={() => setZoom(1)}><Maximize2 className="h-4 w-4" /></Button>
              </span>
            )}
          </div>
          {editing && <p className="border-b border-border bg-accent px-3 py-2 text-body-sm font-semibold">Tap the picture where a part is to add a number. Tap a number to change it.</p>}
          {showing === "maker" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent px-3 py-2 text-body-sm">
                <p className="min-w-[180px] flex-1">
                  The maker's diagram, shown from {site}.{linkHost(link) === "jp-carparts.com" ? " It's the Japanese-market version: check the numbers against the list beside it." : ""}
                </p>
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1 font-semibold text-primary hover:underline">
                  Open in a new tab<ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              {/* The site's own page, loaded from the site: nothing is copied into the app. */}
              <iframe
                title={`${title} on ${site}`} src={link} loading="lazy" referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                className="block h-[72dvh] w-full border-0 bg-white"
              />
            </>
          ) : (
          <>
          {!editing && source?.isDrawing && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-warning/10 px-3 py-2">
              <p className="min-w-[180px] flex-1 text-body-sm">This is a generic guide drawing, not your vehicle. Photograph this area on {vehicle.name} to put the numbers on the real thing.</p>
              <PhotoButton onFile={takePhoto} busy={uploading} label="Take a photo" vehicleName={vehicle.name} title={title} />
            </div>
          )}
          {source ? (
            <div ref={boxRef} className="max-h-[72dvh] overflow-auto">
              <div className={`relative select-none ${source.isDrawing ? "bg-white" : ""}`} style={{ width: `${zoom * 100}%` }}>
                {/* Numbers are placed by tapping the picture; each is also a button, and its row is in the table. */}
                <img ref={imageRef} src={source.url} alt={source.isDrawing ? `${title}: guide drawing` : title} onClick={place} className={editing ? "block w-full cursor-crosshair" : "block w-full"} draggable={false} />
                {pins.map((pin) => {
                  const key = pinKey(pin, !!group);
                  const on = selected === key;
                  return (
                    <button
                      key={pin.n} type="button"
                      onClick={(e) => { e.stopPropagation(); if (editing) setOpen({ pin, isNew: false }); else choosePin(pin); }}
                      aria-label={`Number ${pinLabel(pin)}`} aria-pressed={on}
                      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                      className={`absolute grid h-9 min-w-[2.25rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2 px-1.5 font-mono text-body-sm font-bold shadow-md transition-transform ${on ? "z-10 scale-110 border-primary bg-primary text-primary-foreground ring-4 ring-primary/30" : "border-primary bg-white text-primary"}`}
                    >
                      {pinLabel(pin)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[16rem] place-items-center p-6 text-center">
              <div className="max-w-sm space-y-3">
                <Camera className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="text-body font-semibold">No photo of this diagram yet</p>
                <p className="text-body-sm text-muted-foreground">{link ? `The maker's own drawing opens on ${site}.` : "The maker's own drawing is on its catalogue site."} Photograph this area on {vehicle.name} and put the maker's numbers on your photo.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <PhotoButton onFile={takePhoto} busy={uploading} label="Take a photo" vehicleName={vehicle.name} title={title} />
                  {link && <Button asChild variant="outline" className="h-12 rounded-lg"><a href={link} target="_blank" rel="noopener noreferrer">Open on {site}<ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" /></a></Button>}
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </section>

        <section aria-label={group ? "Parts on this diagram" : "Numbers on this picture"} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[4rem_minmax(0,1fr)_2.75rem_auto] gap-x-3 border-b border-border bg-muted px-3 py-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
            <span>No.</span><span>{group ? "Part" : "Bolt / part"}</span><span className="text-right">{group ? "Qty" : ""}</span><span className="text-right">{group ? "In stock" : "Torque"}</span>
          </div>
          {rows.length === 0 ? (
            <div className="space-y-3 p-4 text-body-sm text-muted-foreground">
              {group ? (
                <>
                  <p>No parts listed for this diagram yet. On Partsouq or JP-CarParts, open it, copy its table of parts and tap Paste parts.</p>
                  <Button variant="outline" className="h-12 rounded-lg" onClick={() => setPasting(true)}><ClipboardPaste className="mr-1.5 h-4 w-4" aria-hidden="true" />Paste parts</Button>
                </>
              ) : <p>No numbers on this picture yet. Tap Edit pins, then tap the picture where a bolt or part is.</p>}
            </div>
          ) : (
            <ul className="max-h-[72dvh] divide-y divide-border overflow-y-auto">
              {rows.map((row, i) => {
                const on = selected === row.key;
                const torque = torqueOf(row);
                const pin = row.pins[0];
                const stockPart = group ? null : partById.get(pin?.part_id);
                const onShelf = group ? stockFor(row.part, shelf) : [];
                const name = group ? row.part.name || "—" : torque?.item || stockPart?.part_name || pin?.label || "Nothing linked yet";
                const spare = stockPart && stockLevel(stockPart) !== "ok" ? inStockReplacements(stockPart, parts, interchanges) : [];
                return (
                  <li key={`${row.key}-${i}`} ref={(el) => { if (el && rows.findIndex((r) => r.key === row.key) === i) rowRefs.current.set(row.key, el); }} className={`grid grid-cols-[minmax(0,1fr)_2.75rem_auto] items-center gap-x-3 px-3 py-2 ${on ? "bg-accent shadow-[inset_4px_0_0_hsl(var(--primary))]" : ""}`}>
                    <button type="button" onClick={() => chooseRow(row)} aria-pressed={on} className="grid min-h-[44px] grid-cols-[4rem_minmax(0,1fr)] gap-x-3 text-left">
                      <span className={`font-mono text-body-sm font-bold ${row.pins.length ? "text-primary" : "text-muted-foreground"}`}>{row.ref || "—"}</span>
                      <span className="min-w-0">
                        {group && <span className="block font-mono text-body-sm font-semibold">{row.part.number}</span>}
                        <span className={`block text-body-sm ${group ? "" : "font-semibold"}`}>{name}</span>
                        {group && row.part.info && <span className="block text-caption text-muted-foreground">{row.part.info}</span>}
                        {!group && stockPart && <span className="block text-caption text-muted-foreground">{[stockPart.oem_number, stockPart.bin_location].filter(Boolean).join(" · ")}</span>}
                        {torque && (group || stockPart) && <span className="block text-caption font-semibold text-foreground">Torque {nmText(torque.nm)} N·m{ftLb(torque.nm) ? ` (${ftLb(torque.nm)} ft·lb)` : ""}{torque.stages ? ` · ${torque.stages}` : ""}{torque.new_bolt ? " · new bolt" : ""}</span>}
                      </span>
                    </button>
                    <span className="text-right text-body-sm tabular-nums">{group ? row.part.qty || "" : ""}</span>
                    <span className="flex flex-wrap items-center justify-end gap-1">
                      {group ? (
                        onShelf.length
                          ? onShelf.map((p) => <StockChip key={p.id} part={p} />)
                          : <Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setAdding({ number: row.part.number, name: row.part.name, kind: "genuine", guide_ids: [guide.id] })} aria-label={`Add ${row.part.number} to stock`}><Plus className="mr-0.5 h-4 w-4" aria-hidden="true" />Add</Button>
                      ) : torque && nmText(torque.nm) ? (
                        <span className="text-right leading-tight"><span className="block text-title-sm font-bold tabular-nums">{nmText(torque.nm)} <span className="text-caption font-semibold">N·m</span></span><span className="block text-caption text-muted-foreground">{ftLb(torque.nm)} ft·lb</span></span>
                      ) : stockPart ? <StockChip part={stockPart} /> : null}
                    </span>
                    {stockPart && (
                      <p className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 pl-[4.75rem] text-caption">
                        {spare.length > 0 && <span className="font-medium">Replacement on the shelf: {spare.map(({ part: other }) => `${other.part_name} (${[other.quantity_in_stock, other.bin_location].filter(Boolean).join(", ")})`).join("; ")}</span>}
                        <Link to={`/workshop/parts/${stockPart.id}`} aria-label={`Open the part: ${stockPart.part_name}`} className="inline-flex min-h-[2rem] items-center font-medium text-primary underline underline-offset-2">Open the part</Link>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {open && (
        <PinSheet
          key={`${open.pin.n}-${open.isNew}`} pin={open.pin} isNew={open.isNew} guide={guide} group={group} saving={saving}
          onClose={() => setOpen(null)}
          onSave={(pin) => savePins(open.isNew ? [...pins, pin] : pins.map((p) => (p.n === pin.n ? pin : p)))}
          onRemove={() => savePins(pins.filter((p) => p.n !== open.pin.n))}
        />
      )}
      {details && <PictureSheet editing={picture} guide={guide} onClose={() => setDetails(false)} onDeleted={() => navigate(group ? `${base}/group/${group.id}` : `${base}/maps`, { replace: true })} />}
      {pasting && group && <PasteParts group={group} onClose={() => setPasting(false)} onDeleted={() => navigate(`${base}/c/${categorySlug(category)}`, { replace: true })} />}
      <QuickAddPart open={!!adding} onOpenChange={(o) => !o && setAdding(null)} parts={parts} guides={guides} initial={adding || undefined} onSaved={reload} />
    </>
  );
}
