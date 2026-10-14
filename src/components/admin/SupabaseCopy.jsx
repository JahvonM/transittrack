import React, { useRef, useState } from "react";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

// Admin -> Settings: step 3 of the move to Supabase. Copies every table into
// the new database, keeping the same ids; safe to run again (rows already
// there are updated). The app keeps running on Base44 the whole time.
const errorOf = (e) => e?.response?.data?.error || e?.data?.error || e?.message || "Something went wrong";

export default function SupabaseCopy() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const stopRef = useRef(false);

  const call = async (body) => (await base44.functions.invoke("copyToSupabase", body)).data;

  const run = async () => {
    setRunning(true); stopRef.current = false; setRows([]); setStatus("Starting…");
    try {
      const { entities } = await call({ action: "tables" });
      const results = [];
      for (const entity of entities) {
        if (stopRef.current) break;
        const row = { entity, read: 0, copied: 0, failed: [], dropped: {}, inSupabase: null };
        results.push(row);
        let skip = 0;
        for (;;) {
          if (stopRef.current) break;
          setStatus(`Copying ${entity}… ${row.read} rows so far`);
          const page = await call({ action: "copy", entity, skip });
          row.read += page.read; row.copied += page.copied; row.failed.push(...page.failed);
          for (const [k, n] of Object.entries(page.dropped_fields || {})) row.dropped[k] = (row.dropped[k] || 0) + n;
          setRows([...results]);
          if (page.done) break;
          skip = page.next_skip;
        }
      }
      setStatus("Checking what Supabase holds…");
      const { counts } = await call({ action: "counts" });
      for (const row of results) row.inSupabase = counts[row.entity] ?? null;
      setRows([...results]);
      const total = results.reduce((n, r) => n + r.read, 0);
      const failed = results.reduce((n, r) => n + r.failed.length, 0);
      const short = results.filter((r) => r.inSupabase !== r.read);
      setStatus(stopRef.current ? "Stopped. Press Copy again to carry on (rows already copied are updated, not doubled)."
        : `Done: ${total} rows read from Base44, ${failed} could not be copied. ${short.length ? `${short.length} table${short.length === 1 ? "" : "s"} don't match yet (see below).` : "Every table matches."}`);
    } catch (e) {
      setStatus(errorOf(e));
    } finally {
      setRunning(false);
    }
  };

  const problems = rows.filter((r) => r.failed.length || (r.inSupabase !== null && r.inSupabase !== r.read));
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="tt-supabase-copy">
      <h2 id="tt-supabase-copy" className="flex items-center gap-2 text-title-sm font-bold">
        <DatabaseZap className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Copy data to Supabase
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">Copies every table into the new Supabase database with the same IDs. The app keeps running on Base44, and you can run this again: rows already copied are updated, not doubled.</p>
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={run} disabled={running}>{running ? "Copying…" : "Copy all data"}</Button>
        {running && <Button type="button" variant="outline" onClick={() => { stopRef.current = true; }}>Stop</Button>}
      </div>
      {status && <p role="status" className="mt-3 text-body-sm">{status}</p>}
      {rows.length > 0 && (
        <details className="mt-3" open={!running && problems.length > 0}>
          <summary className="cursor-pointer text-body-sm font-semibold">Tables ({rows.length}){problems.length ? ` · ${problems.length} to look at` : ""}</summary>
          <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-border">
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Table</th><th className="px-3 py-2 text-right font-medium">In Base44</th><th className="px-3 py-2 text-right font-medium">In Supabase</th><th className="px-3 py-2 text-right font-medium">Not copied</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entity} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.entity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.read}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.inSupabase !== null && r.inSupabase !== r.read ? "font-semibold text-warning" : ""}`}>{r.inSupabase ?? "…"}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.failed.length ? "font-semibold text-danger" : ""}`}>{r.failed.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.some((r) => r.failed.length) && (
            <ul className="mt-2 space-y-1 text-body-sm">
              {problems.filter((r) => r.failed.length).flatMap((r) => r.failed.slice(0, 5).map((f) => (
                <li key={r.entity + f.id}><b>{r.entity}</b> {f.id}: {f.error}</li>
              )))}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}
