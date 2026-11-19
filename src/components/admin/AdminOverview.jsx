import { ChoiceSelect } from "@/components/ui/choice-picker";
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bus, ChevronRight, CircleCheck, Gauge, MapPinOff, OctagonAlert, SatelliteDish, Search, Siren, Smartphone, Plus, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { freshnessOf, formatAge } from "@/components/system/status";
import RecentActivityFeed from "@/components/admin/RecentActivityFeed";

import { adminTabletHealth } from "@/lib/adminTabletHealth";
import { PageActions } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

// One status word for a bus, for staff (emergencies included).
export function fleetStatus(v, now = Date.now()) {
  if (v.status === "emergency") return { key: "sos", label: "SOS", tone: "danger" };
  if (v.status === "maintenance") return { key: "out", label: "Maintenance", tone: "warning" };
  if (v.status === "offline") return { key: "idle", label: "Offline", tone: "offline" };
  if (v.in_service === false) return { key: "out", label: "Out of service", tone: "warning" };
  if (!v.tracking_active || v.current_lat == null) return { key: "idle", label: "Not tracking", tone: "offline" };
  const f = freshnessOf(v.last_location_update, { now });
  if (f.state === "lost" || f.state === "unknown") return { key: "lost", label: "Signal lost", tone: "warning" };
  if (v.status === "speeding") return { key: "speed", label: "Speeding", tone: "danger" };
  if (f.state === "stale") return { key: "stale", label: "Location delayed", tone: "warning" };
  return { key: "live", label: "On route", tone: "success" };
}

const PILL = {
  success: "text-success", warning: "text-warning", danger: "text-danger", offline: "text-muted-foreground", info: "text-info",
};
const DOT = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", offline: "bg-offline", info: "bg-info" };

export function StatusPill({ status }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-body-sm font-semibold", PILL[status.tone])}>
      <span className={cn("h-2 w-2 rounded-full", DOT[status.tone], status.key === "live" && "tt-live-pulse text-success")} aria-hidden="true" />
      {status.label}
    </span>
  );
}

// Icon tiles stay grey; only a count that needs action (faults, tablets) takes a colour.
const QUIET = "bg-secondary text-muted-foreground";
function Stat({ icon: Icon, tone, value, label, detail, onClick }) {
  return (
    <button type="button" onClick={onClick} className="tt-admin-tile">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone)} aria-hidden="true"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0">
        <span className="block font-display text-[1.75rem] font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-body-sm font-semibold">{label}</span>
        {detail && <span className="block truncate text-caption text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}

// A card with its title and, top right, a small arrow to the full page.
function Panel({ title, go, goLabel, children, className, extra }) {
  return (
    <section className={cn("tt-admin-card flex min-w-0 flex-col rounded-2xl border border-border bg-card", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pb-2 pt-4">
        <h2 className="text-title-sm font-semibold">{title}</h2>
        <span className="flex min-w-0 max-w-full items-center gap-2">{extra}{go && <button type="button" onClick={go} aria-label={goLabel} title={goLabel} className="tt-admin-card-go"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>}</span>
      </div>
      {children}
    </section>
  );
}

// "Fleet by status": how the buses split, as tick bars.
const SPLIT = [
  { key: "live", label: "On route", keys: ["live", "speed"], tone: "success", icon: Bus },
  { key: "stale", label: "Location delayed", keys: ["stale"], tone: "warning", icon: SatelliteDish },
  { key: "lost", label: "Signal lost", keys: ["lost"], tone: "warning", icon: SatelliteDish },
  { key: "idle", label: "Not tracking", keys: ["idle"], tone: "offline", icon: MapPinOff },
  { key: "out", label: "Off the road", keys: ["out"], tone: "warning", icon: Wrench },
  { key: "sos", label: "SOS", keys: ["sos"], tone: "danger", icon: Siren },
];
// The bus table's filters.
const FILTERS = [
  { key: "all", label: "All", keys: null },
  { key: "live", label: "On route", keys: ["live", "speed"] },
  { key: "delayed", label: "Delayed", keys: ["stale", "lost"] },
  { key: "off", label: "Off the road", keys: ["idle", "out"] },
  { key: "alerts", label: "Alerts", keys: ["sos", "speed"] },
];
const RANK = { sos: 0, speed: 1, lost: 2, stale: 3, out: 4, live: 5, idle: 6 };

function TickBar({ value, total }) {
  const pct = total ? Math.round(100 * value / total) : 0;
  return <span className="tt-admin-ticks" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>;
}

export default function AdminOverview({ vehicles=[], routes=[], trips=[], faults=[], schedules=[], companies=[], parts=[], kiosks=[], kiosksReady=false, checkIns=[], checkInsReady=false, onNavigate, tools }) {
 const occupancy=useMemo(()=>computeOccupancyByVehicle(checkIns),[checkIns]);
 const occupancyReady=checkInsReady;
 const [scope,setScope]=useState("all");
 const [filter,setFilter]=useState("all");
 const [query,setQuery]=useState("");
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const fleet=vehicles.filter(v=>scope==="all"||v.company_id===scope);
 const ids=new Set(fleet.map(v=>v.id));
 const belongs=row=>scope==="all"||row.company_id===scope||ids.has(row.vehicle_id);
 const devices=kiosks.filter(belongs);
 const statuses=useMemo(()=>Object.fromEntries(vehicles.map(v=>[v.id,fleetStatus(v,now)])),[vehicles,now]);
 const tabletStates=useMemo(()=>Object.fromEntries(kiosks.map(d=>[d.id,adminTabletHealth(d,now)])),[kiosks,now]);
 const keyOf=v=>statuses[v.id].key;
 const live=fleet.filter(v=>["live","stale","speed"].includes(keyOf(v)));
 const signal=fleet.filter(v=>["lost","stale"].includes(keyOf(v)));
 const sos=fleet.filter(v=>v.status==="emergency");
 const onTrip=fleet.filter(v=>v.status==="on_trip");
 const inService=fleet.filter(v=>keyOf(v)!=="out");
 const openFaults=faults.filter(belongs).filter(f=>f.status!=="resolved");
 const major=openFaults.filter(f=>["high","critical"].includes(f.severity));
 const due=schedules.filter(belongs).filter(s=>["due","overdue"].includes(s.status));
 const needsTablets=devices.filter(d=>tabletStates[d.id]?.attention);
 const onBoard=fleet.reduce((n,v)=>n+(occupancy[v.id]||0),0);
 const nameOf=id=>fleet.find(v=>v.id===id)?.name;
 const companyOf=row=>row.company_name||companies.find(c=>c.id===row.company_id)?.name||"Unassigned company";
 const routeOf=v=>routes.find(r=>r.id===v.route_id);
 const age=iso=>formatAge(freshnessOf(iso,{now}).ageMs)||"No report";
 const ordered=[...fleet].sort((a,b)=>(RANK[keyOf(a)]-RANK[keyOf(b)])||String(a.name).localeCompare(String(b.name),undefined,{numeric:true}));
 const words=query.trim().toLowerCase();
 const matches=v=>!words||[v.name,v.plate_number,v.fleet_number,v.driver_name,routeOf(v)?.name,companyOf(v)].some(t=>String(t||"").toLowerCase().includes(words));
 const shown=ordered.filter(matches);
 const filterOf=key=>FILTERS.find(f=>f.key===key);
 const inFilter=(v,key=filter)=>{const f=filterOf(key);return !f?.keys||f.keys.includes(keyOf(v));};
 const rows=shown.filter(v=>inFilter(v));
 const onRoad=inService.filter(v=>["live","stale","speed"].includes(keyOf(v))).length;
 const roadPct=inService.length?Math.round(100*onRoad/inService.length):0;
 const alerts=[
  ...sos.map(v=>({id:"sos-"+v.id,vehicle:v,icon:Siren,title:v.name+": SOS",detail:v.driver_name||companyOf(v),go:"fleet",action:"View fleet",tone:"danger"})),
  ...fleet.filter(v=>keyOf(v)==="speed").map(v=>({id:"speed-"+v.id,vehicle:v,icon:Gauge,title:v.name+": speeding",detail:v.driver_name||companyOf(v),go:"fleet",action:"View fleet",tone:"danger"})),
  ...openFaults.map(f=>({id:"fault-"+f.id,vehicle:fleet.find(v=>v.id===f.vehicle_id),icon:OctagonAlert,title:[f.vehicle_name||nameOf(f.vehicle_id),f.title||"Open fault"].filter(Boolean).join(" · "),detail:f.severity ? f.severity+" priority" : "Open fault",go:"faults",action:"Review fault",tone:f.severity==="critical"?"danger":"warning"})),
  ...due.map(m=>({id:"due-"+m.id,vehicle:fleet.find(v=>v.id===m.vehicle_id),icon:Wrench,title:[m.vehicle_name||nameOf(m.vehicle_id),m.service_type||"Maintenance"].filter(Boolean).join(" · "),detail:m.status==="overdue"?"Maintenance overdue":"Maintenance due",go:"schedule",action:"Maintenance",tone:"warning"})),
  ...needsTablets.map(d=>({id:"tablet-"+d.id,icon:Smartphone,title:d.label||d.name||d.vehicle_name||"Tablet",detail:tabletStates[d.id].label,go:"kiosks",action:"View tablet",tone:"warning"})),
  ...signal.filter(v=>keyOf(v)==="lost").map(v=>({id:"lost-"+v.id,vehicle:v,icon:SatelliteDish,title:v.name+": signal lost",detail:"Last fix "+age(v.last_location_update),go:"fleet",action:"View fleet",tone:"warning"})),
 ];
 const tabletRows=[...devices].sort((a,b)=>Number(tabletStates[b.id]?.attention)-Number(tabletStates[a.id]?.attention)).slice(0,6);
 const totals=[["Passengers on board",occupancyReady?onBoard:"—","checkins"],["Active trips",trips.filter(belongs).length,"trips"],["Signal issues",signal.length,"fleet"],["Major issues",sos.length+major.length,"faults"],["Maintenance due",due.length,"schedule"],["Companies",scope==="all"?companies.length:1,"companies"],["Parts",parts.filter(belongs).length,"parts"]];
 return <div className="tt-admin-overview space-y-4">
  <PageActions>
   <label className="sr-only" htmlFor="tt-overview-company">Overview company</label>
   <ChoiceSelect aria-label="Overview company" id="tt-overview-company" value={scope} onChange={e=>setScope(e.target.value)} className="h-10 max-w-[230px] rounded-xl border border-input bg-card px-3 text-sm"><option value="all">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ChoiceSelect>
   <Button onClick={()=>onNavigate("vehicles?create=1")}><Plus className="w-4 h-4" />Add vehicle</Button>
  </PageActions>
  <div className="tt-admin-home">
   <div className="tt-admin-home-side">
    {/* Today: how much of the fleet is out, and the counts that matter. */}
    <Panel title="Today" go={()=>onNavigate("fleet")} goLabel="Open live fleet" className="tt-admin-today tt-order-1">
     <div className="px-5 pb-5">
      <p className="text-caption text-muted-foreground">{scope==="all"?"All companies":companyOf({company_id:scope})}</p>
      <div className="tt-admin-gauge mt-4" role="img" aria-label={`${onRoad} of ${inService.length} buses in service are on the road (${roadPct}%)`}>
       <span className="tt-admin-gauge-track" aria-hidden="true" />
       <span className="tt-admin-gauge-knob" style={{ left: roadPct + "%" }} aria-hidden="true"><b>{roadPct}%</b></span>
      </div>
      <div className="mt-2 flex justify-between text-caption text-muted-foreground" aria-hidden="true"><span>0%</span><span>100%</span></div>
      <p className="mt-1 text-center text-body-sm"><strong className="tabular-nums">{onRoad} / {inService.length}</strong> <span className="text-muted-foreground">buses on the road</span></p>
      <section aria-label="Fleet overview" className="tt-admin-stats mt-4 grid grid-cols-2 gap-2">
       <Stat icon={Bus} tone={QUIET} value={fleet.length} label="Vehicles" detail={scope==="all"?"All companies":"This company"} onClick={()=>onNavigate("vehicles")} />
       <Stat icon={Bus} tone={QUIET} value={onTrip.length} label="On trip" detail={live.length+" sharing location"} onClick={()=>onNavigate("fleet")} />
       <Stat icon={OctagonAlert} tone={openFaults.length?"bg-danger/15 text-danger":QUIET} value={openFaults.length>=500?"500+":openFaults.length} label="Open faults" detail="Not yet resolved" onClick={()=>onNavigate("faults")} />
       <Stat icon={Smartphone} tone={kiosksReady&&needsTablets.length?"bg-warning/15 text-warning":QUIET} value={kiosksReady?needsTablets.length:"—"} label="Tablets needing attention" detail={kiosksReady?"From tablet reports":"Tablet data unavailable"} onClick={()=>onNavigate("kiosks")} />
      </section>
      <ul aria-label="Fleet totals" className="tt-admin-totals mt-4 flex flex-wrap gap-2">
       {totals.map(([label,value,go])=><li key={label}><button type="button" onClick={()=>onNavigate(go)} className="tt-admin-chip"><strong className="tabular-nums">{value}</strong> {label}</button></li>)}
      </ul>
     </div>
    </Panel>
    <Panel title="Fleet by status" go={()=>onNavigate("vehicles")} goLabel="View vehicles" className="tt-order-4">
     <ul className="px-5 pb-5 space-y-1">
      {SPLIT.filter(s=>s.key!=="sos"||sos.length).map(s=>{const n=fleet.filter(v=>s.keys.includes(keyOf(v))).length;const Icon=s.icon;return <li key={s.key}>
       <button type="button" onClick={()=>{setFilter(FILTERS.find(f=>f.keys?.some(k=>s.keys.includes(k)))?.key||"all");document.getElementById("tt-admin-buses")?.scrollIntoView({block:"nearest",behavior:"smooth"});}} className="tt-admin-split-row">
        <Icon className={cn("h-4 w-4 shrink-0",PILL[s.tone])} aria-hidden="true" />
        <span className="flex-1 truncate">{s.label}</span>
        <strong className="w-8 text-right tabular-nums">{n}</strong>
        <TickBar value={n} total={fleet.length} />
        <span className="w-10 text-right text-caption tabular-nums text-muted-foreground">{fleet.length?Math.round(100*n/fleet.length):0}%</span>
       </button>
      </li>;})}
     </ul>
    </Panel>
    <Panel title="Needs attention" go={()=>onNavigate("health")} goLabel="Fleet health" className="tt-order-5">
     <div className="tt-admin-alert-list px-4 pb-4 space-y-2">
      {alerts.slice(0,4).map(a=>{const Icon=a.icon;return <button type="button" key={a.id} onClick={()=>onNavigate(a.go)} className="tt-admin-attention-row">
       <span className={cn("tt-admin-attention-icon",a.tone==="danger"?"text-danger":"text-warning")}><Icon className="w-5 h-5" aria-hidden="true" /></span>
       <span className="min-w-0 flex-1"><strong className="block break-words text-body-sm">{a.title}</strong><span className={cn("block text-caption mt-0.5",a.tone==="danger"?"text-danger":"text-warning")}>{a.detail}</span></span>
       <span className="tt-admin-attention-action">{a.action}<ChevronRight className="w-4 h-4" aria-hidden="true" /></span>
      </button>})}
      {!alerts.length&&<p className="flex gap-2 items-center py-6 text-sm text-muted-foreground"><CircleCheck className="w-5 h-5 text-success" aria-hidden="true" />No issues in the loaded fleet records.</p>}
      {alerts.length>4&&<button type="button" onClick={()=>onNavigate("health")} className="text-caption font-semibold text-muted-foreground hover:text-foreground">{alerts.length-4} more in Fleet health</button>}
      {!kiosksReady&&<p role="status" className="text-sm text-warning">Tablet health could not be loaded.</p>}
     </div>
    </Panel>
   </div>
   <div className="tt-admin-home-main">
    <Panel title="Live fleet" go={()=>onNavigate("fleet")} goLabel="Open live fleet" className="tt-admin-map-panel overflow-hidden tt-order-2">
     <div className="relative p-2 pt-0">
      <Suspense fallback={<div className="tt-admin-map h-[440px] animate-pulse rounded-xl bg-muted" />}><LiveTransitMap variant="page" className="tt-admin-map h-[440px] rounded-xl" vehicles={shown.filter(v=>v.current_lat!=null&&v.current_lng!=null)} routes={routes} label="Fleet map" /></Suspense>
      <label className="tt-admin-map-search">
       <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
       <span className="sr-only">Find a bus</span>
       <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a bus, plate or driver" className="min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground" />
      </label>
     </div>
     <p className="px-5 pb-3 pt-1 text-xs text-muted-foreground">Latest recorded positions. Delayed or missing reports show in the list below.</p>
    </Panel>
    <Panel title="Fleet status" go={()=>onNavigate("vehicles")} goLabel="View vehicles" className="tt-order-3"
     extra={<div role="group" aria-label="Show buses" className="tt-admin-segments">{FILTERS.map(f=>{const n=f.keys?shown.filter(v=>f.keys.includes(keyOf(v))).length:shown.length;return <button key={f.key} type="button" aria-pressed={filter===f.key} onClick={()=>setFilter(f.key)}>{f.label}<span className="tabular-nums">{n}</span></button>;})}</div>}>
     <div id="tt-admin-buses" className="overflow-x-auto"><table className="tt-admin-status-table"><thead><tr><th>Vehicle</th><th>Route · company</th><th>Driver</th><th>On board</th><th>Last update</th><th>Status</th></tr></thead><tbody>
      {rows.slice(0,8).map(v=><tr key={v.id}>
       <td><button type="button" onClick={()=>onNavigate("fleet")} className="flex items-center gap-3 text-left"><span className="tt-admin-bus-icon" aria-hidden="true"><Bus className="h-4 w-4" /></span><span><strong className="block">{v.name}</strong><small className="text-muted-foreground">{v.plate_number||"No plate"}</small></span></button></td>
       <td><span className="block">{routeOf(v)?.name||"No route assigned"}</span><small className="text-muted-foreground">{companyOf(v)}</small></td>
       <td>{v.driver_name||<span className="text-muted-foreground">—</span>}</td>
       <td className="tabular-nums">{occupancy[v.id]>0?<>{occupancy[v.id]}{v.capacity?<span className="text-muted-foreground"> / {v.capacity}</span>:null}</>:<span className="text-muted-foreground">—</span>}</td>
       <td className="text-muted-foreground">{age(v.last_location_update)}</td>
       <td><StatusPill status={statuses[v.id]} /></td>
      </tr>)}
     </tbody></table></div>
     {!fleet.length&&<p className="p-5 text-sm text-muted-foreground">No vehicles in this view.</p>}
     {fleet.length>0&&!rows.length&&<p className="p-5 text-sm text-muted-foreground">No buses match{words?` "${query.trim()}"`:""} in this list.</p>}
     {rows.length>8&&<button type="button" onClick={()=>onNavigate("vehicles")} className="mx-5 mb-4 self-start text-caption font-semibold text-muted-foreground hover:text-foreground">{rows.length-8} more in Vehicles</button>}
    </Panel>
   </div>
  </div>
  <Panel title="Tablet health" go={()=>onNavigate("kiosks")} goLabel="View tablets">
   <div className="tt-admin-tablet-grid px-4 pb-4">{tabletRows.map(d=><button key={d.id} type="button" onClick={()=>onNavigate("kiosks")} className="tt-admin-tablet-row"><Smartphone className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block break-words">{d.label||d.name||d.vehicle_name||"Tablet"}</strong><small className="block text-muted-foreground">{d.vehicle_name||nameOf(d.vehicle_id)||"No vehicle"} · {companyOf(d)}</small><small className="block text-muted-foreground">Last seen: {age(d.last_seen)}</small></span><StatusPill status={tabletStates[d.id]} /></button>)}</div>
   {!devices.length&&<p className="p-5 text-sm text-muted-foreground">{kiosksReady?"No tablets in this view.":"Tablet data unavailable."}</p>}
  </Panel>
  <RecentActivityFeed onNavigate={onNavigate} />
  {tools}
 </div>;
}
