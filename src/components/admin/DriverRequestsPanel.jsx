import React, { useEffect, useState } from "react";
import { CalendarOff, Check, Repeat, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { errorData } from "@/lib/requestError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/admin/kit";
import { useToast } from "@/components/ui/use-toast";

const nice = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const range = (r) => (r.end_date && r.end_date !== r.start_date ? `${nice(r.start_date)} to ${nice(r.end_date)}` : nice(r.start_date));
const call = async (body) => (await withRateLimitRetry(() => base44.functions.invoke("driverRequests", body), { attempts: 3 })).data;

/** Day-off and swap requests sent from the driver phone app. */
export default function DriverRequestsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = () => call({ action: "list" }).then((d) => setRows(d.requests || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const decide = async (r, decision) => {
    setBusy(r.id);
    try {
      await call({ action: "decide", request_id: r.id, decision, note: notes[r.id] || "" });
      toast({ title: decision === "approved" ? "Approved" : "Declined", description: `${r.driver_name} will get a notification on their phone.` });
      await load();
    } catch (e) {
      toast({ title: "Couldn't save that", description: errorData(e).error || e.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  if (!rows || rows.length === 0) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="driver-requests-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="driver-requests-title" className="text-title-sm font-bold">Day-off and swap requests</h2>
        {pending.length > 0 && <StatusChip tone="warning">{pending.length} waiting</StatusChip>}
      </div>
      {pending.length === 0 && <p className="text-body-sm text-muted-foreground">Nothing waiting.</p>}
      <ul className="divide-y divide-border">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {r.kind === "swap" ? <Repeat className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CalendarOff className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {r.driver_name}: {r.kind === "swap" ? `swap ${range(r)} with ${r.swap_with_name}` : `off ${range(r)}`}
              </p>
              <p className="text-body-sm text-muted-foreground">{[r.company_name, r.note && `"${r.note}"`].filter(Boolean).join(" · ")}</p>
            </div>
            <Input aria-label={`Reply to ${r.driver_name} (optional)`} placeholder="Reply (optional)" className="sm:w-48" value={notes[r.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} maxLength={500} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(r, "approved")} disabled={busy === r.id}><Check className="h-4 w-4" /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => decide(r, "declined")} disabled={busy === r.id}><X className="h-4 w-4" /> Decline</Button>
            </div>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? "Hide answered" : `Show answered (${done.length})`}
          </Button>
          {showDone && (
            <ul className="mt-1 divide-y divide-border text-body-sm">
              {done.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{r.driver_name}: {r.kind === "swap" ? `swap ${range(r)}` : `off ${range(r)}`}</span>
                  <StatusChip status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
