import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { loadCardDirectory } from "@/lib/cardDirectory";
import { adminLoadProblem } from "@/lib/adminLoader";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import BusLoader from "@/components/BusLoader";
import { EmptyState, PageActions, Segmented, StatusChip } from "@/components/admin/kit";
import useAdminFocus from "@/hooks/useAdminFocus";
import { cn } from "@/lib/utils";
import PassengerPickupDialog from "@/components/directory/PassengerPickupDialog";
import ContactFormDialog from "@/components/directory/ContactFormDialog";
import BulkCardIssue from "@/components/admin/BulkCardIssue";
import CardDesignerTab from "@/components/admin/CardDesignerTab";
import CheckInLog from "@/components/admin/CheckInLog";
import {
  AddStaffDialog, CardCheck, IssuedCards, ReaderBadge, ReaderHelp, SendAllToTablets, initials, useClaimReader, useSharedCardReader,
} from "@/components/admin/cardIssuing";
import PersonPanel, { TYPE_LABEL, place } from "@/components/admin/passengers/PersonPanel";
import { ChevronRight, ClipboardList, IdCard, ImageIcon, LogIn, LogOut, Nfc, Plus, RefreshCw, Search, ShieldCheck, UserPlus, Users, Usb } from "lucide-react";

const KIND_LABEL = { all: "All", staff: "Company passengers", passenger: "Other passengers" };
// Card status filter: the tiles pick "Card issued" or "No card yet"; the
// menu also narrows to one card status.
const CARD_FILTER_LABEL = { all: "Any card status", "Card Issued": "Card issued", without: "No card yet", Unassigned: "Never had a card", Expired: "Card expired", Revoked: "Card revoked" };
const cardMatch = (filter) => (filter === "all" ? () => true : filter === "without" ? (p) => p.status !== "Card Issued" : (p) => p.status === filter);
function CardStatusSelect({ value, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-10 w-full sm:w-48", className)} aria-label="Card status"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(CARD_FILTER_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
const TOOL_VIEWS = [["bulk", "Bulk setup"], ["issued", "Issued cards"], ["check", "Check a card"], ["staff", "Drivers & staff"]];
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");

// A working card reads green, no card grey, and only a card that needs
// attention (expired, revoked, lost) amber.
const cardChipTone = (status) => (status === "Card Issued" || status === "Active" ? "success" : !status || status === "Unassigned" ? "neutral" : "warning");

// A number at the top that also filters the list (or opens the sign-in log).
function Tile({ label, value, tone, on, onClick }) {
  const fg = { warning: "text-warning" }[tone];
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("min-w-0 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground/20 bg-accent" : "border-border")}>
      <span className="block truncate text-caption font-semibold text-muted-foreground">{label}</span>
      <span className={cn("mt-1 block font-display text-[1.75rem] font-semibold leading-none tabular-nums", fg)}>{value}</span>
    </button>
  );
}

// Who got on and off today, newest first. A name opens that passenger.
function TodaySignIns({ rows, loading, onOpenPerson, onOpenLog, onRefresh }) {
  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="today-signins">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="today-signins" className="flex-1 text-body font-semibold">Today's sign-ins</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} aria-label="Refresh sign-ins"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading ? <p role="status" className="px-4 py-6 text-center text-body-sm text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="px-4 py-6 text-center text-body-sm text-muted-foreground">Nobody has signed in yet today.</p>
          : (
            <ul className="max-h-[320px] divide-y divide-border overflow-y-auto">
              {rows.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpenPerson(r.person_key)} disabled={!r.person_key} className="flex w-full items-center gap-2 px-4 py-2 text-left text-body-sm hover:bg-accent/60 disabled:hover:bg-transparent">
                    {r.status === "boarded" ? <LogIn className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{r.staff_name || "Unknown passenger"}</span> <span className="text-muted-foreground">{r.status === "boarded" ? "got on" : "got off"} {r.vehicle_name || ""}</span></span>
                    <span className="shrink-0 text-caption text-muted-foreground">{timeOf(r.boarded_at || r.created_date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      <div className="border-t px-4 py-2.5"><Button variant="outline" size="sm" className="w-full" onClick={onOpenLog}>Full sign-in log</Button></div>
    </section>
  );
}

function CardTools({ reader, activeCards, onOpen, onDesign }) {
  const { toast } = useToast();
  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="card-tools">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <IdCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="card-tools" className="flex-1 text-body font-semibold">Card tools</h2>
      </div>
      <div className="space-y-3 px-4 py-3">
        <ReaderBadge helper={reader.helper} reader={reader.reader} webNfc={reader.webNfc} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpen("bulk")}><Nfc className="h-4 w-4" /> Bulk setup</Button>
          <Button variant="outline" size="sm" onClick={() => onOpen("issued")}><IdCard className="h-4 w-4" /> Cards ({activeCards})</Button>
          <Button variant="outline" size="sm" onClick={() => onOpen("check")}><ShieldCheck className="h-4 w-4" /> Check a card</Button>
          <Button variant="outline" size="sm" onClick={onDesign}><ImageIcon className="h-4 w-4" /> Card design</Button>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => onOpen("staff")}><Users className="h-4 w-4" /> Cards for drivers & staff</Button>
        {window.transittrackDesktop?.openSetup && <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => window.transittrackDesktop.openSetup("nfc").catch(() => toast({ title: "Couldn't open NFC setup", description: "Update McSween Transport Desktop and try again.", variant: "destructive" }))}><Usb className="h-4 w-4" /> NFC setup</Button>}
      </div>
    </section>
  );
}

// Drivers, mechanics and other card holders (depot access cards).
function StaffCards({ people, onOpenPerson }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const list = people.filter((p) => p.type !== "staff" && cardMatch(status)(p) && (!q || `${p.name} ${p.role} ${p.company_name} ${p.assigned_vehicle}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
      <label className="relative block min-w-[200px] flex-1">
        <span className="sr-only">Search drivers and staff</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role or bus" className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <CardStatusSelect value={status} onChange={setStatus} />
      </div>
      {list.length === 0 ? <p className="py-6 text-center text-body-sm text-muted-foreground">Nobody here yet.</p> : (
        <ul className="divide-y divide-border rounded-2xl border">
          {list.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => onOpenPerson(p.key)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-caption font-bold" aria-hidden="true">{initials(p.name)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-caption text-muted-foreground">{[TYPE_LABEL[p.type] || p.role, p.company_name, p.assigned_vehicle].filter(Boolean).join(" · ")}</span></span>
                <StatusChip tone={cardChipTone(p.status)} dot={false}>{p.status === "Unassigned" ? "No card" : p.status}</StatusChip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Bulk setup gets every tap while it's open.
function BulkTool({ reader, ...props }) {
  const tapRef = useRef(null);
  useClaimReader(reader, true, (tap) => tapRef.current?.(tap));
  return <BulkCardIssue {...props} tapRef={tapRef} feedback={reader.feedback} addLog={reader.addLog} readerReady={reader.ready} />;
}

// Admin → Passengers: one list of passengers; everything about one of them
// (company, bus, pickup, card, printed card, sign-ins) opens beside it.
// Card tools, card design and the full sign-in log open from the same page.
// The old addresses (/admin/cards, /admin/card-designs, /admin/checkins)
// open this page with that part already open.
export default function PassengersPage({ mode = "directory", refreshTick = 0 }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const reader = useSharedCardReader();
  const [people, setPeople] = useState([]);
  const [cards, setCards] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tablets, setTablets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [personFocus, setPersonFocus] = useAdminFocus("person");
  const [panelOpen, setPanelOpen] = useState(() => !!personFocus && mode !== "checkins" && mode !== "card-designs");
  const [busyKey, setBusyKey] = useState("");
  const [pickupPerson, setPickupPerson] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const bulkFromRoute = Array.isArray(location.state?.bulkPersonKeys) ? location.state.bulkPersonKeys.filter((k) => typeof k === "string") : [];
  const [bulkKeys, setBulkKeys] = useState(bulkFromRoute);
  const [sheet, setSheet] = useState(() => (mode === "card-designs" ? "design" : mode === "checkins" ? "log" : mode === "cards" && (!personFocus || bulkFromRoute.length) ? "tools" : null));
  const [fromPerson, setFromPerson] = useState(() => !!personFocus);
  const [toolView, setToolView] = useState(bulkFromRoute.length ? "bulk" : "issued");
  const [signIns, setSignIns] = useState([]);
  const [signInsLoading, setSignInsLoading] = useState(true);
  const canEdit = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [data, companyRows] = await Promise.all([
        loadCardDirectory(base44, "people"),
        canEdit ? base44.entities.Company.list("name", 1000).catch(() => []) : Promise.resolve([]),
      ]);
      setPeople((data?.people || []).map((p) => ({ ...p, kind: p.type === "staff" ? p.directory_type || (p.company_id ? "staff" : "passenger") : p.type })));
      setCards(data?.cards || []);
      setVehicles(data?.vehicles || []);
      setTablets(data?.tablets || []);
      setCompanies(companyRows || []);
      setLoadError(null);
    } catch (error) { setLoadError(adminLoadProblem([error])); } finally { setLoading(false); }
  }, [canEdit]);
  const loadSignIns = useCallback(async () => {
    setSignInsLoading(true);
    try {
      const rows = await base44.entities.StaffCheckIn.list("-created_date", 200);
      const today = localDay(Date.now());
      setSignIns((rows || []).filter((r) => localDay(r.boarded_at || r.created_date) === today));
    } catch { setSignIns([]); } finally { setSignInsLoading(false); }
  }, []);
  // The page's Refresh (and pull to refresh on a phone) reloads these too.
  useEffect(() => { load(); loadSignIns(); }, [load, loadSignIns, refreshTick]);
  // Reaching /admin/card-designs, /admin/checkins or /admin/cards while the
  // page is open (the admin search, a link) opens that part.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    const next = mode === "card-designs" ? "design" : mode === "checkins" ? "log" : mode === "cards" ? "tools" : null;
    if (next) { setPanelOpen(false); setFromPerson(false); setSheet(next); }
  }, [mode]);

  // A part opened from someone's panel (See all, Design and print) goes back
  // to their panel when it closes; one opened from the page goes back to the
  // list. Either way the page ends up on /admin/directory.
  const closeSheet = () => {
    setSheet(null);
    const back = fromPerson && personFocus ? personFocus : "";
    if (back) setPanelOpen(true);
    if (mode !== "directory") navigate("/admin/directory" + (back ? "?person=" + encodeURIComponent(back) : ""), { replace: true });
  };
  const closePanel = () => {
    setPanelOpen(false);
    if (mode !== "directory") navigate("/admin/directory", { replace: true });
    else setPersonFocus("");
  };
  const openSheet = (name, view, forPerson = false) => {
    setPanelOpen(false);
    setFromPerson(forPerson);
    if (!forPerson && personFocus) setPersonFocus("");
    if (view) setToolView(view);
    setSheet(name);
  };

  const passengers = useMemo(() => people.filter((p) => p.type === "staff"), [people]);
  const companyChoices = useMemo(() => {
    const map = new Map();
    for (const c of passengers) if (c.company_id) map.set(c.company_id, c.company_name || "Unnamed company");
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [passengers]);
  const q = query.trim().toLowerCase();
  const filtered = passengers
    .filter((c) => kind === "all" || c.kind === kind)
    .filter((c) => companyFilter === "all" || c.company_id === companyFilter)
    .filter(cardMatch(cardFilter))
    .filter((c) => !q || [c.name, c.phone, c.email, c.pickup_name, c.dropoff_name, c.company_name, c.assigned_vehicle].some((x) => String(x || "").toLowerCase().includes(q)));
  const withCard = passengers.filter(cardMatch("Card Issued")).length;
  const signedInToday = new Set(signIns.filter((r) => r.status === "boarded").map((r) => r.person_key || r.staff_name)).size;
  const focused = personFocus ? people.find((p) => p.key === personFocus) || null : null;
  const openPerson = (key) => { if (!key) return; setPersonFocus(key); setSheet(null); setPanelOpen(true); };
  const selectedPassengers = passengers.filter((c) => selectedKeys.has(c.key) && c.company_id);
  const toggleSelected = (key, checked) => setSelectedKeys((prev) => { const next = new Set(prev); if (checked) next.add(key); else next.delete(key); return next; });

  const reloadPerson = async () => { await load(); };
  const assignCompany = async (c, companyId) => {
    if (companyId === c.company_id) return;
    const company = companies.find((row) => row.id === companyId);
    if (!company || !(await confirmAction({ title: `Assign ${c.name} to ${company.name}?`, description: "Their previous company access, bus assignment, card and keypad codes will be removed. Issue a new card after assigning their company.", confirmLabel: "Assign company" }))) return;
    setBusyKey(c.key);
    try {
      const { data } = await base44.functions.invoke("nfcCards", { action: "set_company", person_key: c.key, company_id: companyId });
      if (!data?.ok) throw new Error(data?.error || "Company assignment failed");
      setSelectedKeys(new Set());
      toast({ title: `${c.name} assigned to ${company.name}` });
      await load();
    } catch (e) { toast({ title: "Couldn't assign company", description: e?.response?.data?.error || e.message, variant: "destructive" }); }
    finally { setBusyKey(""); }
  };
  const save = async (data) => {
    const payload = { ...data, company_id: data.company_id || user?.company_id, company_name: data.company_name || user?.company_name };
    if (editing) await base44.entities.Contact.update(editing.id, payload);
    else await base44.entities.Contact.create(payload);
    setFormOpen(false);
    load();
  };
  // Remove passenger: out completely (server: nfcCards remove_person).
  const remove = async (c) => {
    const login = c.registered || c.source === "user";
    if (!(await confirmAction({
      title: `Remove ${c.name} completely?`,
      description: `They come off the passenger list, their company and their bus, and every card and keypad code of theirs stops.${login ? " Their app login is deleted too, so they would have to sign up again." : ""} Past trips and sign-ins stay in the records. This can't be undone.`,
      confirmLabel: "Remove passenger",
    }))) return;
    setBusyKey(c.key);
    try {
      const { data } = await base44.functions.invoke("nfcCards", { action: "remove_person", person_key: c.key });
      if (!data?.ok) throw new Error(data?.error || "Couldn't remove them");
      toast({ title: `${c.name} removed`, description: [data.cards_stopped ? `${data.cards_stopped} card${data.cards_stopped === 1 ? "" : "s"} stopped` : "", data.login_deleted ? "app login deleted" : ""].filter(Boolean).join(" · ") || undefined });
      setSelectedKeys((prev) => { const next = new Set(prev); next.delete(c.key); return next; });
      closePanel();
      await load();
    } catch (e) {
      toast({ title: "Couldn't remove them", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };
  const bulkIssue = async () => {
    if (!selectedPassengers.length) return;
    const replacements = selectedPassengers.filter((c) => c.status === "Card Issued").length;
    if (!(await confirmAction({ title: `Bulk issue cards for ${selectedPassengers.length} passengers?`,
      description: `Each name will appear one at a time. Tap one card, then move to the next person.${replacements ? ` ${replacements} existing cards will be replaced and deactivated.` : ""}`,
      confirmLabel: "Start bulk issuing" }))) return;
    setBulkKeys(selectedPassengers.map((c) => c.key));
    openSheet("tools", "bulk");
  };
  const companyName = (p) => p.company_name || companies.find((c) => c.id === p.company_id)?.name || "";

  return (
    <>
      <PageActions>
        {canEdit && <Button variant="outline" size="sm" onClick={() => openSheet("tools", "bulk")}><IdCard className="h-4 w-4" /> Card tools</Button>}
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add passenger</Button>
      </PageActions>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Passengers" value={passengers.length} on={cardFilter === "all"} onClick={() => setCardFilter("all")} />
        <Tile label="With a card" value={withCard} tone="success" on={cardFilter === "Card Issued"} onClick={() => setCardFilter(cardFilter === "Card Issued" ? "all" : "Card Issued")} />
        <Tile label="No card yet" value={passengers.length - withCard} tone="warning" on={cardFilter === "without"} onClick={() => setCardFilter(cardFilter === "without" ? "all" : "without")} />
        <Tile label="Signed in today" value={signInsLoading ? "…" : signedInToday} tone="info" onClick={() => openSheet("log")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search passengers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, stop or bus"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        {companyChoices.length > 1 && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Company"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companyChoices.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <CardStatusSelect value={cardFilter} onChange={setCardFilter} />
        <Segmented label="Passenger type" value={kind} onChange={setKind} options={["all", "staff", "passenger"].map((t) => ({
          value: t, label: KIND_LABEL[t], count: t === "all" ? passengers.length : passengers.filter((c) => c.kind === t).length,
        }))} />
      </div>

      {loadError && <div role="alert" className="mb-4 rounded-xl border border-destructive/40 bg-card p-4"><p className="font-semibold">{loadError.title}</p><p className="text-sm text-muted-foreground">{loadError.description}</p><Button className="mt-3" disabled={loading} onClick={() => { setLoading(true); load(); }}>Try again</Button></div>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {canEdit && !loading && passengers.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Select visible passengers"
                checked={filtered.some((c) => c.company_id) && filtered.filter((c) => c.company_id).every((c) => selectedKeys.has(c.key))}
                onCheckedChange={(checked) => setSelectedKeys((prev) => { const next = new Set(prev); for (const c of filtered) if (c.company_id) { if (checked) next.add(c.key); else next.delete(c.key); } return next; })} />Select visible passengers</label>
              <span className="text-sm text-muted-foreground">{selectedPassengers.length} selected</span>
              <Button size="sm" onClick={bulkIssue} disabled={!selectedPassengers.length}><Nfc className="h-4 w-4" /> Bulk issue cards</Button>
              {selectedKeys.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedKeys(new Set())}>Clear selection</Button>}
            </div>
          )}
          {loading ? <BusLoader className="py-8" />
            : loadError && passengers.length === 0 ? null
              : passengers.length === 0 ? (
                <EmptyState icon={Users} title="No passengers yet" action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add passenger</Button>}>
                  Add the people who ride your buses so drivers and kiosks know them.
                </EmptyState>
              ) : filtered.length === 0 ? (
                <EmptyState icon={Search} title="No passengers match">Try another search or filter.</EmptyState>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Passengers">
                  {filtered.map((c) => {
                    const pickup = place(c.pickup_name, c.pickup_lat, c.pickup_lng);
                    const on = focused?.key === c.key;
                    return (
                      <li key={c.key} id={"person-" + c.key} aria-current={on ? "true" : undefined} className={cn("flex items-center gap-3 px-3 py-2.5", on && "bg-secondary/60")}>
                        {canEdit && <Checkbox aria-label={`Select ${c.name}`} checked={selectedKeys.has(c.key)} disabled={!c.company_id} onCheckedChange={(checked) => toggleSelected(c.key, checked)} />}
                        <button type="button" onClick={() => openPerson(c.key)} aria-label={`Open ${c.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials(c.name)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{c.name}</span>
                            <span className="block truncate text-body-sm text-muted-foreground">{[companyName(c) || "No company", c.assigned_vehicle || "No bus", pickup ? "Pickup: " + pickup : "No pickup"].join(" · ")}</span>
                          </span>
                          <span className="hidden shrink-0 sm:inline-flex">
                            <StatusChip tone={cardChipTone(c.status)} dot={false}><Nfc className="h-3.5 w-3.5" aria-hidden="true" /> {c.status === "Card Issued" ? "Card issued" : c.status && c.status !== "Unassigned" ? c.status + " card" : "No card"}</StatusChip>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
        </div>
        <aside className="space-y-4" aria-label="Today and card tools">
          <TodaySignIns rows={signIns} loading={signInsLoading} onOpenPerson={openPerson} onOpenLog={() => openSheet("log")} onRefresh={loadSignIns} />
          {canEdit && <CardTools reader={reader} activeCards={cards.filter((c) => c.is_active).length} onOpen={(v) => openSheet("tools", v)} onDesign={() => openSheet("design")} />}
        </aside>
      </div>

      <PersonPanel
        person={focused} open={panelOpen && !!focused} onOpenChange={(o) => (o ? setPanelOpen(true) : closePanel())}
        reader={reader} vehicles={vehicles} tablets={tablets} cards={cards} companies={companies} canEdit={canEdit} busy={busyKey === focused?.key}
        onChanged={reloadPerson} onAssignCompany={assignCompany} onEditPickup={(p) => setPickupPerson(p)}
        onEdit={(p) => { setEditing(p); setFormOpen(true); }} onRemove={remove}
        onDesign={(p) => { setPersonFocus(p.key); openSheet("design", null, true); }} onOpenLog={(p) => { setPersonFocus(p.key); openSheet("log", null, true); }}
      />

      <Sheet open={sheet === "tools"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Card tools</SheetTitle>
            <SheetDescription>To program one passenger's card, open them from the list.</SheetDescription>
          </SheetHeader>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-xl bg-secondary p-1" role="tablist" aria-label="Card tools">
              {TOOL_VIEWS.map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={toolView === v} onClick={() => setToolView(v)}
                  className={cn("h-9 rounded-lg px-3 text-body-sm font-semibold", toolView === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <SendAllToTablets tablets={tablets} vehicles={vehicles} onSent={load} />
              <Button variant="ghost" size="icon" onClick={load} aria-label="Reload"><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
          {toolView === "bulk" && <div className="space-y-3"><ReaderHelp reader={reader} /><BulkTool reader={reader} people={people} vehicles={vehicles} companies={companies} companyName={companyName} initialKeys={bulkKeys} loading={loading} onIssued={load} /></div>}
          {toolView === "issued" && <IssuedCards cards={cards} people={people} companies={companies} onRevoked={load} />}
          {toolView === "check" && <CardCheck reader={reader} />}
          {toolView === "staff" && (
            <div className="space-y-3">
              <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setQuickAddOpen(true)}><UserPlus className="h-4 w-4" /> Add passenger with a bus</Button></div>
              <StaffCards people={people} onOpenPerson={openPerson} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "design"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader className="pb-2 text-left"><SheetTitle>Card design</SheetTitle></SheetHeader>
          {sheet === "design" && <CardDesignerTab />}
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "log"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="pb-2 text-left"><SheetTitle>Sign-in log</SheetTitle></SheetHeader>
          {sheet === "log" && <CheckInLog vehicles={vehicles} />}
        </SheetContent>
      </Sheet>

      {pickupPerson && <PassengerPickupDialog key={pickupPerson.key} person={pickupPerson} onClose={() => setPickupPerson(null)} onSaved={load} />}
      <ContactFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSave={save} contact={editing} />
      <AddStaffDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} companies={companies} vehicles={vehicles} defaultCompany={companyFilter}
        onAdded={async (key) => { await load(); if (key) openPerson(key); }} />
    </>
  );
}
