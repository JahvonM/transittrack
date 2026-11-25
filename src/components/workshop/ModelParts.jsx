import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { guideTitle } from "@/lib/busLibrary";
import { partsForGuide, stockSummary, visibleParts } from "@/lib/workshop";
import { PartRow } from "@/components/workshop/PartsPage";
import { EditSheet, Notice, pluralize, useWorkshop } from "@/components/workshop/kit";
import { Check, Link2, Package, Plus, RefreshCw, Search } from "lucide-react";

// Parts that fit: the parts on the shelves ticked for this vehicle's model
// page, each with its stock (and, when low or out, a replacement on the
// shelf) and opening its own page; parts already in stock can be linked in
// one tap.

function LinkPartSheet({ guide, onClose }) {
  const { toast } = useToast();
  const { parts, interchanges, put } = useWorkshop();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [linked, setLinked] = useState(() => new Set());
  const others = useMemo(
    () => visibleParts(parts.filter((p) => !(p.guide_ids || []).includes(guide.id) || linked.has(p.id)), interchanges, { query }),
    [parts, interchanges, query, guide, linked],
  );

  const link = async (part) => {
    setBusy(part.id);
    try {
      put("parts", await base44.entities.Part.update(part.id, { guide_ids: [...(part.guide_ids || []), guide.id] }));
      setLinked((s) => new Set(s).add(part.id));
    } catch (e) {
      toast({ title: "Couldn't link the part", description: e?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <EditSheet open onClose={onClose} onSave={onClose} saveLabel="Done" title="Link a part" description={`Parts that fit the ${guideTitle(guide)}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or any part number" aria-label="Find a part to link" className="h-12 rounded-lg pl-10 text-body md:text-body" />
      </div>
      {others.length === 0 ? (
        <p className="py-4 text-center text-body-sm text-muted-foreground">{query ? "Nothing matches." : "Every part in stock is already linked to this model."}</p>
      ) : (
        <ul aria-label="Parts in stock" className="divide-y divide-border rounded-lg border border-border">
          {others.map((part) => {
            const done = linked.has(part.id);
            return (
              <li key={part.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">{part.part_name}</p>
                  <p className="truncate text-body-sm text-muted-foreground">{[part.oem_number, part.aftermarket_number].filter(Boolean).join(" · ") || "No number"}</p>
                </div>
                <StockChip part={part} className="hidden shrink-0 sm:inline-flex" />
                <Button
                  type="button" variant={done ? "ghost" : "outline"} className="h-12 shrink-0 rounded-lg text-body"
                  disabled={done || busy === part.id} onClick={() => link(part)} aria-label={done ? `${part.part_name} linked` : `Link ${part.part_name}`}
                >
                  {done ? <><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Linked</> : <><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Link</>}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </EditSheet>
  );
}

export default function ModelPartsSection({ kind, guide }) {
  const { parts, interchanges, guides, put, missing, reload } = useWorkshop();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const mine = useMemo(() => partsForGuide(parts, guide.id), [parts, guide]);
  const { low } = stockSummary(mine);

  return (
    <section aria-labelledby="model-parts-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="model-parts-title" className="text-title-sm font-semibold">Parts that fit</h3>
          <p className="text-body-sm text-muted-foreground">{pluralize(mine.length, "part")} in stock for every {kind === "car" ? "car" : "bus"} of this model{low ? `, ${low} low or out` : ""}</p>
        </div>
        <Button variant="outline" className="h-12 rounded-lg bg-card text-body" onClick={() => setLinking(true)} disabled={missing.parts}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Link a part</Button>
        <Button className="h-12 rounded-lg text-body" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a part</Button>
      </div>

      {missing.parts && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the parts. Check the connection.
        </Notice>
      )}

      {mine.length === 0 && !missing.parts ? (
        <Notice>
          <p className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4" aria-hidden="true" />No parts linked to the {guideTitle(guide)} yet.</p>
          <p className="text-muted-foreground">Link the ones you already have with Link a part, or add a new one.</p>
        </Notice>
      ) : mine.length > 0 && (
        <ul aria-label="Parts that fit" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {mine.map((part) => <PartRow key={part.id} part={part} guides={guides} parts={parts} interchanges={interchanges} />)}
        </ul>
      )}

      <QuickAddPart open={adding} onOpenChange={setAdding} parts={parts} guides={guides} initial={{ guide_ids: [guide.id] }} onSaved={(saved) => put("parts", saved)} />
      {linking && <LinkPartSheet guide={guide} onClose={() => setLinking(false)} />}
    </section>
  );
}
