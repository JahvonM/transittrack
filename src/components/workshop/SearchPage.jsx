import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import { MIN_QUERY, workshopSearch } from "@/lib/workshopSearch";
import { ScreenBar, useWorkshop } from "@/components/workshop/kit";
import ScanSheet from "@/components/workshop/ScanSheet";
import { ChevronRight, ScanLine, Search } from "lucide-react";

// One search box for the whole Workshop. What's typed is kept in the address
// (?q=), so Back from a result comes back to the same results.

// The search box, as on the Workshop's home: it opens this page with the
// words typed.
export function SearchBox({ initial = "", onSearch, autoFocus = false, className = "" }) {
  const [text, setText] = useState(initial);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()); }} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search" value={text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocus}
        placeholder="Search parts, numbers, torque, specs, manuals…" aria-label="Search the Workshop"
        className="h-14 rounded-xl bg-card pl-11 pr-24 text-body shadow-sm md:text-body"
      />
      <Button type="submit" className="absolute right-1.5 top-1/2 h-11 -translate-y-1/2 rounded-lg text-body">Search</Button>
    </form>
  );
}

function Hit({ hit }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-body font-semibold ${hit.to ? "text-primary" : ""}`}>{hit.title}</span>
        {hit.subtitle && <span className="block truncate text-body-sm text-muted-foreground">{hit.subtitle}</span>}
      </span>
      {hit.part && <StockChip part={hit.part} className="shrink-0" />}
      {hit.to && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {hit.to
        ? <Link to={hit.to} className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60">{body}</Link>
        : <div className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5">{body}</div>}
    </li>
  );
}

export default function SearchPage() {
  const data = useWorkshop();
  const [params, setParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const query = params.get("q") || "";
  const results = useMemo(() => workshopSearch(data, query), [data, query]);
  const search = (q) => setParams(q ? { q } : {}, { replace: false });

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: "Search" }]} title="Search" subtitle="Vehicles, parts, torque values, specs, the maker's diagrams and manuals" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox key={query} initial={query} onSearch={search} autoFocus={!query} className="min-w-[16rem] flex-1" />
        <Button variant="outline" className="h-14 rounded-xl bg-card text-body" onClick={() => setScanning(true)}><ScanLine className="mr-1.5 h-5 w-5" aria-hidden="true" />Scan</Button>
      </div>

      {query && query.length < MIN_QUERY && <p className="text-body-sm text-muted-foreground">Type at least {MIN_QUERY} letters or numbers.</p>}
      {query.length >= MIN_QUERY && results.length === 0 && <p className="py-6 text-center text-body text-muted-foreground">Nothing found for “{query}”.</p>}

      <div className="space-y-4">
        {results.map((group) => (
          <section key={group.id} aria-labelledby={`found-${group.id}`} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <h3 id={`found-${group.id}`} className="border-b border-border bg-secondary/60 px-4 py-2 text-body-sm font-semibold">
              {group.label} <span className="tabular-nums text-muted-foreground">({group.hits.length + group.more})</span>
            </h3>
            <ul className="divide-y divide-border">
              {group.hits.map((hit) => <Hit key={hit.key} hit={hit} />)}
            </ul>
            {group.more > 0 && <p className="border-t border-border px-4 py-2 text-body-sm text-muted-foreground">{group.more} more: add another word to narrow it down.</p>}
          </section>
        ))}
      </div>

      <ScanSheet open={scanning} onOpenChange={setScanning} />
    </>
  );
}
