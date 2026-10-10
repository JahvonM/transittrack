import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Bus, CheckCircle2, CircleDashed, MapPinOff, Route as RouteIcon, TriangleAlert, Users, UserX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { confirmAction } from "@/components/ConfirmHost";
import { EmptyState, Kpi, KpiRow, PageIntro, Panel, Segmented } from "@/components/admin/kit";
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
        <span className="shrink-0 text-body-sm tabular-nums">{bus.riders}{cap ? ` / ${cap}` : ""} <span className="text-muted-foreground">seats</span></span>
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

function PersonRow({ person, children, detail }) {
  const s = STATUS[person.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 hover:bg-accent/40">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{person.name}</span>
        <span className="block text-body-sm text-muted-foreground">{detail}</span>
      </span>
      {children && <span className="flex shrink-0 items-center gap-2">{children}</span>}
    </li>
  );
}

export default function PlanPickupsTab() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [busForRoute, setBusForRoute] = useState({});

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
    setBusy(person.key);
    try {
      await setBus(person, bus.id);
      toast({ title: `${verb} ${person.name} to ${bus.name}` });
      await load();
    } catch (e) {
      toast({ title: `Couldn't assign ${person.name}`, description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };
  const suggestedAll = [...by.needs_bus, ...by.wrong_bus].filter((p) => p.suggested);
  const assignAll = async () => {
    if (!suggestedAll.length) return;
    if (!(await confirmAction({
      title: `Assign ${suggestedAll.length} passenger${suggestedAll.length === 1 ? "" : "s"} to their suggested bus?`,
      description: "Each one is put on the bus that drives past their pickup. Their phone shows the new bus straight away.",
      confirmLabel: "Assign all",
    }))) return;
    setBusy("all");
    let done = 0, failed = 0;
    for (const p of suggestedAll) {
      setProgress(`Assigning ${done + failed + 1} of ${suggestedAll.length}…`);
      try { await setBus(p, p.suggested.id); done++; } catch { failed++; }
    }
    setProgress("");
    setBusy("");
    toast({ title: `Assigned ${done} passenger${done === 1 ? "" : "s"}`, description: failed ? `${failed} couldn't be assigned. They're still listed.` : undefined, variant: failed ? "destructive" : undefined });
    await load();
  };
  const putBusOnRoute = async (group) => {
    const bus = buses.find((b) => b.id === busForRoute[group.route_id]);
    if (!bus) return;
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
  };

  const lines = routes.map((r) => drawnRoad(r)).filter(Boolean).map((coords) => ({ coords, color: "#22d3ee", width: 4, opacity: 0.7 }));
  const pins = people.filter((p) => p.pickup).map((p) => ({ lat: p.pickup.lat, lng: p.pickup.lng, color: STATUS[p.status].color, label: p.name }));

  if (error) return <EmptyState icon={TriangleAlert} title="Couldn't load the plan" action={<Button onClick={load}>Try again</Button>}>{error}</EmptyState>;
  if (!data) return <div className="grid place-items-center py-16"><BusLoader label="Sorting passengers onto buses…" /></div>;

  const count = (k) => by[k].length;
  return (
    <div className="space-y-4">
      <PageIntro>Put every passenger on the bus that drives past their pickup. The app suggests the bus; nothing changes until you tap Assign.</PageIntro>
      {companies.length > 1 && (
        <Segmented label="Company" value={companyId} onChange={setCompanyId} options={[{ value: "all", label: "All companies" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      <KpiRow className="xl:grid-cols-6">
        {Object.entries(STATUS).map(([k, s]) => <Kpi key={k} label={s.kpi} value={count(k)} tone={s.tone} icon={s.icon} />)}
      </KpiRow>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel title="Pickups on the map" icon={Users}>
            <div className="h-[420px] overflow-hidden rounded-xl border border-border">
              <Suspense fallback={<div className="h-full animate-pulse bg-muted" />}>
                <LiteMap fill vehicles={[]} pins={pins} lines={lines} showUserDot={false} showRecenter={false} />
              </Suspense>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption" aria-label="Map key">
              {Object.entries(STATUS).filter(([k]) => k !== "no_pickup").map(([k, s]) => (
                <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.label}</li>
              ))}
              <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#22d3ee]" aria-hidden="true" />Drawn road</li>
            </ul>
          </Panel>

          <Panel
            title={`Needs a bus (${count("needs_bus")})`}
            icon={CircleDashed}
            actions={suggestedAll.length > 0 && <Button size="sm" onClick={assignAll} disabled={!!busy}>{busy === "all" ? progress : `Assign all suggested (${suggestedAll.length})`}</Button>}
          >
            {count("needs_bus") === 0 ? <p className="text-body-sm text-muted-foreground">Everyone with a pickup on a road a bus runs has a bus.</p> : (
              <ul className="-mx-3 space-y-1" aria-label="Needs a bus">
                {by.needs_bus.map((p) => (
                  <PersonRow key={p.key} person={p} detail={<>{p.pickup?.name || "Pickup"} · {p.route_name}</>}>
                    <span className="hidden text-body-sm sm:inline"><ArrowRight className="mr-1 inline h-4 w-4" aria-hidden="true" />{p.suggested.name}</span>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => assign(p, p.suggested)} aria-label={`Assign ${p.name} to ${p.suggested.name}`}>Assign</Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Wrong bus (${count("wrong_bus")})`} icon={TriangleAlert} description="Their bus doesn't drive the road their pickup is on.">
            {count("wrong_bus") === 0 ? <p className="text-body-sm text-muted-foreground">No one is on a bus that misses their pickup.</p> : (
              <ul className="-mx-3 space-y-1" aria-label="Wrong bus">
                {by.wrong_bus.map((p) => (
                  <PersonRow key={p.key} person={p} detail={<>On {p.bus_name} · pickup on {p.route_name}</>}>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => assign(p, p.suggested, "Moved")} aria-label={`Move ${p.name} to ${p.suggested.name}`}>Move to {p.suggested.name}</Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Route has no bus yet (${count("route_no_bus")})`} icon={RouteIcon} description="Their pickup is on a route no bus runs. Put a bus on the route, or use a bus that passes nearby (they'll be asked to pick a pickup on its road).">
            {waitingByRoute.length === 0 ? <p className="text-body-sm text-muted-foreground">Every route with a pickup has a bus.</p> : (
              <div className="space-y-4">
                {waitingByRoute.map((g) => (
                  <section key={g.route_id} aria-label={`${g.route_name}: waiting`} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="w-full min-w-0 font-semibold sm:w-auto sm:flex-1">{g.route_name} <span className="font-normal text-muted-foreground">· {g.people.length} waiting</span></p>
                      <label className="sr-only" htmlFor={`bus-for-${g.route_id}`}>Bus for {g.route_name}</label>
                      <select id={`bus-for-${g.route_id}`} value={busForRoute[g.route_id] || ""} onChange={(e) => setBusForRoute((m) => ({ ...m, [g.route_id]: e.target.value }))}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-body-sm sm:flex-none">
                        <option value="">Choose a bus…</option>
                        {(data.buses || []).filter((b) => b.company_id === g.company_id).map((b) => <option key={b.id} value={b.id}>{b.name}{b.route_name ? ` (now ${b.route_name})` : ""}</option>)}
                      </select>
                      <Button size="sm" disabled={!busForRoute[g.route_id] || !!busy} onClick={() => putBusOnRoute(g)}>Put bus on route</Button>
                    </div>
                    <ul className="-mx-3 mt-2 space-y-1">
                      {g.people.map((p) => (
                        <PersonRow key={p.key} person={p} detail={nearbyDetail(p, "No other bus passes nearby")}>
                          {canUseNearby(p) && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => assign(p, { id: p.nearby.bus_id, name: p.nearby.bus_name })}>Use {p.nearby.bus_name}</Button>}
                        </PersonRow>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`No route reaches them (${count("no_route")})`} icon={MapPinOff} description="Their pickup isn't on any route's road. Draw a road past them in the Route Planner, or use a bus that passes nearby.">
            {count("no_route") === 0 ? <p className="text-body-sm text-muted-foreground">Every pickup is on a route.</p> : (
              <ul className="-mx-3 space-y-1" aria-label="No route reaches them">
                {by.no_route.map((p) => (
                  <PersonRow key={p.key} person={p} detail={nearbyDetail(p, "No bus passes within 1.5 km")}>
                    {canUseNearby(p) && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => assign(p, { id: p.nearby.bus_id, name: p.nearby.bus_name })}>Use {p.nearby.bus_name}</Button>}
                  </PersonRow>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Seats on each bus" icon={Bus}>
            {buses.length === 0 ? <p className="text-body-sm text-muted-foreground">No buses yet.</p> : (
              <ul className="space-y-3" aria-label="Seats on each bus">{buses.map((b) => <li key={b.id}><Seats bus={b} /></li>)}</ul>
            )}
          </Panel>
          <Panel title={`On the right bus (${count("ok")})`} icon={CheckCircle2}>
            {count("ok") === 0 ? <p className="text-body-sm text-muted-foreground">No one yet.</p> : (
              <ul className="-mx-3 space-y-1" aria-label="On the right bus">
                {by.ok.map((p) => <PersonRow key={p.key} person={p} detail={<>{p.bus_name}{p.route_name ? ` · ${p.route_name}` : ""}</>} />)}
              </ul>
            )}
          </Panel>
          <Panel title={`No pickup yet (${count("no_pickup")})`} icon={UserX} description="They haven't used Find my pickup in the app yet.">
            {count("no_pickup") === 0 ? <p className="text-body-sm text-muted-foreground">Everyone has a pickup.</p> : (
              <ul className="-mx-3 space-y-1" aria-label="No pickup yet">
                {by.no_pickup.map((p) => <PersonRow key={p.key} person={p} detail={p.bus_name ? `On ${p.bus_name}` : "No bus"} />)}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
