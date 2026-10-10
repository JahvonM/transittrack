import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bus, CheckCircle2, CircleDashed, MapPinOff, Route as RouteIcon, TriangleAlert, Users, UserX, Search, RefreshCw, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { EmptyState, Kpi, KpiRow, PageIntro, Panel, Segmented, StatusChip } from "@/components/admin/kit";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import BusLoader from "@/components/BusLoader";
import { drawnRoad } from "@/lib/routeRoad";

const LiteMap = lazy(() => import("@/components/LiteMap"));

// Admin → Plan pickups: put every passenger on the bus that drives past their
// pickup. The server sorts them (routeStops 'plan'); nothing changes until an
// admin taps Assign. Assigning uses the same action as Admin → Passengers.

const STATUS = {
  ok: { label: "On the right bus", kpi: "Right bus", color: "#22c55e", tone: "success", icon: CheckCircle2 },
  needs_bus: { label: "Needs a bus", kpi: "Needs a bus", color: "#f59e0b", tone: "warning", icon: CircleDashed },
  wrong_bus: { label: "Wrong bus", kpi: "Wrong bus", color: "#ef4444", tone: "danger", icon: TriangleAlert },
  route_no_bus: { label: "Route has no bus yet", kpi: "Route, no bus", color: "#38bdf8", tone: "info", icon: RouteIcon },
  no_route: { label: "No route reaches them", kpi: "No route", color: "#a78bfa", tone: undefined, icon: MapPinOff },
  no_pickup: { label: "No pickup yet", kpi: "No pickup", color: "#94a3b8", tone: undefined, icon: UserX },
};
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// Someone no route's bus reaches: where a bus passes, and whether they're on it
// already (then their phone asks them to pick a pickup on its road).
function nearbyDetail(p, none) {
  const on = p.bus_name ? `On ${p.bus_name}` : "";
  if (!p.nearby) return [on, none].filter(Boolean).join(" · ");
  if (p.nearby.bus_id === p.bus_id) return `On ${p.bus_name}, which passes ${km(p.nearby.distance_m)} away. Their app asks them to pick a pickup on ${p.nearby.route_name}.`;
  return [on, `${p.nearby.bus_name} passes ${km(p.nearby.distance_m)} away (${p.nearby.route_name})`].filter(Boolean).join(" · ");
}
const canUseNearby = (p) => p.nearby && p.nearby.bus_id !== p.bus_id;

function Seats({ bus }) {
  const cap = bus.capacity || 0;
  const pct = cap ? Math.min(100, Math.round((bus.riders / cap) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{bus.name}</span>
        <span className="shrink-0 text-body-sm tabular-nums">{bus.riders}{cap ? ` / ${cap}` : ""} <span className="text-muted-foreground">assigned</span></span>
      </div>
      <p className="truncate text-caption text-muted-foreground">{bus.route_name || "No route"}</p>
      {cap > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 85 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function BusChoice({ value, onChange, buses, label, disabled }) {
  return <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label} className="rounded-xl"><SelectValue placeholder="Choose a bus…" /></SelectTrigger>
    <SelectContent>{buses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.route_name ? " · " + b.route_name : ""}</SelectItem>)}</SelectContent>
  </Select>;
}

export default function PlanPickupsTab() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [busForRoute, setBusForRoute] = useState({});
  const [view, setView] = useState("attention");
  const [issue, setIssue] = useState("all");
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [choice, setChoice] = useState(null);
  const detailRef = useRef(null);
  const actionLock = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const { data: plan } = await base44.functions.invoke("routeStops", { action: "plan" });
      setData(plan);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Couldn't load the plan");
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("tt-admin-refresh", onRefresh);
    return () => window.removeEventListener("tt-admin-refresh", onRefresh);
  }, [load]);

  const inCompany = useCallback((row) => companyId === "all" || row.company_id === companyId, [companyId]);
  const people = useMemo(() => (data?.people || []).filter(inCompany), [data, inCompany]);
  const buses = useMemo(() => (data?.buses || []).filter(inCompany), [data, inCompany]);
  const routes = useMemo(() => (data?.routes || []).filter(inCompany), [data, inCompany]);
  const by = useMemo(() => {
    const g = Object.fromEntries(Object.keys(STATUS).map((k) => [k, []]));
    for (const p of people) (g[p.status] || (g[p.status] = [])).push(p);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }, [people]);
  const waitingByRoute = useMemo(() => {
    const m = new Map();
    for (const p of by.route_no_bus) {
      if (!m.has(p.route_id)) m.set(p.route_id, { route_id: p.route_id, route_name: p.route_name, company_id: p.company_id, people: [] });
      m.get(p.route_id).people.push(p);
    }
    return [...m.values()];
  }, [by]);
  const companies = useMemo(() => (data?.companies || []).filter((c) => (data?.people || []).some((p) => p.company_id === c.id) || (data?.buses || []).some((b) => b.company_id === c.id)), [data]);

  const setBus = async (person, busId) => {
    const res = await base44.functions.invoke("nfcCards", { action: "set_bus", person_key: person.key, vehicle_id: busId });
    if (res?.data?.error) throw new Error(res.data.error);
  };
  const assign = async (person, bus, verb = "Assigned") => {
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      if (!(await confirmAction({
        title: `Assign ${person.name} to ${bus.name}?`,
        description: `Current bus: ${person.bus_name || "None"}.` + (person.nearby?.bus_id === bus.id && ["no_route", "route_no_bus"].includes(person.status) ? " This bus passes nearby, but their pickup still needs to move onto its route. Their app will ask them to choose a new pickup." : " Their app will show the new bus."),
        confirmLabel: "Assign passenger",
      }))) return;
    setBusy(person.key);
    try {
      await setBus(person, bus.id);
      toast({ title: `${verb} ${person.name} to ${bus.name}` });
      await load();
    } catch (e) {
      toast({ title: `Couldn't assign ${person.name}`, description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(""); }
    } finally { actionLock.current = false; }
  };
  const suggestedAll = [...by.needs_bus, ...by.wrong_bus].filter((p) => p.suggested && selected.has(p.key));
  const assignAll = async () => {
    if (!suggestedAll.length || actionLock.current) return;
    actionLock.current = true;
    try {
    if (!(await confirmAction({
      title: `Assign ${suggestedAll.length} passenger${suggestedAll.length === 1 ? "" : "s"} to their suggested bus?`,
      description: suggestedAll.map((p) => `${p.name} → ${p.suggested.name}`).join("\n") + "\nEach passenger is assigned only to their suggested bus.",
      confirmLabel: "Confirm assignments",
    }))) return;
    setBusy("all");
    let done = 0, failed = 0;
    for (const p of suggestedAll) {
      setProgress(`Assigning ${done + failed + 1} of ${suggestedAll.length}…`);
      try { await setBus(p, p.suggested.id); done++; setSelected((prev) => { const n = new Set(prev); n.delete(p.key); return n; }); } catch { failed++; }
    }
    setProgress("");
    setBusy("");
    toast({ title: `Assigned ${done} passenger${done === 1 ? "" : "s"}`, description: failed ? `${failed} couldn't be assigned. They're still listed.` : undefined, variant: failed ? "destructive" : undefined });
    await load();
    } finally { setBusy(""); setProgress(""); actionLock.current = false; }
  };
  const putBusOnRoute = async (group) => {
    const bus = buses.find((b) => b.id === busForRoute[group.route_id]);
    if (!bus || actionLock.current) return;
    actionLock.current = true;
    try {
    const leaving = bus.route_id ? people.filter((p) => p.bus_id === bus.id && p.route_id === bus.route_id).length : 0;
    if (!(await confirmAction({
      title: `Put ${bus.name} on ${group.route_name}?`,
      description: bus.route_id
        ? `${bus.name} stops running ${bus.route_name || "its current route"}.${leaving ? ` Its ${leaving} passenger${leaving === 1 ? "" : "s"} there will show as on the wrong bus.` : ""} The ${group.people.length} waiting passenger${group.people.length === 1 ? "" : "s"} on ${group.route_name} can then be assigned to it.`
        : `The ${group.people.length} waiting passenger${group.people.length === 1 ? "" : "s"} on ${group.route_name} can then be assigned to it.`,
      confirmLabel: "Put bus on route",
    }))) return;
    setBusy("route:" + group.route_id);
    try {
      await base44.entities.Vehicle.update(bus.id, { route_id: group.route_id });
      toast({ title: `${bus.name} now runs ${group.route_name}` });
      await load();
    } catch (e) {
      toast({ title: "Couldn't change the bus's route", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
    } finally { actionLock.current = false; }
  };

  const attention = people.filter((p) => !["ok", "no_pickup"].includes(p.status));
  const visible = people.filter((p) => {
    if (view === "attention" && ["ok", "no_pickup"].includes(p.status)) return false;
    if (view === "ready" && p.status !== "ok") return false;
    if (view === "no_pickup" && p.status !== "no_pickup") return false;
    if (view === "attention" && issue !== "all" && p.status !== issue) return false;
    return [p.name, p.pickup?.name, p.bus_name, p.route_name, p.suggested?.name].join(" ").toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => a.name.localeCompare(b.name));
  const active = visible.find((p) => p.key === activeKey) || visible[0] || null;
  const eligible = active ? buses.filter((b) => b.company_id === active.company_id && (
    (active.route_id && b.route_id === active.route_id) || b.id === active.nearby?.bus_id || b.id === active.bus_id
  )) : [];
  const preferred = active?.suggested?.id || (canUseNearby(active || {}) ? active.nearby.bus_id : active?.bus_id);
  const chosenId = choice?.key === active?.key && eligible.some((b) => b.id === choice.id) ? choice.id : preferred;
  const chosen = eligible.find((b) => b.id === chosenId) || null;
  const activeRoute = routes.find((r) => r.id === (chosen?.route_id || active?.route_id));
  const shownRoutes = active ? [activeRoute].filter(Boolean) : routes;
  const lines = shownRoutes.map((r) => drawnRoad(r)).filter(Boolean).map((coords) => ({ coords, color: "#22d3ee", width: 4, opacity: 0.8 }));
  const shownPeople = active ? [active] : visible;
  const pins = shownPeople.filter((p) => p.pickup).map((p) => ({ lat: p.pickup.lat, lng: p.pickup.lng, color: STATUS[p.status]?.color || "#94a3b8", label: p.name }));
  const waiting = active && waitingByRoute.find((g) => g.route_id === active.route_id);
  const selectables = visible.filter((p) => p.suggested && ["needs_bus", "wrong_bus"].includes(p.status));
  const selectedCount = suggestedAll.length;
  const toggle = (key, checked) => setSelected((prev) => { const n = new Set(prev); if (checked) n.add(key); else n.delete(key); return n; });
  const changeCompany = (value) => { setCompanyId(value); setActiveKey(""); setSelected(new Set()); setChoice(null); };
  const review = (key) => {
    setActiveKey(key);
    setChoice(null);
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (error) return <EmptyState icon={TriangleAlert} title="Couldn't load the plan" action={<Button onClick={load}>Try again</Button>}>{error}</EmptyState>;
  if (!data) return <div className="grid place-items-center py-16"><BusLoader label="Sorting passengers onto buses…" /></div>;

  return (
    <div className="space-y-4">
      <PageIntro>Review pickups and assign the right bus. Changes apply only after confirmation.</PageIntro>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {companies.length > 1 && <div className="w-full sm:w-60"><Select value={companyId} onValueChange={changeCompany} disabled={!!busy}>
          <SelectTrigger aria-label="Company" className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All companies</SelectItem>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select></div>}
        <Button variant="outline" onClick={load} disabled={!!busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh plan</Button>
      </div>
      <KpiRow className="grid-cols-1 sm:grid-cols-3 xl:grid-cols-3">
        <Kpi label="Ready" value={by.ok.length} tone="success" icon={CheckCircle2} detail="On the right bus" />
        <Kpi label="Needs attention" value={attention.length} tone="warning" icon={TriangleAlert} detail="Review bus or route issues" />
        <Kpi label="No pickup" value={by.no_pickup.length} icon={UserX} detail="Pickup hasn't been set" />
      </KpiRow>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="Passengers" icon={Users} className="overflow-hidden" bodyClassName="space-y-4">
          <div className="flex flex-col gap-2 xl:flex-row">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Search passenger or pickup" placeholder="Search passenger or pickup" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-9" />
            </div>
            {view === "attention" && <div className="xl:w-44"><Select value={issue} onValueChange={setIssue}>
              <SelectTrigger aria-label="Filter pickup issues" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All issues</SelectItem>{Object.entries(STATUS).filter(([k]) => !["ok", "no_pickup"].includes(k)).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
            </Select></div>}
          </div>
          <Segmented label="Passenger status" value={view} onChange={(v) => { setView(v); setActiveKey(""); setChoice(null); }} options={[
            { value: "attention", label: "Needs attention", count: attention.length },
            { value: "ready", label: "Ready", count: by.ok.length },
            { value: "no_pickup", label: "No pickup", count: by.no_pickup.length },
          ]} />
          {selectables.length > 0 && <label className="flex items-center gap-2 text-body-sm"><Checkbox aria-label="Select visible suggestions" disabled={!!busy} checked={selectables.every((p) => selected.has(p.key)) ? true : selectables.some((p) => selected.has(p.key)) ? "indeterminate" : false} onCheckedChange={(checked) => setSelected((prev) => { const n = new Set(prev); for (const p of selectables) { if (checked) n.add(p.key); else n.delete(p.key); } return n; })} />Select visible suggestions</label>}
          {visible.length === 0 ? <EmptyState title="No passengers in this view">{search ? "Try another name or pickup." : view === "attention" ? "No bus or route issues to review." : "Choose another filter to see passengers."}</EmptyState> :
            <ul className="space-y-2 lg:max-h-[580px] lg:overflow-y-auto" aria-label="Pickup passengers">{visible.map((p) => {
              const s = STATUS[p.status] || STATUS.no_pickup;
              const canSelect = !!p.suggested && ["needs_bus", "wrong_bus"].includes(p.status);
              return <li key={p.key} className={cn("flex items-start gap-3 rounded-xl border p-3 transition-colors", active?.key === p.key ? "border-primary bg-primary/8" : "border-border hover:bg-accent/40")}>
                {canSelect && <Checkbox className="mt-2 shrink-0" aria-label={`Select ${p.name}`} checked={selected.has(p.key)} disabled={!!busy} onCheckedChange={(checked) => toggle(p.key, checked)} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-caption font-bold text-primary" aria-hidden="true">{p.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</span><span className="min-w-0 break-words font-semibold">{p.name}</span><StatusChip tone={s.tone || "neutral"}>{s.label}</StatusChip></div>
                  <p className="mt-2 text-body-sm text-muted-foreground"><MapPin className="mr-1 inline h-3.5 w-3.5" />{p.pickup?.name || (p.pickup ? "Saved pickup" : "No pickup set")}{p.route_name ? " · " + p.route_name : ""}</p>
                  <p className="mt-1 text-body-sm">Current: <span className="text-muted-foreground">{p.bus_name || "No bus"}</span>{p.suggested && <> → <span className="font-semibold text-primary">{p.suggested.name}</span></>}</p>
                  <Button className="mt-2 h-9" size="sm" variant="outline" aria-label={`Review ${p.name}`} onClick={() => review(p.key)}>Review pickup</Button>
                </div>
              </li>;
            })}</ul>}
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="mr-auto text-body-sm font-semibold" role="status">{selectedCount} selected{busy === "all" ? " · " + progress : ""}</span>
            <Button disabled={!selectedCount || !!busy} onClick={assignAll}>Review assignments</Button>
            <Button variant="ghost" disabled={!selected.size || !!busy} onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </Panel>

        <div ref={detailRef} className="min-w-0 scroll-mt-20 space-y-4 lg:sticky lg:top-4">
          <Panel title={active ? `${active.name}’s pickup` : "Pickups on the map"} icon={MapPin} bodyClassName="space-y-3">
            {active?.pickup || !active ? <div className="h-[280px] overflow-hidden rounded-xl border border-border sm:h-[320px]">
              <Suspense fallback={<div className="h-full animate-pulse bg-muted" />}>
                <LiteMap key={(active?.key || "overview") + ":" + (chosen?.route_id || "")} fill vehicles={[]} pins={pins} lines={lines} showUserDot={false} showRecenter={false} />
              </Suspense>
            </div> : <EmptyState icon={UserX} title="No pickup set">This passenger needs to use Find my pickup in their app.</EmptyState>}
            {active && <div className="rounded-xl bg-secondary/50 p-3 text-body-sm">
              <p className="font-semibold">{active.pickup?.name || (active.pickup ? "Saved pickup" : "No pickup yet")}</p>
              <p className="mt-1 text-muted-foreground">{active.route_name || "No matching route"} · {active.bus_name ? "Currently on " + active.bus_name : "No bus assigned"}</p>
              {["no_route", "route_no_bus"].includes(active.status) && <p className="mt-2 text-muted-foreground">{nearbyDetail(active, "No bus passes within 1.5 km")}</p>}
            </div>}
            {active && eligible.length > 0 && <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-caption font-semibold text-muted-foreground">{active.status === "ok" ? "Assigned bus" : chosen?.id === active.nearby?.bus_id && !active.suggested ? "Nearby bus option" : "Recommended bus"}</p>
              {chosen && <div className="flex min-w-0 items-center gap-3"><img src="/images/transit-bus-3d.webp" alt="" className="h-20 w-24 shrink-0 object-contain" /><div className="min-w-0 flex-1"><Seats bus={chosen} /></div></div>}
              {eligible.length > 1 && <BusChoice label="Choose another bus" value={chosenId} onChange={(id) => setChoice({ key: active.key, id })} buses={eligible} disabled={!!busy} />}
              {chosen && chosen.id !== active.bus_id && <>
                {chosen.capacity > 0 && chosen.riders >= chosen.capacity && <p className="text-body-sm text-warning">This bus is at its assigned capacity. Review seats before assigning.</p>}
                {chosen.id === active.nearby?.bus_id && ["no_route", "route_no_bus"].includes(active.status) && <p className="text-body-sm text-warning">Their pickup must move onto this bus’s route. The app will ask them to pick again.</p>}
                <Button className="w-full whitespace-normal" disabled={!!busy} onClick={() => assign(active, chosen)} aria-label={`Assign ${active.name} to ${chosen.name}`}>{busy === active.key ? "Assigning…" : `Assign ${active.name} to ${chosen.name}`}</Button>
                <p className="text-center text-caption text-muted-foreground">Changes apply only after confirmation.</p>
              </>}
              {chosen?.id === active.bus_id && <p className="text-body-sm text-muted-foreground">Already assigned to this bus.</p>}
            </div>}
            {active?.status === "route_no_bus" && waiting && <section aria-label={`${waiting.route_name}: waiting`} className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="font-semibold">{waiting.route_name} has no bus</h3>
              <p className="text-body-sm text-muted-foreground">{waiting.people.length} passengers waiting. Put a bus on this route, then review their assignments.</p>
              <BusChoice label={`Bus for ${waiting.route_name}`} value={busForRoute[waiting.route_id]} onChange={(id) => setBusForRoute((m) => ({ ...m, [waiting.route_id]: id }))} buses={(data.buses || []).filter((b) => b.company_id === waiting.company_id)} disabled={!!busy} />
              <Button className="w-full" disabled={!busForRoute[waiting.route_id] || !!busy} onClick={() => putBusOnRoute(waiting)}>Put bus on route</Button>
            </section>}
            {active?.status === "no_route" && <div className="rounded-xl border border-border p-3"><p className="mb-2 text-body-sm text-muted-foreground">No route reaches this pickup. Review nearby buses or draw a road past it.</p><Button variant="outline" asChild><Link to="/admin/route-planner">Open Route Planner</Link></Button></div>}
            {!active && <p className="text-body-sm text-muted-foreground">Choose a passenger to review their pickup and bus.</p>}
          </Panel>
          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold"><Bus className="mr-2 inline h-4 w-4" />Bus capacity <span className="text-body-sm font-normal text-muted-foreground">· {buses.length} buses</span></summary>
            <p className="mt-2 text-caption text-muted-foreground">Assigned passengers, not live onboard counts.</p>
            <ul className="mt-4 space-y-4" aria-label="Seats on each bus">{buses.map((b) => <li key={b.id}><Seats bus={b} /></li>)}</ul>
            {!buses.length && <p className="mt-3 text-body-sm text-muted-foreground">No buses yet.</p>}
          </details>
        </div>
      </div>
    </div>
  );
}

