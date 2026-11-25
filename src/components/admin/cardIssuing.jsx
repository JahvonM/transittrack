import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CARD_STATUS_TEXT, cardStatus } from "../../../base44/shared/cardStatus.ts";
import {
  AlertTriangle, CheckCircle2, CreditCard, Download, ExternalLink, Keyboard, Loader2, Nfc,
  Search, Send, ShieldCheck, Tablet, Terminal, Usb, UserRound, XCircle, ChevronDown, RotateCcw,
} from "lucide-react";
import { useCardReader, formatUid, normalizeUid, HELPER_DOWNLOAD, HELPER_URL } from "@/lib/cardReader";

// Card issuing, in parts, for Admin → Passengers: one shared card reader,
// the card programmer in each person's panel, Check a card, Bulk setup, the
// issued cards list, a passenger's bus and its boarding tablet.
export const ROLE_FILTERS = [
  { id: "all", label: "All" },
  { id: "driver", label: "Drivers" },
  { id: "mechanic", label: "Mechanics" },
  { id: "staff", label: "Passengers" },
  { id: "other", label: "Other" },
];
export const STATUS_STYLE = {
  "Unassigned": "bg-muted text-muted-foreground border-border",
  "Card Issued": "bg-success/15 text-success border-success/40",
  "Expired": "bg-warning/15 text-warning border-warning/40",
  "Revoked": "bg-danger/15 text-danger border-danger/40",
};
export const ACCESS_LEVELS = ["DEPOT_DRIVER_ZONE", "DEPOT_WORKSHOP", "DEPOT_DISPATCH", "DEPOT_ALL_ACCESS", "STAFF_BUS_BOARDING", "DEPOT_GENERAL"];
export const PREF_KEY = "tt-card-issuing-prefs";
// Browsers won't let a page shown inside another page (e.g. the Base44
// editor preview) reach programs on this PC, and Safari never allows it.
export const IN_FRAME = (() => { try { return window.self !== window.top; } catch { return true; } })();
export const IS_SAFARI = typeof navigator !== "undefined" && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

export const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "—");
export const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : fmtDate(iso);
};

export const NO_BUS = "__none__";

// The bus a staff member rides, and sending their card to that bus's
// boarding tablet (it re-downloads the card list on its next check-in,
// within about 30 seconds).
// Asks every paired boarding tablet to download its bus's card list now
// (each bus's tablet only ever gets its own bus's riders, as names and card
// fingerprints, never raw card numbers). Uses the same per-bus send as the
// "Send to bus tablet" button, once for each bus that has a tablet.
export function SendAllToTablets({ tablets, vehicles, onSent }) {
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

// Whether the bus tablet really has the latest card list: what it reported
// downloading, against when a list was last sent to it.
function listState(onBus, sentAt) {
  const got = onBus.map((t) => t.list_downloaded_at).filter(Boolean).sort().pop();
  const count = onBus.find((t) => t.list_downloaded_at === got)?.list_count;
  if (!got) return sentAt ? `list sent ${ago(sentAt)}, not downloaded yet` : "card list not downloaded yet";
  const behind = sentAt && Date.parse(sentAt) > Date.parse(got) + 60_000;
  return `list downloaded ${ago(got)}${count != null ? ` (${count} card${count === 1 ? "" : "s"})` : ""}${behind ? ` · newer list sent ${ago(sentAt)}, waiting for the tablet` : ""}`;
}

export function BusLink({ person, vehicles, tablets, onChanged }) {
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
            ? `${onBus.map((t) => t.label || "Boarding tablet").join(", ")} · seen ${ago(onBus[0].last_seen)} · ${listState(onBus, sentAt)}`
            : "No boarding tablet on this bus is set up and paired, so cards can't reach it. Pair one in Kiosk tablets."}
        </p>
      )}
    </div>
  );
}

export function readPrefs() {
  try { return { beep: true, led: true, batch: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { beep: true, led: true, batch: false }; }
}

// ---------------------------------------------------------------------------
// Reader connection badge
export function ReaderBadge({ helper, reader, webNfc }) {
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
  success: { cls: "border-success/70 bg-success/15 text-success", icon: CheckCircle2, title: "Card issued", sub: "" },
  error: { cls: "border-danger/70 bg-danger/15 text-danger", icon: XCircle, title: "Card not issued", sub: "" },
  check: { cls: "border-primary/60 bg-primary/10", icon: ShieldCheck, title: "Check a card", sub: "Place any card on the reader to see who it belongs to." },
};

export function TapTarget({ phase, message, uid }) {
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
export function AddStaffDialog({ open, onOpenChange, companies, vehicles, defaultCompany, onAdded }) {
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
export const CARD_TONE = { active: "success", suspended: "warning", lost: "danger", revoked: "danger", replaced: "neutral" };
// What each way of stopping a card means, said honestly: a tablet without a
// connection keeps its saved card list until it reconnects (24 h at most).
export const STOP = {
  suspended: { label: "Suspend", title: "Suspend", done: "Card suspended", effect: "You can switch it back on later." },
  lost: { label: "Report lost", title: "Report lost:", done: "Card marked lost", effect: "A lost card can't be switched back on. Issue a new card when they need one." },
  revoked: { label: "Revoke", title: "Revoke", done: "Card revoked", effect: "A revoked card can't be switched back on." },
};
export const OFFLINE_NOTE = "Boarding tablets that are online stop accepting it within about 30 seconds. A tablet with no connection can still accept it until it reconnects (24 hours at most); those taps are marked for review.";

export function IssuedCards({ cards, people, companies = [], onRevoked }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");
  const [company, setCompany] = useState("all");
  const stops = useCardStops(onRevoked);
  const list = cards
    .filter((c) => (show === "all" ? true : show === "active" ? c.is_active : !c.is_active))
    .filter((c) => company === "all" || c.company_id === company)
    .filter((c) => !q || `${c.holder_name} ${c.card_uid} ${c.company_name} ${c.assigned_vehicle} ${c.access_level}`.toLowerCase().includes(q.toLowerCase()));
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
          <SelectTrigger className="w-48" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active cards</SelectItem>
            <SelectItem value="inactive">Suspended, lost, revoked or replaced</SelectItem>
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
                <td className="px-3 py-2"><CardStateChip card={c} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><CardStopButtons card={c} {...stops} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground border-t">{people.filter((p) => p.status === "Card Issued").length} of {people.length} people have an active card.</p>
    </div>
  );
}

// A card's state, and the date it stopped if it has.
export function CardStateChip({ card }) {
  const state = cardStatus(card);
  return <>
    <StatusChip tone={CARD_TONE[state]}>{CARD_STATUS_TEXT[state]}</StatusChip>
    {state !== "active" && <div className="mt-1 text-xs text-muted-foreground">{card.revoke_reason && card.revoke_reason !== CARD_STATUS_TEXT[state] ? card.revoke_reason + " · " : ""}{fmtDate(card.revoked_at)}</div>}
  </>;
}

// Suspending, reporting lost, revoking or switching back on one card, for
// the issued cards list and a passenger's own panel.
export function useCardStops(onChanged) {
  const { toast } = useToast();
  const [working, setWorking] = useState("");
  const stop = async (card, status) => {
    const how = STOP[status];
    if (!(await confirmAction({ title: `${how.title} ${card.holder_name}'s card?`, description: `Card ${formatUid(card.card_uid)}. ${how.effect} ${OFFLINE_NOTE}`, confirmLabel: how.label }))) return;
    setWorking(card.id);
    try {
      await base44.functions.invoke("nfcCards", { action: "revoke", card_id: card.id, status });
      toast({ title: how.done });
      await onChanged?.();
    } catch (e) {
      toast({ title: "Couldn't change the card", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setWorking(""); }
  };
  const restore = async (card) => {
    if (!(await confirmAction({ title: `Switch ${card.holder_name}'s card back on?`, description: `Card ${formatUid(card.card_uid)} works again on the boarding tablets once they refresh their card list.`, confirmLabel: "Switch back on" }))) return;
    setWorking(card.id);
    try {
      await base44.functions.invoke("nfcCards", { action: "reactivate", card_id: card.id });
      toast({ title: "Card switched back on" });
      await onChanged?.();
    } catch (e) {
      toast({ title: "Couldn't switch the card back on", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setWorking(""); }
  };
  return { working, stop, restore };
}

export function CardStopButtons({ card, working, stop, restore }) {
  const state = cardStatus(card);
  return <>
    {state === "suspended" && <Button size="sm" variant="outline" className="mr-2" disabled={working === card.id} onClick={() => restore(card)}><RotateCcw className="h-3.5 w-3.5" />Switch back on</Button>}
    {["active", "suspended"].includes(state) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="text-destructive" disabled={working === card.id} aria-label={`Stop ${card.holder_name}'s card`}>
            {working === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Stop card<ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {state === "active" && <DropdownMenuItem onSelect={() => stop(card, "suspended")}>Suspend (can switch back on)</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => stop(card, "lost")}>Report lost</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => stop(card, "revoked")} className="text-destructive">Revoke</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </>;
}

// ---------------------------------------------------------------------------
// The reader settings (beep, light), kept on this computer.
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = useCallback((p) => setPrefs((prev) => {
    const next = { ...prev, ...p };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);
  return [prefs, setPref];
}

// One card reader for the whole Passengers page. Whatever is waiting for a
// card (a passenger's card, Check a card, Bulk setup) claims it, and the next
// tap goes there; nothing else gets it.
export function useSharedCardReader() {
  const handler = useRef(null);
  const [claimed, setClaimed] = useState(false);
  const reader = useCardReader((tap) => handler.current?.(tap), { active: claimed });
  const claim = useCallback((fn) => {
    handler.current = fn;
    setClaimed(true);
    return () => { if (handler.current === fn) { handler.current = null; setClaimed(false); } };
  }, []);
  return { ...reader, claim, ready: reader.helper === "connected" || !!reader.webNfc };
}

// While `on`, the reader's taps go to onTap.
export function useClaimReader(reader, on, onTap) {
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const { claim } = reader;
  useEffect(() => (on ? claim((tap) => tapRef.current?.(tap)) : undefined), [on, claim]);
}

// How to get the reader working, when it isn't. `compact` shows one line with
// the main button; the full steps open from "How to set up".
export function ReaderHelp({ reader, compact = false }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const { helper, webNfc, access: localAccess, connect } = reader;
  if (!((helper === "idle" || helper === "offline") && !webNfc)) return null;
  if (compact && !expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <Usb className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-[9rem] flex-1">{helper === "offline" ? "Can't reach the card reader" : "Card reader not connected"}</span>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(true)} aria-expanded={false}>How to set up</Button>
        {IN_FRAME
          ? <Button size="sm" onClick={() => window.open(window.location.href, "_blank", "noopener")}><ExternalLink className="h-4 w-4" /> Open in new tab</Button>
          : <Button size="sm" onClick={connect}><Usb className="h-4 w-4" /> {helper === "offline" ? "Try again" : "Connect reader"}</Button>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 flex flex-wrap items-center gap-4">
      <Usb className="w-5 h-5 text-warning shrink-0" />
      <div className="flex-1 min-w-[260px] text-sm space-y-1">
        {IN_FRAME ? (
          <>
            <p className="font-semibold">Open this page in its own tab</p>
            <p className="text-muted-foreground">The card reader can't connect while McSween Transport is shown inside another page (like the Base44 editor preview). Open it in its own Chrome or Edge tab.</p>
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
              <li>The black <b>McSween Card Reader</b> window is open and says <b>Listening on http://127.0.0.1:8765</b>. Not open? Download the helper again and double-click it.</li>
              <li><a href={`${HELPER_URL}/`} target="_blank" rel="noreferrer" className="underline font-medium text-foreground">Test the helper</a> — a page showing “McSween Card Reader” means it's running. “Can't be reached” means it isn't.</li>
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
            {window.transittrackDesktop?.openSetup ? <Button variant="outline" onClick={() => window.transittrackDesktop.openSetup("nfc").catch(() => toast({ title: "Couldn't open NFC setup", variant: "destructive" }))}><Usb className="w-4 h-4" />Open NFC setup</Button> : <Button variant="outline" asChild><a href={HELPER_DOWNLOAD} download><Download className="w-4 h-4" /> Download helper</a></Button>}
            <Button onClick={connect}><Usb className="w-4 h-4" /> {helper === "offline" ? "Try again" : "Connect reader"}</Button>
          </>
        )}
      </div>
    </div>
  );
}

// What the reader has been doing, folded away until asked for.
export function ReaderLog({ log }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log, open]);
  return (
    <div className="rounded-2xl border bg-[#0b0f14] text-slate-200">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 text-left">
        <Terminal className="w-3.5 h-3.5 shrink-0" /> Reader log
        {!open && log.length > 0 && <span className="truncate font-mono text-slate-300">· {log[log.length - 1].text}</span>}
        <span className="ml-auto shrink-0">{open ? "Hide" : "Show"}</span>
      </button>
      <div ref={ref} className={`${open ? "h-44 border-t border-white/10" : "hidden"} overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5`} aria-live="polite">
        {log.length === 0 && <p className="text-slate-500">Waiting for the reader…</p>}
        {log.map((l, i) => (
          <p key={i} className={l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-300" : l.level === "ok" ? "text-emerald-300" : l.level === "apdu" ? "text-sky-300" : ""}>
            <span className="text-slate-500">{l.t.toLocaleTimeString([], { hour12: false })} </span>{l.text}
          </p>
        ))}
      </div>
    </div>
  );
}

// Typing a card ID when there's no reader.
function ManualCardId({ armed, label, onSubmit }) {
  const { toast } = useToast();
  const [uid, setUid] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const clean = normalizeUid(uid);
    if (clean.length < 8) { toast({ title: "Card ID should be at least 8 hex characters", variant: "destructive" }); return; }
    setUid("");
    onSubmit(clean);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-xl border p-3">
      <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="e.g. 04:A2:8B:22:6F:1C:80" className="font-mono flex-1 min-w-[200px]" aria-label="Card ID" autoFocus />
      <Button type="submit" disabled={!armed}>{label}</Button>
      {!armed && <p className="w-full text-xs text-muted-foreground">Press Program card first.</p>}
    </form>
  );
}

// One person's card: program a new one or replace theirs, with its access,
// expiry and (for a passenger) a keypad code for days they forget it.
export function CardProgrammer({ person, reader, onIssued }) {
  const { toast } = useToast();
  const [prefs, setPref] = useReaderPrefs();
  const [phase, setPhase] = useState("ready");
  const [message, setMessage] = useState("");
  const [lastUid, setLastUid] = useState("");
  const [cardType, setCardType] = useState("");
  const [access, setAccess] = useState("");
  const [expiry, setExpiry] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const { addLog, feedback } = reader;
  useEffect(() => {
    setPhase("ready"); setMessage(""); setLastUid(""); setCardType(""); setExpiry(""); setManualOpen(false);
    setAccess(person?.card?.access_level || person?.default_access || "STAFF_BUS_BOARDING");
  }, [person?.key]);

  const onTap = async ({ uid, cardType: type }) => {
    if (phase !== "waiting" || !person) return;
    setLastUid(uid);
    if (type) setCardType(type);
    setPhase("encoding");
    setMessage("");
    addLog(`Registering ${formatUid(uid)} for ${person.name}…`);
    try {
      const res = await base44.functions.invoke("nfcCards", {
        action: "issue", person_key: person.key, uid, card_type: type || cardType,
        access_level: access, expiry_date: expiry,
      });
      const data = res.data || {};
      if (!data.ok) throw Object.assign(new Error(data.error || "Card not issued"), { code: data.code });
      setPhase("success");
      setMessage(`${person.name} · ${access}${data.replaced ? " · old card deactivated" : ""}${data.sent_to_bus ? ` · sent to ${person.assigned_vehicle}'s tablet` : ""}`);
      addLog(`CARD_PROGRAMMED · ${formatUid(uid)} → ${person.name}`, "ok");
      feedback("success", { beep: prefs.beep, led: prefs.led });
      await onIssued?.(person.key);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setPhase("error");
      setMessage(msg);
      addLog(`CARD_REJECTED · ${formatUid(uid)} · ${msg}`, "error");
      feedback("error", { beep: true, led: prefs.led });
    }
  };
  useClaimReader(reader, phase === "waiting", onTap);

  const program = () => {
    setMessage("");
    setLastUid("");
    setPhase("waiting");
    addLog(`Waiting for a card for ${person.name}${!reader.ready ? " (no reader — type the card ID)" : ""}`);
    if (!reader.ready) setManualOpen(true);
  };
  const giveKeypadCode = async () => {
    if (codeBusy) return;
    if ((person.has_access_code || person.access_code) && !(await confirmAction({ title: `Give ${person.name} a new keypad code?`, description: "Their current keypad code will stop working.", confirmLabel: "New code" }))) return;
    setCodeBusy(true);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "keypad_code", person_key: person.key });
      addLog(`Keypad code for ${person.name}: ${res.data?.code}`, "ok");
      toast({ title: `Keypad code for ${person.name}: ${res.data?.code}`, description: "They type it on the bus boarding tablet's keypad." });
      await onIssued?.(person.key);
    } catch (e) {
      toast({ title: "Couldn't make a code", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setCodeBusy(false); }
  };

  if (!person) return null;
  const has = person.card || person.legacy_tag;
  // While the reader isn't connected, the line above says so; no badge too.
  const readerDown = (reader.helper === "idle" || reader.helper === "offline") && !reader.webNfc;
  return (
    <div className="space-y-3">
      <ReaderHelp reader={reader} compact />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-muted-foreground">{person.card ? `Card ${formatUid(person.card.card_uid)}` : person.legacy_tag ? `Card ${formatUid(person.legacy_tag)}` : "No card yet"}</p>
        </div>
        {!readerDown && <ReaderBadge helper={reader.helper} reader={reader.reader} webNfc={reader.webNfc} />}
        {phase === "waiting" ? (
          <Button variant="outline" onClick={() => setPhase("ready")}>Cancel</Button>
        ) : (
          <Button disabled={phase === "encoding"} onClick={program}><Nfc className="w-4 h-4" /> {has ? "Replace card" : "Program card"}</Button>
        )}
      </div>
      {(phase !== "ready") && <TapTarget phase={phase} message={message} uid={phase === "success" || phase === "error" ? lastUid : ""} />}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}><Keyboard className="w-4 h-4" /> Type a card ID</Button>
      </div>
      {manualOpen && <ManualCardId armed={phase === "waiting"} label="Use this ID" onSubmit={(uid) => { setManualOpen(false); onTap({ uid, cardType: "", source: "manual" }); }} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div>
          <Label className="text-xs text-muted-foreground">Access</Label>
          <Select value={access || "__none__"} onValueChange={(v) => setAccess(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-9 mt-1 font-mono text-xs" aria-label="Access"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{[...new Set([...(access ? [access] : []), ...ACCESS_LEVELS])].map((a) => <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={"exp-" + person.key} className="text-xs text-muted-foreground">Expires (optional)</Label>
          <Input id={"exp-" + person.key} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-9 mt-1" />
        </div>
        {person.type === "staff" && (
          <div>
            <span className="text-xs text-muted-foreground">Keypad code (forgot card)</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-9 flex-1 rounded-md border bg-muted/40 grid place-items-center font-bold tracking-[0.2em]">{person.has_access_code ? "Code issued" : "—"}</span>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={giveKeypadCode} disabled={codeBusy}>{codeBusy ? "…" : person.has_access_code ? "New" : "Give"}</Button>
            </div>
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
      <ReaderLog log={reader.log} />
    </div>
  );
}

// Who a card belongs to: place any card on the reader.
export function CardCheck({ reader }) {
  const [prefs] = useReaderPrefs();
  const [result, setResult] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const { addLog, feedback } = reader;
  const onTap = async ({ uid, cardType: type }) => {
    addLog(`Checking card ${formatUid(uid)}…`);
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "verify", uid });
      const owner = res.data?.owner;
      setResult({ uid, owner, cardType: type });
      addLog(owner ? `Card belongs to ${owner.name}` : "Card is not issued to anyone", owner ? "ok" : "warn");
      feedback(owner ? "success" : "error", { beep: prefs.beep, led: prefs.led });
    } catch (e) {
      addLog(`Check failed: ${e?.response?.data?.error || e.message}`, "error");
    }
  };
  useClaimReader(reader, true, onTap);
  return (
    <div className="space-y-3">
      <ReaderHelp reader={reader} />
      <div className="flex items-center justify-between gap-2">
        <ReaderBadge helper={reader.helper} reader={reader.reader} webNfc={reader.webNfc} />
        <Button variant="ghost" size="sm" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}><Keyboard className="w-4 h-4" /> Type a card ID</Button>
      </div>
      {manualOpen && <ManualCardId armed label="Check" onSubmit={(uid) => onTap({ uid, cardType: "" })} />}
      <TapTarget phase="check" uid={result?.uid} />
      {result && (
        <div className={`rounded-2xl border p-4 ${result.owner ? "border-success/40" : "border-danger/40"}`}>
          {result.owner ? (
            <p className="text-lg font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-success" /> {result.owner.name}</p>
          ) : (
            <p className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-danger" /> Not issued to anyone</p>
          )}
          {result.owner?.card && (
            <p className="text-sm text-muted-foreground mt-1">{[result.owner.card.company_name, result.owner.card.assigned_vehicle].filter(Boolean).join(" · ") || result.owner.card.role} · {result.owner.card.access_level} · issued {fmtDate(result.owner.card.issue_date)}</p>
          )}
        </div>
      )}
      <ReaderLog log={reader.log} />
    </div>
  );
}
