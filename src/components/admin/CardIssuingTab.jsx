import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusChip } from "@/components/admin/kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Bus, CheckCircle2, CreditCard, Download, ExternalLink, Keyboard, Loader2, Nfc, Plus, RefreshCw,
  Search, Send, ShieldCheck, Tablet, Terminal, Usb, UserRound, XCircle,
} from "lucide-react";
import { useCardReader, formatUid, normalizeUid, HELPER_DOWNLOAD, HELPER_URL } from "@/lib/cardReader";
import BulkCardIssue from "@/components/admin/BulkCardIssue";
import { useLocation } from "react-router-dom";

const ROLE_FILTERS = [
  { id: "all", label: "All" },
  { id: "driver", label: "Drivers" },
  { id: "mechanic", label: "Mechanics" },
  { id: "staff", label: "Passengers" },
  { id: "other", label: "Other" },
];
const STATUS_STYLE = {
  "Unassigned": "bg-muted text-muted-foreground border-border",
  "Card Issued": "bg-success/15 text-success border-success/40",
  "Expired": "bg-warning/15 text-warning border-warning/40",
  "Revoked": "bg-danger/15 text-danger border-danger/40",
};
const ACCESS_LEVELS = ["DEPOT_DRIVER_ZONE", "DEPOT_WORKSHOP", "DEPOT_DISPATCH", "DEPOT_ALL_ACCESS", "STAFF_BUS_BOARDING", "DEPOT_GENERAL"];
const PREF_KEY = "tt-card-issuing-prefs";
// Browsers won't let a page shown inside another page (e.g. the Base44
// editor preview) reach programs on this PC, and Safari never allows it.
const IN_FRAME = (() => { try { return window.self !== window.top; } catch { return true; } })();
const IS_SAFARI = typeof navigator !== "undefined" && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "—");
const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : fmtDate(iso);
};

const NO_BUS = "__none__";

// The bus a staff member rides, and sending their card to that bus's
// boarding tablet (it re-downloads the card list on its next check-in,
// within about 30 seconds).
// Asks every paired boarding tablet to download its bus's card list now
// (each bus's tablet only ever gets its own bus's riders, as names and card
// fingerprints, never raw card numbers). Uses the same per-bus send as the
// "Send to bus tablet" button, once for each bus that has a tablet.
function SendAllToTablets({ tablets, vehicles, onSent }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const buses = [...new Set(tablets.filter((t) => t.paired && t.active && t.vehicle_id).map((t) => t.vehicle_id))];
  const send = async () => {
    setBusy(true);
    let sent = 0;
    const failed = [];
    for (const vehicleId of buses) {
      try {
        const res = await base44.functions.invoke("nfcCards", { action: "send_to_bus", vehicle_id: vehicleId });
        sent += res.data?.sent || 0;
      } catch {
        failed.push(vehicles.find((v) => v.id === vehicleId)?.name || "a bus");
      }
    }
    setBusy(false);
    if (failed.length) toast({ title: `Sent to ${sent} tablet${sent === 1 ? "" : "s"}; ${failed.length} bus${failed.length === 1 ? "" : "es"} failed`, description: `Try again for ${failed.join(", ")}.`, variant: "destructive" });
    else toast({ title: `Card list sent to ${sent} tablet${sent === 1 ? "" : "s"}`, description: "Each tablet downloads its bus's list within about 30 seconds." });
    onSent?.();
  };
  return (
    <Button variant="outline" size="sm" onClick={send} disabled={busy || !buses.length} title={buses.length ? undefined : "No paired boarding tablets yet"}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send card list to all tablets
    </Button>
  );
}

function BusLink({ person, vehicles, tablets, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const choices = vehicles.filter((v) => !person.company_id || !v.company_id || v.company_id === person.company_id);
  const onBus = tablets.filter((t) => t.vehicle_id === person.vehicle_id && t.paired && t.active);
  const sentAt = onBus.map((t) => t.directory_sent_at).filter(Boolean).sort().pop();
  const tell = (n, busName) => (n
    ? toast({ title: `Sent to ${busName}'s tablet`, description: "It picks up the card list within about 30 seconds." })
    : toast({ title: `${busName} has no boarding tablet yet`, description: "Set one up in Kiosk tablets — it will get the card list when it's paired." }));

  const change = async (vehicleId) => {
    setBusy("bus");
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "set_bus", person_key: person.key, vehicle_id: vehicleId === NO_BUS ? "" : vehicleId });
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v) tell(res.data?.sent_to_bus, v.name);
      await onChanged?.(res.data?.person_key);
    } catch (e) {
      toast({ title: "Couldn't change the bus", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };
  const send = async () => {
    setBusy("send");
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "send_to_bus", vehicle_id: person.vehicle_id });
      tell(res.data?.sent, person.assigned_vehicle || "This bus");
      await onChanged?.(person.key);
    } catch (e) {
      toast({ title: "Couldn't send", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  return (
    <div className="sm:col-span-2 rounded-lg bg-muted/40 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Bus</Label>
          <Select value={person.vehicle_id || NO_BUS} onValueChange={change} disabled={!!busy}>
            <SelectTrigger className="h-9 mt-1" aria-label="Bus"><SelectValue placeholder="Choose their bus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BUS}>No bus</SelectItem>
              {choices.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={send} disabled={!person.vehicle_id || !!busy}>
          {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to bus tablet
        </Button>
      </div>
      {person.vehicle_id && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Tablet className="w-3.5 h-3.5" />
          {onBus.length
            ? `${onBus.map((t) => t.label || "Boarding tablet").join(", ")} · seen ${ago(onBus[0].last_seen)} · last sent ${ago(sentAt)}`
            : "No boarding tablet on this bus yet — pair one in Kiosk tablets."}
        </p>
      )}
    </div>
  );
}

function readPrefs() {
  try { return { beep: true, led: true, batch: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { beep: true, led: true, batch: false }; }
}

// ---------------------------------------------------------------------------
// Reader connection badge
function ReaderBadge({ helper, reader, webNfc }) {
  if (helper === "connected" && reader) {
    return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-success/40 bg-success/10 text-sm font-medium text-success"><Usb className="w-4 h-4" /> {reader}</span>;
  }
  if (helper === "connected") {
    return <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-warning/40 bg-warning/10 text-sm font-medium text-warning"><Usb className="w-4 h-4" /> Helper running · plug in the ACR122U</span>;
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
  waiting: { cls: "border-danger/60 bg-danger/10 text-danger", icon: Nfc, title: "Place NFC card on reader", sub: "Hold it flat on the ACR122U until it beeps." },
  encoding: { cls: "border-warning/70 bg-warning/15 text-warning animate-pulse", icon: Loader2, title: "Registering card…", sub: "Checking it isn't already in use." },
  success: { cls: "border-success/70 bg-success/15 text-success", icon: CheckCircle2, title: "Card issued!", sub: "" },
  error: { cls: "border-danger/70 bg-danger/15 text-danger", icon: XCircle, title: "Card not issued", sub: "" },
  check: { cls: "border-primary/60 bg-primary/10", icon: ShieldCheck, title: "Check a card", sub: "Place any card on the reader to see who it belongs to." },
};

function TapTarget({ phase, message, uid }) {
  const p = PHASES[phase] || PHASES.ready;
  const Icon = p.icon;
  return (
    <div className={`rounded-xl border-2 flex items-center gap-4 px-4 py-3 min-h-[84px] transition-colors ${p.cls}`} role="status" aria-live="polite">
      <div className="relative shrink-0">
        {phase === "waiting" && <span className="absolute inset-0 rounded-full bg-danger/30 animate-ping" aria-hidden="true" />}
        <div className="relative w-12 h-12 rounded-full grid place-items-center bg-background/70 border border-current/20">
          <Icon className={`w-6 h-6 ${phase === "encoding" ? "animate-spin" : ""}`} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight">{p.title}</p>
        <p className="text-sm opacity-90">{message || p.sub}</p>
        {uid && <p className="font-mono text-xs mt-0.5 opacity-90">Card {formatUid(uid)}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New bus staff: a company's staff member, linked to one of its buses.
function AddStaffDialog({ open, onOpenChange, companies, vehicles, defaultCompany, onAdded }) {
  const { toast } = useToast();
  const empty = { full_name: "", company_id: "", vehicle_id: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => { if (open) setForm({ ...empty, company_id: defaultCompany && defaultCompany !== "all" ? defaultCompany : "" }); }, [open]);
  const pickCompany = companies.length > 0;
  const buses = vehicles.filter((v) => !pickCompany || (form.company_id && v.company_id === form.company_id));
  const ready = form.full_name.trim() && form.vehicle_id && (!pickCompany || form.company_id);
  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "add_holder", ...form });
      toast({ title: `${form.full_name.trim()} added`, description: "Now program their card." });
      onOpenChange(false);
      onAdded?.(res.data?.person_key);
    } catch (e) {
      toast({ title: "Couldn't add", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add passenger</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">Passengers belong to a company and ride one of its buses. Their card is sent to that bus's boarding tablet and only works on that bus.</p>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="st-name">Full name</Label><Input id="st-name" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} autoFocus /></div>
          {pickCompany && (
            <div className="space-y-1.5"><Label>Company</Label>
              <Select value={form.company_id || undefined} onValueChange={(v) => set({ company_id: v, vehicle_id: "" })}>
                <SelectTrigger aria-label="Company"><SelectValue placeholder="Choose a company" /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Bus</Label>
            <Select value={form.vehicle_id || undefined} onValueChange={(v) => set({ vehicle_id: v })} disabled={pickCompany && !form.company_id}>
              <SelectTrigger aria-label="Bus"><SelectValue placeholder={pickCompany && !form.company_id ? "Choose the company first" : "Choose their bus"} /></SelectTrigger>
              <SelectContent>
                {buses.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">This company has no buses yet.</div>}
                {buses.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !ready}>{busy ? "Adding…" : "Add passenger"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function IssuedCards({ cards, people, companies = [], onRevoked }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");
  const [company, setCompany] = useState("all");
  const list = cards
    .filter((c) => (show === "all" ? true : show === "active" ? c.is_active : !c.is_active))
    .filter((c) => company === "all" || c.company_id === company)
    .filter((c) => !q || `${c.holder_name} ${c.card_uid} ${c.company_name} ${c.assigned_vehicle} ${c.access_level}`.toLowerCase().includes(q.toLowerCase()));
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, card ID, company or bus…" className="pl-9" aria-label="Search issued cards" />
        </div>
        {companies.length > 0 && (
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-44" aria-label="Company"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={show} onValueChange={setShow}>
          <SelectTrigger className="w-40" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active cards</SelectItem>
            <SelectItem value="inactive">Revoked / replaced</SelectItem>
            <SelectItem value="all">All cards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Issued cards table">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Card ID</th><th className="px-3 py-2 font-medium">Holder</th><th className="px-3 py-2 font-medium">Bus</th>
              <th className="px-3 py-2 font-medium">Access</th><th className="px-3 py-2 font-medium">Issued</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No cards here yet.</td></tr>}
            {list.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{formatUid(c.card_uid)}<div className="text-xs text-muted-foreground font-sans">{c.card_type || ""}</div></td>
                <td className="px-3 py-2">{c.holder_name}<div className="text-xs text-muted-foreground">{c.company_name || ""}</div></td>
                <td className="px-3 py-2">{c.assigned_vehicle || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.access_level}</td>
                <td className="px-3 py-2">{fmtDate(c.issue_date)}<div className="text-xs text-muted-foreground">{c.issued_by || ""}</div></td>
                <td className="px-3 py-2">
                  {c.is_active
                    ? <StatusChip tone="success">Active</StatusChip>
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
  const location = useLocation();
  const [bulkPersonKeys] = useState(() => Array.isArray(location.state?.bulkPersonKeys) ? location.state.bulkPersonKeys.filter(k => typeof k === "string") : []);
  const { toast } = useToast();
  const [people, setPeople] = useState([]);
  const [cards, setCards] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tablets, setTablets] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(bulkPersonKeys.length ? "bulk" : "issue"); // issue | cards
  const [mode, setMode] = useState("issue"); // issue | check
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(() => new URLSearchParams(window.location.search).get("person"));
  const [phase, setPhase] = useState("noperson");
  const [message, setMessage] = useState("");
  const [lastUid, setLastUid] = useState("");
  const [cardType, setCardType] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [access, setAccess] = useState("");
  const [expiry, setExpiry] = useState("");
  const [prefs, setPrefs] = useState(readPrefs);
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const consoleRef = useRef(null);
  const bulkTapRef = useRef(null);
  const [logOpen, setLogOpen] = useState(false);

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
      setVehicles(res.data?.vehicles || []);
      setTablets(res.data?.tablets || []);
      return res.data?.people || [];
    } catch (e) {
      toast({ title: "Couldn't load people", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const selected = people.find((p) => p.key === selectedKey) || null;
  useEffect(() => {
    if (selected && phase === "noperson") { setPhase("ready"); setAccess(selected.default_access || "STAFF_BUS_BOARDING"); }
  }, [selected, phase]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people.filter((p) =>
      (roleFilter === "all" || p.type === roleFilter)
      && (statusFilter === "all" || p.status === statusFilter)
      && (companyFilter === "all" || p.company_id === companyFilter)
      && (!term || `${p.name} ${p.assigned_vehicle} ${p.email} ${p.company_name}`.toLowerCase().includes(term)));
  }, [people, q, roleFilter, statusFilter, companyFilter]);
  const companyName = (p) => p.company_name || companies.find((c) => c.id === p.company_id)?.name || "";

  const select = (p) => {
    setSelectedKey(p?.key || null);
    setAccess(p?.card?.access_level || p?.default_access || "");
    setExpiry("");
    setMessage("");
    setLastUid("");
    setCardType("");
    setPhase(p ? "ready" : "noperson");
  };

  const armed = mode === "check" || phase === "waiting";

  const onTap = async ({ uid, cardType: type }) => {
    if (view === "bulk") { bulkTapRef.current?.({ uid, cardType: type }); return; }
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
        access_level: access, expiry_date: expiry,
      });
      const data = res.data || {};
      if (!data.ok) throw Object.assign(new Error(data.error || "Card not issued"), { code: data.code });
      setPhase("success");
      setMessage(`${selected.name} · ${access}${data.replaced ? " · old card deactivated" : ""}${data.sent_to_bus ? ` · sent to ${selected.assigned_vehicle}'s tablet` : ""}`);
      addLog(`CARD_PROGRAMMED · ${formatUid(uid)} → ${selected.name}`, "ok");
      feedback("success", { beep: prefs.beep, led: prefs.led });
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setPhase("error");
      setMessage(msg);
      addLog(`CARD_REJECTED · ${formatUid(uid)} · ${msg}`, "error");
      feedback("error", { beep: true, led: prefs.led });
    }
  };

  const { helper, reader, webNfc, log, addLog, feedback, connect, access: localAccess } = useCardReader(onTap, { active: view === "bulk" || armed });

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const giveKeypadCode = async () => {
    if (!selected || codeBusy) return;
    if ((selected.has_access_code || selected.access_code) && !(await confirmAction({ title: `Give ${selected.name} a new keypad code?`, description: "Their current keypad code will stop working.", confirmLabel: "New code" }))) return;
    setCodeBusy(true);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "keypad_code", person_key: selected.key });
      addLog(`Keypad code for ${selected.name}: ${res.data?.code}`, "ok");
      toast({ title: `Keypad code for ${selected.name}: ${res.data?.code}`, description: "They type it on the bus boarding tablet's keypad." });
      await load();
    } catch (e) {
      toast({ title: "Couldn't make a code", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setCodeBusy(false); }
  };

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
        <div className="flex rounded-xl bg-secondary p-1" role="tablist" aria-label="Card issuing view">
          {[["issue", "Issue one"], ["bulk", "Bulk setup"], ["cards", `Issued cards (${cards.filter((c) => c.is_active).length})`]].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`h-9 rounded-lg px-3 text-body-sm font-semibold ${view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {window.transittrackDesktop?.openSetup && <Button variant="outline" onClick={()=>window.transittrackDesktop.openSetup('nfc').catch(()=>toast({title:"Couldn't open NFC setup",description:"Update TransitTrack Desktop and try again.",variant:"destructive"}))}><Usb className="w-4 h-4" />NFC setup</Button>}
          <ReaderBadge helper={helper} reader={reader} webNfc={webNfc} />
          <SendAllToTablets tablets={tablets} vehicles={vehicles} onSent={load} />
          <Button variant="ghost" size="icon" onClick={load} aria-label="Reload"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {(helper === "idle" || helper === "offline") && !webNfc && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 flex flex-wrap items-center gap-4">
          <Usb className="w-5 h-5 text-warning shrink-0" />
          <div className="flex-1 min-w-[280px] text-sm space-y-1">
            {IN_FRAME ? (
              <>
                <p className="font-semibold">Open Card issuing in its own tab</p>
                <p className="text-muted-foreground">The card reader can't connect while TransitTrack is shown inside another page (like the Base44 editor preview). Open it in its own Chrome or Edge tab.</p>
              </>
            ) : IS_SAFARI ? (
              <>
                <p className="font-semibold">Use Chrome or Edge for the card reader</p>
                <p className="text-muted-foreground">Safari can't talk to the reader helper. Open this page in Chrome or Microsoft Edge on the Windows PC the reader is plugged into.</p>
              </>
            ) : localAccess === "denied" ? (
              <>
                <p className="font-semibold">Chrome is blocking the card reader</p>
                <p className="text-muted-foreground">Click the icon left of the web address → <b>Site settings</b> → set <b>Local network access</b> (or “Apps on device”) to <b>Allow</b>, then press Connect reader.</p>
              </>
            ) : helper === "offline" ? (
              <>
                <p className="font-semibold">Can't reach the reader helper on this PC — check these in order:</p>
                <ol className="text-muted-foreground list-decimal ml-4 space-y-0.5">
                  <li>The black <b>TransitTrack Card Reader</b> window is open and says <b>Listening on http://127.0.0.1:8765</b>. Not open? Download the helper again and double-click it.</li>
                  <li><a href={`${HELPER_URL}/`} target="_blank" rel="noreferrer" className="underline font-medium text-foreground">Test the helper</a> — a page showing “TransitTrack Card Reader” means it's running. “Can't be reached” means it isn't.</li>
                  <li>Test works but still not connected? Chrome is blocking this site: click the icon left of the web address → <b>Site settings</b> → <b>Local network access</b> → <b>Allow</b>, then press Connect reader.</li>
                </ol>
                <p className="text-xs text-muted-foreground">You can still type card IDs by hand.</p>
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
            {IN_FRAME ? (
              <Button onClick={() => window.open(window.location.href, "_blank", "noopener")}><ExternalLink className="w-4 h-4" /> Open in new tab</Button>
            ) : (
              <>
                {window.transittrackDesktop?.openSetup ? <Button variant="outline" onClick={()=>window.transittrackDesktop.openSetup("nfc").catch(()=>toast({title:"Couldn't open NFC setup",variant:"destructive"}))}><Usb className="w-4 h-4" />Open NFC setup</Button> : <Button variant="outline" asChild><a href={HELPER_DOWNLOAD} download><Download className="w-4 h-4" /> Download helper</a></Button>}
                <Button onClick={window.transittrackDesktop?.openSetup && helper !== "connected" ? ()=>window.transittrackDesktop.openSetup("nfc").catch(()=>toast({title:"Couldn't open NFC setup",variant:"destructive"})) : connect}><Usb className="w-4 h-4" /> {helper === "offline" ? "Try again" : "Connect reader"}</Button>
              </>
            )}
          </div>
        </div>
      )}

      {view === "cards" ? (
        <IssuedCards cards={cards} people={people} companies={companies} onRevoked={load} />
      ) : view === "bulk" ? (
        <BulkCardIssue
          people={people} vehicles={vehicles} companies={companies} companyName={companyName} initialKeys={bulkPersonKeys} loading={loading}
          tapRef={bulkTapRef} feedback={feedback} addLog={addLog} readerReady={helper === "connected" || webNfc} onIssued={load}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-3 items-start">
          {/* STAFF QUEUE */}
          <aside className="rounded-2xl border bg-card flex flex-col lg:h-[calc(100vh-200px)] lg:min-h-[480px]" aria-label="People list">
            <div className="p-2.5 space-y-2 border-b">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or bus" className="pl-9 h-9" aria-label="Search people" />
              </div>
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-8" aria-label="Company"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All companies</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex flex-wrap gap-1.5">
                {ROLE_FILTERS.map((r) => (
                  <button key={r.id} onClick={() => setRoleFilter(r.id)} aria-pressed={roleFilter === r.id}
                    className={`px-2 h-7 rounded-full border text-xs font-semibold ${roleFilter === r.id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {r.label} <span className="opacity-70">{counts[r.id] || 0}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 flex-1" aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {Object.keys(STATUS_STYLE).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add passenger</Button>
              </div>
            </div>
            <ul className="flex-1 min-h-[240px] overflow-y-auto p-1.5 space-y-0.5">
              {loading && <li className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></li>}
              {!loading && filtered.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nobody matches.</li>}
              {filtered.map((p) => (
                <li key={p.key}>
                  <button onClick={() => { setMode("issue"); select(p); }} aria-current={p.key === selectedKey}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left border transition-colors ${p.key === selectedKey ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60"}`}>
                    <span className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">{initials(p.name)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{p.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{[companyName(p), p.assigned_vehicle].filter(Boolean).join(" · ") || (p.type === "staff" ? "No bus yet" : "")}</span>
                    </span>
                    <span className={`text-caption px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* WORKSPACE */}
          <section className="space-y-3 min-w-0" aria-label="Card programming">
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
                  <div className={`rounded-2xl border p-4 ${checkResult.owner ? "border-success/40" : "border-danger/40"}`}>
                    {checkResult.owner ? (
                      <p className="text-lg font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-success" /> {checkResult.owner.name}</p>
                    ) : (
                      <p className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-danger" /> Not issued to anyone</p>
                    )}
                    {checkResult.owner?.card && (
                      <p className="text-sm text-muted-foreground mt-1">{[checkResult.owner.card.company_name, checkResult.owner.card.assigned_vehicle].filter(Boolean).join(" · ") || checkResult.owner.card.role} · {checkResult.owner.card.access_level} · issued {fmtDate(checkResult.owner.card.issue_date)}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border bg-card p-3 space-y-3">
                {/* who + the big button, side by side */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-muted grid place-items-center text-sm font-bold shrink-0">{selected ? initials(selected.name) : <UserRound className="w-5 h-5 text-muted-foreground" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-lg leading-tight truncate">{selected?.name || "Pick someone from the list"}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {selected ? [companyName(selected), selected.assigned_vehicle || (selected.type === "staff" ? "No bus yet" : ""), selected.card ? `card ${formatUid(selected.card.card_uid)}` : selected.legacy_tag ? `card ${formatUid(selected.legacy_tag)}` : "no card yet"].filter(Boolean).join(" · ") : "Or use Bulk setup to do a whole bus at once."}
                    </p>
                  </div>
                  {phase === "waiting" ? (
                    <Button variant="outline" className="h-11" onClick={() => setPhase("ready")}>Cancel</Button>
                  ) : (
                    <Button className="h-11 px-5" disabled={!selected || phase === "encoding"} onClick={program}>
                      <Nfc className="w-5 h-5" /> {selected?.card || selected?.legacy_tag ? "Replace card" : "Program card"}
                    </Button>
                  )}
                </div>

                <TapTarget phase={phase} message={message} uid={phase === "success" || phase === "error" ? lastUid : ""} />

                {selected?.type === "staff" && (
                  <BusLink person={selected} vehicles={vehicles} tablets={tablets} onChanged={async (key) => { const list = await load(); const p = list?.find((x) => x.key === key); if (p) select(p); }} />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Access</Label>
                    <Select value={access || "__none__"} onValueChange={(v) => setAccess(v === "__none__" ? "" : v)} disabled={!selected}>
                      <SelectTrigger className="h-9 mt-1 font-mono text-xs" aria-label="Access"><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>{[...new Set([...(access ? [access] : []), ...ACCESS_LEVELS])].map((a) => <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ci-exp" className="text-xs text-muted-foreground">Expires (optional)</Label>
                    <Input id="ci-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!selected} className="h-9 mt-1" />
                  </div>
                  {selected?.type === "staff" ? (
                    <div>
                      <span className="text-xs text-muted-foreground">Keypad code (forgot card)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="h-9 flex-1 rounded-md border bg-muted/40 grid place-items-center font-bold tracking-[0.2em]">{selected.has_access_code ? "Code issued" : "—"}</span>
                        <Button type="button" variant="outline" size="sm" className="h-9" onClick={giveKeypadCode} disabled={codeBusy}>
                          {codeBusy ? "…" : selected.has_access_code ? "New" : "Give"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs text-muted-foreground">Bus</span>
                      <p className="h-9 mt-1 flex items-center gap-1.5 font-medium"><Bus className="w-4 h-4 text-muted-foreground" />{selected?.assigned_vehicle || "—"}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-muted-foreground">Reader</span>
                    <div className="h-9 mt-1 flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs"><Switch checked={prefs.beep} onCheckedChange={(v) => setPref({ beep: v })} aria-label="Beep on success" /> Beep</label>
                      <label className="flex items-center gap-1.5 text-xs"><Switch checked={prefs.led} onCheckedChange={(v) => setPref({ led: v })} aria-label="Flash green light" /> Light</label>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{cardType ? `${cardType} · ` : ""}Only the card's built-in ID is registered — nothing is written to the card, so any MIFARE or NTAG card works.</p>
              </div>
            )}

            {/* LIVE CONSOLE */}
            <div className="rounded-2xl border bg-[#0b0f14] text-slate-200">
              <button type="button" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 text-left">
                <Terminal className="w-3.5 h-3.5 shrink-0" /> Reader log
                {!logOpen && log.length > 0 && <span className="truncate font-mono text-slate-300">· {log[log.length - 1].text}</span>}
                <span className="ml-auto shrink-0">{logOpen ? "Hide" : "Show"}</span>
              </button>
              <div ref={consoleRef} className={`${logOpen ? "h-44 border-t border-white/10" : "hidden"} overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5`} aria-live="polite">
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

      <AddStaffDialog
        open={addOpen} onOpenChange={setAddOpen} companies={companies} vehicles={vehicles} defaultCompany={companyFilter}
        onAdded={async (key) => {
          const list = await load();
          const p = list?.find((x) => x.key === key);
          if (p) { setMode("issue"); setRoleFilter("all"); setStatusFilter("all"); setQ(""); select(p); }
        }}
      />
    </div>
  );
}