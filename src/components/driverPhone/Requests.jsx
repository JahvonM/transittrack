import React, { useEffect, useState } from "react";
import { ArrowLeft, CalendarOff, Loader2, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  pending: { text: "Waiting for an answer", tone: "text-muted-foreground" },
  approved: { text: "Approved", tone: "text-success" },
  declined: { text: "Declined", tone: "text-danger" },
  cancelled: { text: "Cancelled", tone: "text-muted-foreground" },
};
// Today on the phone, as YYYY-MM-DD in local time.
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const nice = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const range = (r) => (r.end_date && r.end_date !== r.start_date ? `${nice(r.start_date)} to ${nice(r.end_date)}` : nice(r.start_date));

/** Day-off and shift-swap requests. An administrator answers them. */
export default function Requests({ load, onCreate, onCancel, onBack }) {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState("day_off");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [swapWith, setSwapWith] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const refresh = async () => setData(await load());
  useEffect(() => { refresh().catch(() => setData({ requests: [], colleagues: [] })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!start) { setError("Choose a date."); return; }
    if (kind === "swap" && !swapWith) { setError("Choose who to swap with."); return; }
    setBusy(true); setError("");
    try {
      await onCreate({ kind, start_date: start, end_date: kind === "day_off" && end ? end : start, swap_with_driver_id: kind === "swap" ? swapWith : undefined, note: note.trim() });
      setStart(""); setEnd(""); setSwapWith(""); setNote(""); setSent(true);
      await refresh();
    } catch (err) {
      setError(err.message || "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id) => {
    try { await onCancel(id); await refresh(); } catch (err) { setError(err.message || "Couldn't cancel. Try again."); }
  };

  const field = "min-h-[48px] w-full rounded-xl border border-input bg-background px-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-2 self-start font-semibold text-muted-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Me
      </button>
      <h1 className="text-headline">Days off and swaps</h1>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Kind of request">
          {[["day_off", "Day off", CalendarOff], ["swap", "Swap a shift", Repeat]].map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => { setKind(id); setError(""); setSent(false); }}
              className={cn("flex min-h-[44px] items-center justify-center gap-2 rounded-lg font-semibold", kind === id ? "bg-background shadow-sm" : "text-muted-foreground")}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className={cn("grid gap-3", kind === "day_off" && "grid-cols-2")}>
          <label className="block">
            <span className="mb-1 block font-semibold">{kind === "day_off" ? "First day" : "Day"}</span>
            <input type="date" min={todayIso()} value={start} onChange={(e) => { setStart(e.target.value); setSent(false); }} className={field} />
          </label>
          {kind === "day_off" && (
            <label className="block">
              <span className="mb-1 block font-semibold">Last day <span className="font-normal text-muted-foreground">(optional)</span></span>
              <input type="date" min={start || todayIso()} value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
            </label>
          )}
        </div>
        {kind === "swap" && (
          <label className="block">
            <span className="mb-1 block font-semibold">Swap with</span>
            <select value={swapWith} onChange={(e) => setSwapWith(e.target.value)} className={field}>
              <option value="">Choose a driver</option>
              {(data?.colleagues || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block font-semibold">Note <span className="font-normal text-muted-foreground">(optional)</span></span>
          <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "swap" ? "Have you agreed it with them?" : "Reason, if you want to say"}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
        {sent && !error && <p role="status" className="text-body-sm font-semibold text-success">Sent. You'll get a notification when it's answered.</p>}
        <button type="submit" disabled={busy} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60">
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} Send request
        </button>
      </form>

      <section aria-label="Your requests" className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-title-sm font-bold">Your requests</h2>
        {!data ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading requests" />
          : data.requests.length === 0 ? <p className="text-muted-foreground">None yet.</p>
          : (
            <ul className="divide-y divide-border">
              {data.requests.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.kind === "swap" ? `Swap ${range(r)} with ${r.swap_with_name || "a driver"}` : `Off ${range(r)}`}</p>
                    <p className={cn("text-body-sm font-medium", STATUS[r.status]?.tone)}>{STATUS[r.status]?.text || r.status}{r.decision_note ? `: ${r.decision_note}` : ""}</p>
                  </div>
                  {r.status === "pending" && (
                    <button type="button" onClick={() => cancel(r.id)} className="min-h-[40px] shrink-0 rounded-xl border border-border px-3 text-body-sm font-semibold hover:bg-accent">Cancel</button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
