import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel, StatusChip } from "@/components/admin/kit";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { chunks } from "@/lib/busLibrary";
import {
  byCategory, groupLabel, newGroups, parseDiagramIndex, parsePartsList, progress, searchCatalogue, stockFor, stockIndex,
} from "@/lib/makerCatalogue";
import { BookOpen, ChevronDown, ChevronUp, ClipboardPaste, ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";

// The maker's catalogue on a model page: Toyota's or Nissan's own list of
// diagrams and the parts on each, pasted in from Partsouq a page at a time.
// The drawings are the maker's and aren't kept: each diagram's link opens it
// on Partsouq. A catalogue part goes into stock only with "Add to stock".

const busLabel = (b) => b.name || b.plate_number || "Bus";

async function readClipboard(toast) {
  try {
    return await navigator.clipboard.readText();
  } catch {
    toast({ title: "Couldn't read what you copied", description: "Press and hold the box below, then choose Paste." });
    return null;
  }
}

// Paste a copied page: the list of diagrams, or one diagram's parts.
function PasteDialog({ mode, group, guide, buses, groups, onClose, onSaved }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busId, setBusId] = useState(group?.vehicle_id || buses[0]?.id || "");
  const [modelCode, setModelCode] = useState(group?.model_code || "");
  const [link, setLink] = useState(group?.link || "");
  const [saving, setSaving] = useState(false);
  const listMode = mode === "list";
  const parsed = useMemo(() => (listMode ? parseDiagramIndex(text) : parsePartsList(text)), [listMode, text]);
  const fresh = listMode ? newGroups(parsed, groups, { guideId: guide.id, vehicleId: busId, modelCode: modelCode.trim() }) : [];
  const linkOk = !link.trim() || /^https:\/\/\S+$/i.test(link.trim());

  const paste = async () => {
    const copied = await readClipboard(toast);
    if (copied != null) setText(copied);
  };
  const save = async (e) => {
    e.preventDefault();
    if (saving || !linkOk) return;
    setSaving(true);
    try {
      if (listMode) {
        for (const batch of chunks(fresh)) await base44.entities.CatalogueGroup.bulkCreate(batch);
        toast({ title: `Added ${fresh.length} diagram${fresh.length === 1 ? "" : "s"}` });
      } else {
        await base44.entities.CatalogueGroup.update(group.id, { parts: parsed, link: link.trim() });
        toast({ title: `Saved ${parsed.length} part${parsed.length === 1 ? "" : "s"} for ${groupLabel(group)}` });
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save it", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const categories = [...new Set(parsed.map((g) => g.category).filter(Boolean))];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <form onSubmit={save} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{listMode ? "Paste the list of diagrams" : `Paste the parts of ${groupLabel(group)}`}</DialogTitle>
            <DialogDescription>
              {listMode
                ? "On Partsouq, open the bus by its chassis number, select the list of diagrams (a whole category at a time is fine), copy it, and paste it here."
                : "On Partsouq, open this diagram, select its table of parts, copy it, and paste it here. Paste again later to replace the list."}
            </DialogDescription>
          </DialogHeader>

          {listMode && buses.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-bus">Looked up for</Label>
                <select id="cat-bus" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-body-sm" value={busId} onChange={(e) => setBusId(e.target.value)}>
                  {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-model-code">Model code (optional)</Label>
                <Input id="cat-model-code" value={modelCode} onChange={(e) => setModelCode(e.target.value)} placeholder="KDH212R-JEMDY" autoCapitalize="characters" />
              </div>
            </div>
          )}

          <Button type="button" variant="outline" className="h-11 w-full" onClick={paste}>
            <ClipboardPaste className="mr-2 h-4 w-4" />Paste what you copied
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="cat-text">Copied text</Label>
            <Textarea id="cat-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-caption" />
          </div>
          {!listMode && (
            <div className="space-y-1.5">
              <Label htmlFor="cat-link">This diagram on Partsouq (https://, optional)</Label>
              <Input id="cat-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Copy the address of the diagram page" />
              {!linkOk && <p className="text-caption text-danger">A link must start with https://</p>}
            </div>
          )}

          {text.trim() && (
            <div role="status" className="rounded-xl border border-border p-3 text-body-sm">
              {listMode ? (
                parsed.length ? (
                  <p>Found {parsed.length} diagram{parsed.length === 1 ? "" : "s"}{categories.length ? ` in ${categories.join(", ")}` : ""}. {fresh.length} new{fresh.length < parsed.length ? `, ${parsed.length - fresh.length} already here` : ""}.</p>
                ) : <p>No diagrams found in that text. Copy the list itself, with lines like "1502 OIL FILTER".</p>
              ) : parsed.length ? (
                <>
                  <p>Found {parsed.length} part{parsed.length === 1 ? "" : "s"}{group.parts?.length ? `; they replace the ${group.parts.length} saved before` : ""}.</p>
                  <ul className="mt-2 space-y-1">
                    {parsed.slice(0, 4).map((p, i) => (
                      <li key={i} className="truncate text-caption"><span className="font-mono">{p.number}</span> {p.name}{p.qty ? ` × ${p.qty}` : ""}</li>
                    ))}
                    {parsed.length > 4 && <li className="text-caption text-muted-foreground">and {parsed.length - 4} more</li>}
                  </ul>
                </>
              ) : <p>No part numbers found in that text. Copy the table of parts under the diagram.</p>}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !linkOk || (listMode ? !fresh.length : !parsed.length && link.trim() === (group?.link || ""))}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {listMode ? `Add ${fresh.length || ""} diagram${fresh.length === 1 ? "" : "s"}`.replace("  ", " ") : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PartRow({ part, index, onAdd }) {
  const onShelf = stockFor(part, index);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1 basis-[200px]">
        <p className="text-body-sm font-semibold">{part.name || "—"}</p>
        <p className="text-caption text-muted-foreground">
          <span className="font-mono text-foreground">{part.number}</span>
          {part.ref ? ` · on the drawing: ${part.ref}` : ""}{part.qty ? ` · ${part.qty} on the bus` : ""}{part.info ? ` · ${part.info}` : ""}
        </p>
      </div>
      {onShelf.length ? (
        onShelf.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 text-caption">
            <StockChip part={p} />{p.bin_location && <span className="text-muted-foreground">{p.bin_location}</span>}
          </span>
        ))
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => onAdd(part)}>
          <Plus className="mr-1 h-4 w-4" />Add to stock
        </Button>
      )}
    </li>
  );
}

function GroupRow({ group, open, index, canDelete, onToggle, onPaste, onAdd, onDelete }) {
  const count = (group.parts || []).length;
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[44px] min-w-0 flex-1 basis-[220px] items-center gap-2 text-left">
          {open ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold"><span className="font-mono">{group.code}</span> {group.title}</span>
            {group.detail && <span className="block truncate text-caption text-muted-foreground">{group.detail}</span>}
          </span>
        </button>
        <StatusChip tone={count ? "success" : "neutral"}>{count ? `${count} part${count === 1 ? "" : "s"}` : "No parts yet"}</StatusChip>
        {group.link && (
          <Button asChild size="sm" variant="ghost" className="h-9">
            <a href={group.link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${groupLabel(group)} on Partsouq`}>
              <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />Partsouq
            </a>
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onPaste} aria-label={`Paste parts for ${groupLabel(group)}`}>
          <ClipboardPaste className="mr-1 h-4 w-4" aria-hidden="true" />Paste parts
        </Button>
        {canDelete && (
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={onDelete} aria-label={`Delete ${groupLabel(group)}`}><Trash2 className="h-4 w-4" /></Button>
        )}
      </div>
      {open && (
        count ? (
          <ul className="ml-6 divide-y divide-border">
            {group.parts.map((part, i) => <PartRow key={`${part.number}-${i}`} part={part} index={index} onAdd={onAdd} />)}
          </ul>
        ) : <p className="ml-6 text-body-sm text-muted-foreground">Open this diagram on Partsouq, copy its table of parts and tap Paste parts.</p>
      )}
    </li>
  );
}

export default function MakerCatalogue({ guide, buses = [], parts = [], guides = [], canDelete = false, onStockChange }) {
  const { toast } = useToast();
  const [shown, setShown] = useState(false);
  const [groups, setGroups] = useState(null);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  const [pasting, setPasting] = useState(null); // { mode, group }
  const [adding, setAdding] = useState(null); // initial values for Add a part

  const load = async () => {
    try {
      setGroups(await base44.entities.CatalogueGroup.filter({ guide_id: guide.id }, "sort_order", 1000));
    } catch (err) {
      setGroups((g) => g || []);
      toast({ title: "Couldn't load the catalogue", description: err?.message, variant: "destructive" });
    }
  };
  const show = () => { setShown(true); if (!groups) load(); };
  const index = useMemo(() => stockIndex(parts), [parts]);
  const list = useMemo(() => (groups || []).filter((g) => g.guide_id === guide.id), [groups, guide.id]);
  const done = progress(list);
  const hits = useMemo(() => searchCatalogue(list, query), [list, query]);
  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addToStock = (part) => setAdding({ number: part.number, name: part.name, kind: "genuine", guide_ids: [guide.id] });
  const remove = async (group) => {
    if (!(await confirmAction({ title: `Delete ${groupLabel(group)}?`, description: "Its pasted parts go too. Your stock isn't touched." }))) return;
    try { await base44.entities.CatalogueGroup.delete(group.id); await load(); }
    catch (err) { toast({ title: "Couldn't delete it", description: err?.message, variant: "destructive" }); }
  };

  return (
    <Panel
      title="Maker's catalogue"
      icon={BookOpen}
      description="Toyota's or Nissan's own parts list for this model, pasted in from Partsouq one page at a time. Each diagram opens on Partsouq; a part goes into your stock only when you add it."
      actions={shown && <Button size="sm" variant="outline" onClick={() => setPasting({ mode: "list" })}><ClipboardPaste className="mr-1.5 h-4 w-4" />Paste a list of diagrams</Button>}
    >
      {!shown ? (
        <Button variant="outline" onClick={show}><BookOpen className="mr-1.5 h-4 w-4" />Open the catalogue</Button>
      ) : groups === null ? (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the catalogue…</p>
      ) : list.length === 0 ? (
        <EmptyState icon={BookOpen} title="No diagrams yet">
          On Partsouq, look the bus up by its chassis number, copy the list of diagrams and tap Paste a list of diagrams.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <p className="text-body-sm text-muted-foreground">Parts pasted for {done.done} of {done.total} diagram{done.total === 1 ? "" : "s"}.</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalogue: a part number or a name" aria-label="Search the catalogue" className="pl-9" />
          </div>
          {query.trim() ? (
            hits.length ? (
              <ul aria-label="Found in the catalogue" className="divide-y divide-border">
                {hits.map(({ group, part }, i) => (
                  <li key={`${group.id}-${i}`}>
                    <p className="pt-2 text-caption text-muted-foreground">{group.category ? `${group.category} › ` : ""}{groupLabel(group)}</p>
                    <ul><PartRow part={part} index={index} onAdd={addToStock} /></ul>
                  </li>
                ))}
              </ul>
            ) : <p className="text-body-sm text-muted-foreground">Nothing in the pasted parts matches.</p>
          ) : (
            [...byCategory(list)].map(([category, items]) => (
              <section key={category} aria-label={category}>
                <h3 className="text-body-sm font-semibold text-muted-foreground">{category}</h3>
                <ul className="divide-y divide-border">
                  {items.map((g) => (
                    <GroupRow
                      key={g.id} group={g} open={openIds.has(g.id)} index={index} canDelete={canDelete}
                      onToggle={() => toggle(g.id)} onPaste={() => setPasting({ mode: "parts", group: g })}
                      onAdd={addToStock} onDelete={() => remove(g)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      {pasting && (
        <PasteDialog
          mode={pasting.mode} group={pasting.group} guide={guide} buses={buses} groups={list}
          onClose={() => setPasting(null)} onSaved={load}
        />
      )}
      <QuickAddPart
        open={!!adding} onOpenChange={(o) => !o && setAdding(null)} parts={parts} guides={guides}
        initial={adding || undefined} onSaved={onStockChange}
      />
    </Panel>
  );
}
