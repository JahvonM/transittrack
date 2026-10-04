import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Layers, Loader2, Nfc, Pause, Play, RotateCcw, SkipForward, XCircle } from "lucide-react";
import { formatUid, normalizeUid } from "@/lib/cardReader";

const TYPES = [
  { id: "staff", label: "Passengers" },
  { id: "driver", label: "Drivers" },
  { id: "mechanic", label: "Mechanics" },
  { id: "all", label: "Everyone" },
];
const NO_BUS = "__nobus__";

// Bulk card setup: pick a group (company, bus, only people without a card),
// press Start, then tap blank cards on the reader one after another. Each
// card goes to the next person automatically and is sent to their bus
// tablet. A USB reader that types the card ID (keyboard style) works too.
export default function BulkCardIssue({ people, vehicles, companies, companyName, tapRef, feedback, addLog, readerReady, onIssued }) {
  const [company, setCompany] = useState(companies.length === 1 ? companies[0].id : "all");
  const [bus, setBus] = useState("all");
  const [type, setType] = useState("staff");
  const [onlyNew, setOnlyNew] = useState(true);
  const [unticked, setUnticked] = useState(() => new Set());
  const [stage, setStage] = useState("pick"); // pick | run | done
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]); // { key, name, bus, uid, ok, error, skipped }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [typed, setTyped] = useState("");
  const typedRef = useRef(null);

  const buses = vehicles.filter((v) => company === "all" || v.company_id === company);
  const group = useMemo(() => people
    .filter((p) => type === "all" || p.type === type)
    .filter((p) => company === "all" || p.company_id === company)
    .filter((p) => bus === "all" || (bus === NO_BUS ? !p.vehicle_id && !p.assigned_vehicle : p.vehicle_id === bus))
    .filter((p) => !onlyNew || p.status !== "Card Issued")
    .sort((a, b) => (a.assigned_vehicle || "~").localeCompare(b.assigned_vehicle || "~", undefined, { numeric: true }) || (a.name || "").localeCompare(b.name || "")),
  [people, type, company, bus, onlyNew]);
  const picked = group.filter((p) => !unticked.has(p.key));

  const current = stage === "run" ? queue[idx] : null;
  const doneCount = results.filter((r) => r.ok).length;

  const start = () => {
    if (!picked.length) return;
    setQueue(picked);
    setIdx(0);
    setResults([]);
    setError("");
    setPaused(false);
    setStage("run");
    addLog?.(`Bulk setup: ${picked.length} cards to program`, "ok");
  };

  const advance = (i) => {
    if (i + 1 >= queue.length) { setStage("done"); onIssued?.(); return; }
    setIdx(i + 1);
    setError("");
  };

  const issue = async (uidRaw, cardType = "") => {
    const uid = normalizeUid(uidRaw);
    if (stage !== "run" || paused || busy || !current || uid.length < 8) return;
    setBusy(true);
    setError("");
    const person = current;
    const at = idx;
    try {
      const res = await base44.functions.invoke("nfcCards", {
        action: "issue", person_key: person.key, uid, card_type: cardType, access_level: person.card?.access_level || person.default_access,
      });
      const data = res.data || {};
      if (!data.ok) throw new Error(data.error || "Card not issued");
      feedback?.("success", { beep: true, led: true });
      addLog?.(`CARD_PROGRAMMED · ${formatUid(uid)} → ${person.name}`, "ok");
      setResults((r) => [...r, { key: person.key, name: person.name, bus: person.assigned_vehicle, uid, ok: true, sent: !!data.sent_to_bus }]);
      setTimeout(() => advance(at), 500);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      feedback?.("error", { beep: true, led: true });
      addLog?.(`CARD_REJECTED · ${formatUid(uid)} · ${msg}`, "error");
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Taps from the reader (USB helper or built-in NFC) arrive here.
  useEffect(() => {
    tapRef.current = ({ uid, cardType }) => issue(uid, cardType);
    return () => { tapRef.current = null; };
  });

  // Keep the card-ID box focused while running, for keyboard-style readers.
  useEffect(() => { if (stage === "run" && !paused) typedRef.current?.focus(); }, [stage, idx, paused]);

  const skip = () => {
    if (!current) return;
    setResults((r) => [...r, { key: current.key, name: current.name, bus: current.assigned_vehicle, skipped: true }]);
    advance(idx);
  };

  if (stage === "pick") {
    return (
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <p className="font-semibold">Bulk card setup</p>
          <p className="text-sm text-muted-foreground">Pick who gets a card, press Start, then tap the cards one after another.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {companies.length > 0 && (
            <Select value={company} onValueChange={(v) => { setCompany(v); setBus("all"); setUnticked(new Set()); }}>
              <SelectTrigger className="h-9" aria-label="Company"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={bus} onValueChange={(v) => { setBus(v); setUnticked(new Set()); }}>
            <SelectTrigger className="h-9" aria-label="Bus"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buses</SelectItem>
              <SelectItem value={NO_BUS}>No bus yet</SelectItem>
              {buses.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => { setType(v); setUnticked(new Set()); }}>
            <SelectTrigger className="h-9" aria-label="Card holder role"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm h-9">
            <Checkbox checked={onlyNew} onCheckedChange={(v) => { setOnlyNew(!!v); setUnticked(new Set()); }} /> Only people without a card
          </label>
        </div>

        <div className="rounded-xl border max-h-[46vh] overflow-y-auto">
          {group.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nobody matches. Try another bus or untick “Only people without a card”.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 w-10">
                    <Checkbox aria-label="Select all" checked={unticked.size === 0} onCheckedChange={(v) => setUnticked(v ? new Set() : new Set(group.map((p) => p.key)))} />
                  </th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Bus</th>
                  <th className="px-2 py-2 font-medium hidden md:table-cell">Company</th>
                  <th className="px-2 py-2 font-medium">Card</th>
                </tr>
              </thead>
              <tbody>
                {group.map((p) => (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="px-3 py-1.5">
                      <Checkbox aria-label={`Include ${p.name}`} checked={!unticked.has(p.key)}
                        onCheckedChange={(v) => setUnticked((s) => { const n = new Set(s); if (v) n.delete(p.key); else n.add(p.key); return n; })} />
                    </td>
                    <td className="px-2 py-1.5 font-medium">{p.name}</td>
                    <td className="px-2 py-1.5">{p.assigned_vehicle || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-1.5 hidden md:table-cell text-muted-foreground">{companyName(p)}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{p.status === "Card Issued" ? "Has a card (will be replaced)" : p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button className="h-11 px-6" onClick={start} disabled={!picked.length}>
            <Play className="w-4 h-4" /> Start · {picked.length} card{picked.length === 1 ? "" : "s"}
          </Button>
          {!readerReady && <p className="text-xs text-amber-600 dark:text-amber-400">No reader connected — you can still type or scan each card ID.</p>}
        </div>
      </div>
    );
  }

  const pct = queue.length ? Math.round((Math.min(idx + (stage === "done" ? 1 : 0), queue.length) / queue.length) * 100) : 0;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <span className="text-sm font-semibold tabular-nums">{stage === "done" ? queue.length : idx + 1} / {queue.length}</span>
        </div>

        {stage === "done" ? (
          <div className="rounded-xl border-2 border-green-600/60 bg-green-600/10 p-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-xl font-bold">All done</p>
            <p className="text-sm text-muted-foreground">
              {doneCount} card{doneCount === 1 ? "" : "s"} issued{results.some((r) => r.skipped) ? ` · ${results.filter((r) => r.skipped).length} skipped` : ""}. Each card was sent to its bus tablet.
            </p>
            <Button variant="outline" onClick={() => setStage("pick")}><RotateCcw className="w-4 h-4" /> Set up more cards</Button>
          </div>
        ) : (
          <>
            <div className={`rounded-xl border-2 p-5 flex items-center gap-4 transition-colors ${error ? "border-rose-600/70 bg-rose-600/10" : busy ? "border-amber-500/70 bg-amber-500/10" : paused ? "border-border bg-muted/40" : "border-primary/60 bg-primary/10"}`} role="status" aria-live="polite">
              <div className="relative shrink-0">
                {!busy && !paused && !error && <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" aria-hidden="true" />}
                <div className="relative w-14 h-14 rounded-full grid place-items-center bg-background border">
                  {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : error ? <XCircle className="w-7 h-7 text-rose-600" /> : <Nfc className="w-7 h-7 text-primary" />}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{paused ? "Paused" : busy ? "Registering…" : "Place a card for"}</p>
                <p className="text-2xl font-bold truncate">{current?.name}</p>
                <p className="text-sm text-muted-foreground truncate">{[companyName(current || {}), current?.assigned_vehicle].filter(Boolean).join(" · ") || "No bus"}</p>
                {error && <p className="text-sm font-medium text-rose-600 mt-1">{error} Try another card, or skip.</p>}
              </div>
            </div>
            {queue[idx + 1] && <p className="text-xs text-muted-foreground">Next: <b>{queue[idx + 1].name}</b>{queue[idx + 1].assigned_vehicle ? ` · ${queue[idx + 1].assigned_vehicle}` : ""}</p>}
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const v = typed; setTyped(""); issue(v); }}>
              <Input ref={typedRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Tap a card, or type / scan its ID" className="font-mono flex-1 min-w-[220px]" aria-label="Card ID" disabled={paused} />
              <Button type="submit" variant="outline" disabled={!typed || paused || busy}>Use ID</Button>
              <Button type="button" variant="outline" onClick={skip} disabled={busy}><SkipForward className="w-4 h-4" /> Skip</Button>
              <Button type="button" variant="outline" onClick={() => setPaused((p) => !p)}>{paused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}</Button>
              <Button type="button" variant="ghost" onClick={() => { setStage("done"); onIssued?.(); }}>Finish</Button>
            </form>
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <p className="px-3 py-2 border-b text-sm font-semibold">This batch</p>
        <ul className="max-h-[52vh] overflow-y-auto divide-y text-sm">
          {queue.map((p, i) => {
            const r = [...results].reverse().find((x) => x.key === p.key);
            const isCurrent = stage === "run" && i === idx;
            return (
              <li key={p.key} className={`flex items-center gap-2 px-3 py-1.5 ${isCurrent ? "bg-primary/10" : ""}`}>
                {r?.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : r?.skipped ? <SkipForward className="w-4 h-4 text-muted-foreground shrink-0" /> : isCurrent ? <Nfc className="w-4 h-4 text-primary shrink-0" /> : <span className="w-4 h-4 rounded-full border shrink-0" />}
                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{r?.ok ? formatUid(r.uid) : r?.skipped ? "skipped" : p.assigned_vehicle || ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
