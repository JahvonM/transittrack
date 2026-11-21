import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { StockChip } from "@/components/admin/partsCatalogueKit";
import { waLink } from "@/lib/mapbox";
import { nextStock, orderEmailLink, orderMessage, reorderLines } from "@/lib/workshop";
import { Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { Copy, Mail, MessageCircle, Minus, Plus, Printer } from "lucide-react";

// The reorder list: every part that is low or out of stock, by supplier,
// with how many to order (back up to twice the warning level). Each
// supplier's order goes out on WhatsApp (WhatsApp asks who to send it to),
// by email, or is copied or printed to read out on the phone. Ticks and
// amounts stay on this screen; nothing is saved.

function SupplierOrder({ group }) {
  const { toast } = useToast();
  const [qty, setQty] = useState(() => Object.fromEntries(group.lines.map((l) => [l.part.id, l.qty])));
  const [skip, setSkip] = useState(() => new Set());
  const lines = group.lines.filter((l) => !skip.has(l.part.id)).map((l) => ({ part: l.part, qty: qty[l.part.id] }));
  const order = { supplier: group.supplier, lines };
  const message = orderMessage(order);
  const name = group.supplier || "No supplier set";
  const step = (id, d) => setQty((q) => ({ ...q, [id]: Math.max(1, nextStock(q[id], d)) }));
  const toggle = (id) => setSkip((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: "Order copied", description: "Paste it into a message, or read it out on the phone." });
    } catch {
      toast({ title: "Couldn't copy", description: "Use WhatsApp or Email instead.", variant: "destructive" });
    }
  };

  return (
    <section aria-label={`Order from ${name}`} className="tt-order overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2">
        <h3 className="min-w-0 flex-1 text-body font-semibold">{name} <span className="font-normal tabular-nums text-muted-foreground">({pluralize(lines.length, "part")})</span></h3>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="outline" className="h-11 rounded-lg bg-card text-body" aria-disabled={!lines.length}>
            <a href={lines.length ? waLink("", message) : undefined} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />WhatsApp</a>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-lg bg-card text-body" aria-disabled={!lines.length}>
            <a href={lines.length ? orderEmailLink(order) : undefined}><Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />Email</a>
          </Button>
          <Button variant="outline" className="h-11 rounded-lg bg-card text-body" onClick={copy} disabled={!lines.length}><Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />Copy</Button>
        </div>
      </div>
      {!group.supplier && <p className="border-b border-border px-4 py-2 text-body-sm text-muted-foreground print:hidden">Add a supplier in each part's details to group its order.</p>}
      <ul className="divide-y divide-border">
        {group.lines.map(({ part }) => {
          const off = skip.has(part.id);
          return (
            <li key={part.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${off ? "opacity-60 print:hidden" : ""}`}>
              <input type="checkbox" className="h-5 w-5 shrink-0 print:hidden" checked={!off} onChange={() => toggle(part.id)} aria-label={`Order ${part.part_name}`} />
              <div className="min-w-[10rem] flex-1">
                <Link to={`/workshop/parts/${part.id}`} className="block truncate text-body font-semibold text-primary hover:underline">{part.part_name}</Link>
                <p className="truncate text-body-sm tabular-nums text-muted-foreground">{[part.oem_number, part.aftermarket_number].filter(Boolean).join(" / ") || "No number"}{part.bin_location ? ` · ${part.bin_location}` : ""}</p>
              </div>
              <StockChip part={part} className="print:hidden" />
              <div className="flex items-center gap-1.5" role="group" aria-label={`How many ${part.part_name} to order`}>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-lg print:hidden" onClick={() => step(part.id, -1)} disabled={off || qty[part.id] <= 1} aria-label={`Order one fewer ${part.part_name}`}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                <span className="min-w-[3rem] text-center text-title-sm font-bold tabular-nums">× {qty[part.id]}</span>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-lg print:hidden" onClick={() => step(part.id, 1)} disabled={off} aria-label={`Order one more ${part.part_name}`}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </li>
          );
        })}
      </ul>
      <details className="border-t border-border px-4 py-2 print:hidden">
        <summary className="cursor-pointer text-body-sm font-medium">The message</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary p-3 font-sans text-body-sm" aria-label={`Message to ${name}`}>{message}</pre>
      </details>
    </section>
  );
}

export default function ReorderPage() {
  const { parts, missing } = useWorkshop();
  const groups = useMemo(() => reorderLines(parts), [parts]);
  const total = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <>
      <ScreenBar
        crumbs={[{ to: "/workshop", label: "Workshop" }, { to: "/workshop/parts", label: "Parts" }, { label: "Reorder list" }]}
        title="Reorder list" subtitle={`${pluralize(total, "part")} low or out of stock`}
      >
        {total > 0 && <Button variant="outline" className="h-12 rounded-lg bg-card text-body print:hidden" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />Print</Button>}
      </ScreenBar>
      {missing.parts ? (
        <Notice tone="danger">Couldn't load the parts. Go back to Parts and tap Try again.</Notice>
      ) : total === 0 ? (
        <Notice>Nothing to reorder: every part is above its warning level. Set "Warn at" on a part to have it show here when it runs low.</Notice>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => <SupplierOrder key={g.supplier || "none"} group={g} />)}
        </div>
      )}
    </>
  );
}
