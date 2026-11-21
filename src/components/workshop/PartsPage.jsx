import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import QuickAddPart from "@/components/admin/QuickAddPart";
import { guideLabel } from "@/lib/partsCatalogue";
import { oldViewLink, stockSummary, visibleParts } from "@/lib/workshop";
import { Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { Camera, MonitorSmartphone, Plus, RefreshCw, Search } from "lucide-react";

// Parts in the Workshop: the whole stock as a catalogue list (search by name
// or any number, replacement numbers too, or just what's low), each part
// opening its own page. Adding uses the same quick add as the parts kiosk.

const SHOW = [
  { id: "all", label: "All" },
  { id: "low", label: "Low or out" },
];

// One part in a list: photo, name, numbers, models and shelf, and its stock.
export function PartRow({ part, guides }) {
  const models = (part.guide_ids || []).map((id) => guides.find((g) => g.id === id)).filter(Boolean).map(guideLabel);
  const numbers = [part.oem_number, part.aftermarket_number].filter(Boolean).join(" · ");
  return (
    <li>
      <Link to={`/workshop/parts/${part.id}`} className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
          {part.photo_url ? <img src={part.photo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-primary">{part.part_name || "Part"}</span>
          {numbers && <span className="block truncate text-body-sm tabular-nums text-foreground">{numbers}</span>}
          {(models.length > 0 || part.bin_location) && (
            <span className="block truncate text-body-sm text-muted-foreground">{[models.join(", "), part.bin_location && `Kept at ${part.bin_location}`].filter(Boolean).join(" · ")}</span>
          )}
        </span>
        <StockChip part={part} className="shrink-0" />
      </Link>
    </li>
  );
}

export default function PartsPage() {
  const { parts, interchanges, guides, missing, put, reload, user } = useWorkshop();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => visibleParts(parts, interchanges, { query, show }), [parts, interchanges, query, show]);
  const stock = stockSummary(parts);

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: "Parts" }]} title="Parts" subtitle={`${pluralize(stock.total, "part")} · ${stock.low} low or out`}>
        <Button asChild variant="outline" className="h-12 rounded-lg bg-card text-body">
          <Link to="/parts"><MonitorSmartphone className="mr-1.5 h-4 w-4" aria-hidden="true" />Parts kiosk</Link>
        </Button>
        <Button className="h-12 rounded-lg text-body" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add a part</Button>
      </ScreenBar>

      {missing.parts && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the parts. Check the connection.
        </Notice>
      )}
      {missing.interchanges && !missing.parts && <Notice tone="warning">Couldn't load the replacement numbers, so searching by them finds nothing for now.</Notice>}

      {parts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or any part number" aria-label="Find a part" className="h-12 rounded-lg bg-card pl-10 text-body md:text-body" />
          </div>
          <div role="group" aria-label="Which parts" className="flex rounded-lg border border-border bg-card p-1">
            {SHOW.map((s) => (
              <button
                key={s.id} type="button" aria-pressed={show === s.id} onClick={() => setShow(s.id)}
                className={`h-10 rounded-md px-3 text-body-sm font-semibold ${show === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s.label}{s.id === "low" && stock.low ? ` ${stock.low}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {parts.length === 0 && !missing.parts ? (
        <Notice>No parts yet. Tap Add a part, or use the parts kiosk.</Notice>
      ) : list.length === 0 && parts.length > 0 ? (
        <p className="py-6 text-center text-body text-muted-foreground">Nothing matches.</p>
      ) : list.length > 0 && (
        <ul aria-label="Parts" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {list.map((part) => <PartRow key={part.id} part={part} guides={guides} />)}
        </ul>
      )}

      <p className="mt-6 text-body-sm text-muted-foreground">
        Parts used to be in {user?.role === "admin" ? "Admin" : "the mechanic screen"}.{" "}
        <Link to={oldViewLink(user?.role, "parts")} className="font-medium text-primary underline underline-offset-2">Old view of Parts</Link>
      </p>

      <QuickAddPart open={adding} onOpenChange={setAdding} parts={parts} guides={guides} onSaved={(saved) => put("parts", saved)} />
    </>
  );
}
