import React, { useRef, useState } from "react";
import { DatabaseZap, Images, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

// Admin -> Settings: steps 3 and 4 of the move to Supabase. Copies every
// table into the new database, keeping the same ids; safe to run again (rows
// already there are updated). Then sets up a Supabase sign-in account for each
// verified person, linked by email. The app keeps running on Base44 the whole
// time, and nobody is emailed.
const errorOf = (e) => e?.response?.data?.error || e?.data?.error || e?.message || "Something went wrong";
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function accountsSummary(r) {
  const parts = [`${plural(r.linked ?? 0, "person", "people")} of ${r.people} now have a Supabase sign-in account.`];
  if (r.created) parts.push(`${r.created} set up just now.`);
  if (r.unverified) parts.push(`${plural(r.unverified, "person", "people")} never confirmed their email, so they'll sign up again after the switch.`);
  if (r.no_email) parts.push(`${plural(r.no_email, "person", "people")} have no email.`);
  if (r.failed?.length) parts.push(`${plural(r.failed.length, "account")} couldn't be set up (see below).`);
  return parts.join(" ");
}

export function filesSummary(t) {
  if (!t.files) return "No files to copy.";
  const parts = [`${plural(t.files, "file")} found: ${t.copied} copied now, ${t.already} already copied.`];
  if (t.failed.length) parts.push(`${plural(t.failed.length, "file")} couldn't be copied (see below).`);
  return parts.join(" ");
}

// Step 5: copies the photos, signatures, voice notes and documents the tables
// point to into Supabase storage, one table at a time.
function FilesCopy() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState([]);
  const run = async () => {
    setBusy(true); setStatus("Starting…"); setFailed([]);
    const total = { files: 0, copied: 0, already: 0, failed: [] };
    try {
      const { files } = (await base44.functions.invoke("copyToSupabase", { action: "tables" })).data;
      for (const entity of files || []) {
        for (let skip = 0; ;) {
          setStatus(`Copying files from ${entity}… ${total.copied} copied so far`);
          const page = (await base44.functions.invoke("copyToSupabase", { action: "files", entity, skip })).data;
          total.files += page.files; total.copied += page.copied; total.already += page.already; total.failed.push(...page.failed);
          if (page.done) break;
          skip = page.next_skip;
        }
      }
      setStatus(`Done: ${filesSummary(total)}`);
      setFailed(total.failed);
    } catch (e) {
      setStatus(errorOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-body font-semibold"><Images className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Files</h3>
      <p className="mt-1 text-body-sm text-muted-foreground">Copies the photos, signatures, voice notes and documents into Supabase. Logos and bus photos go in the public area; faces, signatures and incident photos go in the private one. You can run this again.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={run} disabled={busy}>{busy ? "Copying files…" : "Copy files"}</Button>
      {status && <p role="status" className="mt-3 text-body-sm">{status}</p>}
      {failed.length > 0 && (
        <ul className="mt-2 space-y-1 text-body-sm">
          {failed.slice(0, 10).map((f) => <li key={f.entity + f.id + f.column}><b>{f.entity}</b> {f.id} ({f.column}): {f.error}</li>)}
        </ul>
      )}
    </div>
  );
}

function SignInAccounts() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      setResult((await base44.functions.invoke("copyToSupabase", { action: "accounts" })).data);
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-body font-semibold"><KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Sign-in accounts</h3>
      <p className="mt-1 text-body-sm text-muted-foreground">Sets up a Supabase sign-in account for each person with a verified email, linked to them by email. No passwords are copied and nobody is emailed; you can run this again.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={run} disabled={busy}>{busy ? "Setting up…" : "Set up sign-in accounts"}</Button>
      {(result || error) && <p role="status" className="mt-3 text-body-sm">{error || accountsSummary(result)}</p>}
      {result?.failed?.length > 0 && (
        <ul className="mt-2 space-y-1 text-body-sm">
          {result.failed.slice(0, 10).map((f) => <li key={f.id}><b>{f.id}</b>: {f.error}</li>)}
        </ul>
      )}
    </div>
  );
}

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
      const leftOut = results.filter((r) => Object.keys(r.dropped).length);
      setStatus(stopRef.current ? "Stopped. Press Copy again to carry on (rows already copied are updated, not doubled)."
        : `Done: ${total} rows read from Base44, ${failed} could not be copied. ${short.length ? `${short.length} table${short.length === 1 ? "" : "s"} don't match yet (see below).` : "Every table matches."} ${leftOut.length ? `${leftOut.length} table${leftOut.length === 1 ? " has" : "s have"} fields with no place in Supabase yet (see below).` : "No fields were left out."}`);
    } catch (e) {
      setStatus(errorOf(e));
    } finally {
      setRunning(false);
    }
  };

  const problems = rows.filter((r) => r.failed.length || Object.keys(r.dropped).length || (r.inSupabase !== null && r.inSupabase !== r.read));
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
          {problems.some((r) => Object.keys(r.dropped).length) && (
            <div className="mt-2 text-body-sm">
              <p className="font-semibold">Fields with no place in Supabase yet (not copied)</p>
              <ul className="mt-1 space-y-1">
                {problems.filter((r) => Object.keys(r.dropped).length).map((r) => (
                  <li key={r.entity + "-dropped"}><b>{r.entity}</b>: {Object.entries(r.dropped).map(([k, n]) => `${k} (${n} row${n === 1 ? "" : "s"})`).join(", ")}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
      <FilesCopy />
      <SignInAccounts />
    </section>
  );
}
