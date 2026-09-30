import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, CreditCard, Download, Keyboard, Loader2, Nfc, Plus, RefreshCw,
  Search, ShieldCheck, Terminal, Usb, UserRound, XCircle,
} from "lucide-react";
import { useCardReader, formatUid, normalizeUid, HELPER_DOWNLOAD } from "@/lib/cardReader";

const ROLE_FILTERS = [
  { id: "all", label: "All" },
  { id: "driver", label: "Drivers" },
  { id: "mechanic", label: "Mechanics" },
  { id: "staff", label: "Staff" },
  { id: "other", label: "Other" },
];
const STATUS_STYLE = {
  "Unassigned": "bg-muted text-muted-foreground border-border",
  "Card Issued": "bg-green-600/15 text-green-700 dark:text-green-300 border-green-600/40",
  "Expired": "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  "Revoked": "bg-rose-600/15 text-rose-700 dark:text-rose-300 border-rose-600/40",
};
const ACCESS_LEVELS = ["DEPOT_DRIVER_ZONE", "DEPOT_WORKSHOP", "DEPOT_DISPATCH", "DEPOT_ALL_ACCESS", "STAFF_BUS_BOARDING", "DEPOT_GENERAL"];
const HOLDER_ROLES = ["Dispatcher", "Inspector", "Supervisor", "Cleaner", "Security", "Other"];
const PREF_KEY = "tt-card-issuing-prefs";

const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "—");

function readPrefs() {
  try { return { beep: true, led: true, batch: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { beep: true, led: true, batch: false }; }
}

// ---------------------------------------------------------------------------
// Reader connection badge
function ReaderBadge({ helper, reader, webNfc }) {
  if (helper === "connected" && reader) {
    return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-600/40 bg-green-600/10 text-sm font-medium text-green-700 dark:text-green-300"><Usb className="w-4 h-4" /> {reader}</span>;
  }
  if (helper === "connected") {
    return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-sm font-medium text-amber-700 dark:text-amber-300"><Usb className="w-4 h-4" /> Helper running · plug in the ACR122U</span>;
  }
  if (webNfc) {
    return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-sm font-medium"><Nfc className="w-4 h-4" /> Using this device's NFC</span>;
  }
  return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground"><Usb className="w-4 h-4" /> {helper === "connecting" ? "Looking for reader…" : helper === "idle" ? "No reader connected" : "Reader not connected"}</span>;
}

// ---------------------------------------------------------------------------
// The big tap target
const PHASES = {
  noperson: { cls: "border-border bg-muted/40 text-muted-foreground", icon: UserRound, title: "Pick someone from the list", sub: "Then program their card here." },
  ready: { cls: "border-border bg-card", icon: CreditCard, title: "Ready to program", sub: "Press Program card, then place the card on the reader." },
  waiting: { cls: "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300", icon: Nfc, title: "Place NFC card on reader", sub: "Hold it flat on the ACR122U until it beeps." },
  encoding: { cls: "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300 animate-pulse", icon: Loader2, title: "Registering card…", sub: "Checking it isn't already in use." },
  success: { cls: "border-green-600/70 bg-green-600/15 text-green-700 dark:text-green-300", icon: CheckCircle2, title: "Card issued!", sub: "" },
  error: { cls: "border-rose-600/70 bg-rose-600/15 text-rose-700 dark:text-rose-300", icon: XCircle, title: "Card not issued", sub: "" },
  check: { cls: "border-primary/60 bg-primary/10", icon: ShieldCheck, title: "Check a card", sub: "Place any card on the reader to see who it belongs to." },
};

function TapTarget({ phase, message, uid }) {
  const p = PHASES[phase] || PHASES.ready;
  const Icon = p.icon;
  return (
    <div className={`rounded-3xl border-2 min-h-[220px] flex flex-col items-center justify-center text-center gap-3 p-6 transition-colors ${p.cls}`} role="status" aria-live="polite">
      <div className="relative">
        {phase === "waiting" && <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" aria-hidden="true" />}
        <div className="relative w-20 h-20 rounded-full grid place-items-center bg-background/70 border border-current/20">
          <Icon className={`w-10 h-10 ${phase === "encoding" ? "animate-spin" : ""}`} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold">{p.title}</p>
        <p className="text-sm opacity-90 mt-1">{message || p.sub}</p>
        {uid && <p className="font-mono text-sm mt-2 opacity-90">Card {formatUid(uid)}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AddHolderDialog({ open, onOpenChange, companies, onAdded }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ full_name: "", employee_id: "", role: "Dispatcher", company_id: "", assigned_vehicle: "" });
  const [busy, setBusy] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const save = async () => {
    if (!form.full_name.trim()) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "add_holder", ...form });
      toast({ title: `${form.full_name} added` });
      onAdded?.(res.data?.holder);
      onOpenChange(false);
      setForm({ full_name: "", employee_id: "", role: "Dispatcher", company_id: "", assigned_vehicle: "" });
    } catch (e) {
      toast({ title: "Couldn't add", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a card holder</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">For dispatchers, inspectors and others who aren't drivers, mechanics or bus staff.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ch-name">Full name</Label><Input id="ch-name" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ch-emp">Employee ID</Label><Input id="ch-emp" value={form.employee_id} onChange={(e) => set({ employee_id: e.target.value })} placeholder="e.g. EMP-0142" /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => set({ role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{HOLDER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {companies.length > 0 && (
            <div className="space-y-1.5"><Label>Company</Label>
              <Select value={form.company_id || "__none__"} onValueChange={(v) => set({ company_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="ch-bus">Assigned bus (optional)</Label><Input id="ch-bus" value={form.assigned_vehicle} onChange={(e) => set({ assigned_vehicle: e.target.value })} placeholder="e.g. Bus #14" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !form.full_name.trim()}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function IssuedCards({ cards, people, onRevoked }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");
  const list = cards
    .filter((c) => (show === "all" ? true : show === "active" ? c.is_active : !c.is_active))
    .filter((c) => !q || `${c.holder_name} ${c.card_uid} ${c.employee_id} ${c.role} ${c.access_level}`.toLowerCase().includes(q.toLowerCase()));
  const revoke = async (card) => {
    if (!(await confirmAction({ title: `Revoke ${card.holder_name}'s card?`, description: `Card ${formatUid(card.card_uid)} will stop working straight away, including on the bus boarding tablets.`, confirmLabel: "Revoke card" }))) return;
    try {
      await base44.functions.invoke("nfcCards", { action: "revoke", card_id: card.id, reason: "Revoked by admin" });
      toast({ title: "Card revoked" });
      onRevoked?.();
    } catch (e) {
      toast({ title: "Couldn't revoke", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
  };
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, card ID, employee ID…" className="pl-9" aria-label="Search issued cards" />
        </div>
        <Select value={show} onValueChange={setShow}>
          <SelectTrigger className="w-40" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active cards</SelectItem>
            <SelectItem value="inactive">Revoked / replaced</SelectItem>
            <SelectItem value="all">All cards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Card ID</th><th className="px-3 py-2 font-medium">Holder</th><th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Access</th><th className="px-3 py-2 font-medium">Issued</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No cards here yet.</td></tr>}
            {list.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{formatUid(c.card_uid)}<div className="text-xs text-muted-foreground font-sans">{c.card_type || ""}</div></td>
                <td className="px-3 py-2">{c.holder_name}<div className="text-xs text-muted-foreground">{c.employee_id || ""}</div></td>
                <td className="px-3 py-2">{c.role}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.access_level}</td>
                <td className="px-3 py-2">{fmtDate(c.issue_date)}<div className="text-xs text-muted-foreground">{c.issued_by || ""}</div></td>
                <td className="px-3 py-2">
                  {c.is_active
                    ? <Badge className="bg-green-600/15 text-green-700 dark:text-green-300 border border-green-600/40 hover:bg-green-600/15">Active</Badge>
                    : <span className="text-xs text-muted-foreground">{c.revoke_reason || "Revoked"}<br />{fmtDate(c.revoked_at)}</span>}
                </td>
                <td className="px-3 py-2 text-right">{c.is_active && <Button size="sm" variant="outline" className="text-destructive" onClick={() => revoke(c)}>Revoke</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground border-t">{people.filter((p) => p.status === "Card Issued").length} of {people.length} people have an active card.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function CardIssuingTab({ companies = [] }) {
  const { toast } = useToast();
  const [people, setPeople] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("issue"); // issue | cards
  const [mode, setMode] = useState("issue"); // issue | check
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(null);
  const [phase, setPhase] = useState("noperson");
  const [message, setMessage] = useState("");
  const [lastUid, setLastUid] = useState("");
  const [cardType, setCardType] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [employeeId, setEmployeeId] = useState("");
  const [access, setAccess] = useState("");
  const [expiry, setExpiry] = useState("");
  const [prefs, setPrefs] = useState(readPrefs);
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const consoleRef = useRef(null);
  const batchTimer = useRef(null);

  const setPref = (p) => setPrefs((prev) => {
    const next = { ...prev, ...p };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "people" });
      setPeople(res.data?.people || []);
      setCards(res.data?.cards || []);
    } catch (e) {
      toast({ title: "Couldn't load staff", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(batchTimer.current), []);

  const selected = people.find((p) => p.key === selectedKey) || null;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people.filter((p) =>
      (roleFilter === "all" || p.type === roleFilter)
      && (statusFilter === "all" || p.status === statusFilter)
      && (!term || `${p.name} ${p.employee_id} ${p.assigned_vehicle} ${p.email} ${p.role}`.toLowerCase().includes(term)));
  }, [people, q, roleFilter, statusFilter]);

  const select = (p) => {
    clearTimeout(batchTimer.current);
    setSelectedKey(p?.key || null);
    setEmployeeId(p?.employee_id || "");
    setAccess(p?.card?.access_level || p?.default_access || "");
    setExpiry("");
    setMessage("");
    setLastUid("");
    setCardType("");
    setPhase(p ? "ready" : "noperson");
  };

  const armed = mode === "check" || phase === "waiting";

  const onTap = async ({ uid, cardType: type }) => {
    setLastUid(uid);
    if (type) setCardType(type);
    if (mode === "check") {
      addLog(`Checking card ${formatUid(uid)}…`);
      try {
        const res = await base44.functions.invoke("nfcCards", { action: "verify", uid });
        const owner = res.data?.owner;
        setCheckResult({ uid, owner, cardType: type });
        addLog(owner ? `Card belongs to ${owner.name}` : "Card is not issued to anyone", owner ? "ok" : "warn");
        feedback(owner ? "success" : "error", { beep: prefs.beep, led: prefs.led });
      } catch (e) {
        addLog(`Check failed: ${e?.response?.data?.error || e.message}`, "error");
      }
      return;
    }
    if (phase !== "waiting" || !selected) return;
    setPhase("encoding");
    setMessage("");
    addLog(`Registering ${formatUid(uid)} for ${selected.name}…`);
    try {
      const res = await base44.functions.invoke("nfcCards", {
        action: "issue", person_key: selected.key, uid, card_type: type || cardType,
        employee_id: employeeId, access_level: access, expiry_date: expiry,
      });
      const data = res.data || {};
      if (!data.ok) throw Object.assign(new Error(data.error || "Card not issued"), { code: data.code });
      setPhase("success");
      setMessage(`${selected.name} · ${access}${data.replaced ? " · old card deactivated" : ""}`);
      addLog(`CARD_PROGRAMMED · ${formatUid(uid)} → ${selected.name}`, "ok");
      feedback("success", { beep: prefs.beep, led: prefs.led });
      await load();
      if (prefs.batch) {
        batchTimer.current = setTimeout(() => {
          const next = filtered.find((p) => p.key !== selected.key && p.status === "Unassigned");
          if (next) {
            select(next);
            setPhase("waiting");
            addLog(`Batch mode: next up ${next.name}`);
          } else {
            addLog("Batch mode: everyone in this list has a card", "ok");
          }
        }, 1800);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setPhase("error");
      setMessage(msg);
      addLog(`CARD_REJECTED · ${formatUid(uid)} · ${msg}`, "error");
      feedback("error", { beep: true, led: prefs.led });
    }
  };

  const { helper, reader, webNfc, log, addLog, feedback, connect, access: localAccess } = useCardReader(onTap, { active: armed });

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const program = () => {
    if (!selected) return;
    setMessage("");
    setLastUid("");
    setPhase("waiting");
    addLog(`Waiting for a card for ${selected.name}${helper !== "connected" && !webNfc ? " (no reader — type the card ID)" : ""}`);
    if (helper !== "connected" && !webNfc) setManualOpen(true);
  };

  const submitManual = (e) => {
    e.preventDefault();
    const uid = normalizeUid(manualUid);
    if (uid.length < 8) { toast({ title: "Card ID should be at least 8 hex characters", variant: "destructive" }); return; }
    setManualUid("");
    setManualOpen(false);
    onTap({ uid, cardType: "", source: "manual" });
  };

  const counts = useMemo(() => {
    const c = { all: people.length };
    for (const p of people) c[p.type] = (c[p.type] || 0) + 1;
    return c;
  }, [people]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CreditCard className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Card issuing</h2>
        <div className="flex rounded-lg border p-0.5 ml-2" role="tablist" aria-label="Card issuing view">
          {[["issue", "Issue cards"], ["cards", `Issued cards (${cards.filter((c) => c.is_active).length})`]].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`px-3 h-9 rounded-md text-sm font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ReaderBadge helper={helper} reader={reader} webNfc={webNfc} />
          <Button variant="ghost" size="icon" onClick={load} aria-label="Reload"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {(helper === "idle" || helper === "offline") && !webNfc && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center gap-4">
          <Usb className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-[280px] text-sm space-y-1">
            {localAccess === "denied" ? (
              <>
                <p className="font-semibold">Chrome is blocking the card reader</p>
                <p className="text-muted-foreground">Click the icon left of the web address → <b>Site settings</b> → set <b>Local network access</b> (or “Apps on device”) to <b>Allow</b>, then press Connect reader.</p>
              </>
            ) : helper === "offline" ? (
              <>
                <p className="font-semibold">Can't find the reader helper on this PC</p>
                <p className="text-muted-foreground">Make sure <b>TransitTrack Card Reader</b> is running (its window says “Listening”), then press Connect reader. You can still type card IDs by hand.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Using an ACS ACR122U reader on this Windows PC?</p>
                <ol className="text-muted-foreground list-decimal ml-4">
                  <li>Download the helper and double-click it (if Windows warns you: <i>More info → Run anyway</i>). Leave its window open.</li>
                  <li>Press <b>Connect reader</b>. Chrome asks to let this site use apps on this device — choose <b>Allow</b>.</li>
                </ol>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><a href={HELPER_DOWNLOAD} download><Download className="w-4 h-4" /> Download helper</a></Button>
            <Button onClick={connect}><Usb className="w-4 h-4" /> Connect reader</Button>
          </div>
        </div>
      )}

      {view === "cards" ? (
        <IssuedCards cards={cards} people={people} onRevoked={load} />
      ) : (
        <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* STAFF QUEUE */}
          <aside className="rounded-2xl border bg-card flex flex-col xl:h-[calc(100vh-190px)] xl:min-h-[560px]" aria-label="Staff queue">
            <div className="p-3 space-y-2 border-b">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, employee ID or bus" className="pl-9" aria-label="Search staff" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_FILTERS.map((r) => (
                  <button key={r.id} onClick={() => setRoleFilter(r.id)} aria-pressed={roleFilter === r.id}
                    className={`px-2.5 h-8 rounded-full border text-xs font-semibold ${roleFilter === r.id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {r.label} <span className="opacity-70">{counts[r.id] || 0}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 flex-1" aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {Object.keys(STATUS_STYLE).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add</Button>
              </div>
              <label className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm"><span className="font-medium">Batch mode</span><span className="block text-xs text-muted-foreground">Move to the next unassigned person after each card</span></span>
                <Switch checked={prefs.batch} onCheckedChange={(v) => setPref({ batch: v })} aria-label="Batch mode" />
              </label>
            </div>
            <ul className="flex-1 min-h-[240px] overflow-y-auto p-2 space-y-1">
              {loading && <li className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></li>}
              {!loading && filtered.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nobody matches.</li>}
              {filtered.map((p) => (
                <li key={p.key}>
                  <button onClick={() => { setMode("issue"); select(p); }} aria-current={p.key === selectedKey}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left border transition-colors ${p.key === selectedKey ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60"}`}>
                    <span className="w-9 h-9 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">{initials(p.name)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{p.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{[p.role, p.employee_id, p.assigned_vehicle].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* WORKSPACE */}
          <section className="space-y-4 min-w-0" aria-label="Card programming">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Mode">
                {[["issue", "Issue a card"], ["check", "Check a card"]].map(([v, l]) => (
                  <button key={v} role="tab" aria-selected={mode === v}
                    onClick={() => { setMode(v); setCheckResult(null); setPhase(v === "check" ? "check" : selected ? "ready" : "noperson"); }}
                    className={`px-3 h-9 rounded-md text-sm font-medium ${mode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}>
                <Keyboard className="w-4 h-4" /> Type a card ID
              </Button>
            </div>

            {manualOpen && (
              <form onSubmit={submitManual} className="flex flex-wrap gap-2 rounded-xl border p-3">
                <Input value={manualUid} onChange={(e) => setManualUid(e.target.value)} placeholder="e.g. 04:A2:8B:22:6F:1C:80" className="font-mono flex-1 min-w-[220px]" aria-label="Card ID" autoFocus />
                <Button type="submit" disabled={!armed}>{mode === "check" ? "Check" : "Use this ID"}</Button>
                {!armed && <p className="w-full text-xs text-muted-foreground">Press Program card first.</p>}
              </form>
            )}

            {mode === "check" ? (
              <>
                <TapTarget phase="check" uid={checkResult?.uid} message={checkResult ? "" : undefined} />
                {checkResult && (
                  <div className={`rounded-2xl border p-4 ${checkResult.owner ? "border-green-600/40" : "border-rose-600/40"}`}>
                    {checkResult.owner ? (
                      <p className="text-lg font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" /> {checkResult.owner.name}</p>
                    ) : (
                      <p className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-600" /> Not issued to anyone</p>
                    )}
                    {checkResult.owner?.card && (
                      <p className="text-sm text-muted-foreground mt-1">{checkResult.owner.card.role} · {checkResult.owner.card.access_level} · issued {fmtDate(checkResult.owner.card.issue_date)}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <TapTarget phase={phase} message={message} uid={phase === "success" || phase === "error" ? lastUid : ""} />

                <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <p className="text-sm font-semibold">Card details</p>
                    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Employee</dt><dd className="font-medium truncate">{selected?.name || "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Role</dt><dd className="font-medium">{selected ? `${selected.role}${selected.company_name ? ` · ${selected.company_name}` : ""}` : "—"}</dd></div>
                      <div>
                        <dt><Label htmlFor="ci-emp" className="text-xs text-muted-foreground">Employee ID</Label></dt>
                        <dd><Input id="ci-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!selected} placeholder="Optional" className="h-9 mt-1" /></dd>
                      </div>
                      <div>
                        <dt><Label className="text-xs text-muted-foreground">Access clearance</Label></dt>
                        <dd>
                          <Select value={access || "__none__"} onValueChange={(v) => setAccess(v === "__none__" ? "" : v)} disabled={!selected}>
                            <SelectTrigger className="h-9 mt-1 font-mono text-xs"><SelectValue placeholder="Choose" /></SelectTrigger>
                            <SelectContent>{[...new Set([...(access ? [access] : []), ...ACCESS_LEVELS])].map((a) => <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>)}</SelectContent>
                          </Select>
                        </dd>
                      </div>
                      <div>
                        <dt><Label htmlFor="ci-exp" className="text-xs text-muted-foreground">Expires (optional)</Label></dt>
                        <dd><Input id="ci-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!selected} className="h-9 mt-1" /></dd>
                      </div>
                      <div><dt className="text-xs text-muted-foreground">Card type</dt><dd className="font-medium">{cardType || "Detected on tap (MIFARE Classic / NTAG)"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Assigned bus</dt><dd className="font-medium">{selected?.assigned_vehicle || "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Current card</dt><dd className="font-mono">{selected?.card ? formatUid(selected.card.card_uid) : selected?.legacy_tag ? `${formatUid(selected.legacy_tag)} (kiosk)` : "None"}</dd></div>
                    </dl>
                    <p className="text-xs text-muted-foreground">The card's built-in ID is registered to this person. Nothing is written onto the card, so any MIFARE or NTAG card works and a lost card can't be copied from our data.</p>
                  </div>

                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <p className="text-sm font-semibold">Reader feedback</p>
                    <label className="flex items-center justify-between gap-2 text-sm">Beep on success<Switch checked={prefs.beep} onCheckedChange={(v) => setPref({ beep: v })} /></label>
                    <label className="flex items-center justify-between gap-2 text-sm">Flash green light<Switch checked={prefs.led} onCheckedChange={(v) => setPref({ led: v })} /></label>
                    <p className="text-xs text-muted-foreground">A refused card always double-beeps and flashes red.</p>
                  </div>
                </div>

                <Button className="w-full h-14 text-base" disabled={!selected || phase === "encoding"} onClick={program}>
                  <Nfc className="w-5 h-5" />
                  {phase === "waiting" ? `Waiting for ${selected?.name || ""}'s card…` : selected ? `Program card for ${selected.name}` : "Pick someone to program a card"}
                </Button>
                {phase === "waiting" && (
                  <Button variant="ghost" className="w-full -mt-2" onClick={() => setPhase("ready")}>Cancel</Button>
                )}
              </>
            )}

            {/* LIVE CONSOLE */}
            <div className="rounded-2xl border bg-[#0b0f14] text-slate-200">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-xs text-slate-400">
                <Terminal className="w-3.5 h-3.5" /> Reader log
              </div>
              <div ref={consoleRef} className="h-44 overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5" aria-live="polite">
                {log.length === 0 && <p className="text-slate-500">Waiting for the reader…</p>}
                {log.map((l, i) => (
                  <p key={i} className={l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-300" : l.level === "ok" ? "text-emerald-300" : l.level === "apdu" ? "text-sky-300" : ""}>
                    <span className="text-slate-500">{l.t.toLocaleTimeString([], { hour12: false })} </span>{l.text}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      <AddHolderDialog open={addOpen} onOpenChange={setAddOpen} companies={companies} onAdded={() => load()} />
    </div>
  );
}
