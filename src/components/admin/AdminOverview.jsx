import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Bus, ChevronRight, CircleCheck, Gauge, OctagonAlert, SatelliteDish, Siren, Smartphone, Plus, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { freshnessOf, formatAge } from "@/components/system/status";
import RecentActivityFeed from "@/components/admin/RecentActivityFeed";

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

function Stat({ icon: Icon, tone, value, label, detail, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[96px] min-w-0 flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent sm:flex-row sm:items-center sm:gap-4">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12", tone)} aria-hidden="true">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="min-w-0 max-w-full">
        <span className="block font-display text-[2.25rem] font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-body-sm font-semibold">{label}</span>
        {detail && <span className="block truncate text-caption text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}

function Panel({ title, action, children, className }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-card", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-title-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const ViewAll = ({ onClick, label = "View all" }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1 text-body-sm font-semibold text-muted-foreground hover:text-foreground">
    {label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
  </button>
);

import BusArtwork from "@/components/BusArtwork";
import { adminTabletHealth } from "@/lib/adminTabletHealth";
import { PageActions } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

export default function AdminOverview({ vehicles=[], routes=[], trips=[], faults=[], schedules=[], companies=[], parts=[], kiosks=[], kiosksReady=false, onNavigate, tools }) {
 const [occupancy,setOccupancy]=useState({});
 const [occupancyReady,setOccupancyReady]=useState(false);
 const [scope,setScope]=useState("all");
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  const load=()=>base44.entities.StaffCheckIn.list("-created_date",500).then(rows=>{setOccupancy(computeOccupancyByVehicle(rows));setOccupancyReady(true);}).catch(()=>{});
  load();const unsub=base44.entities.StaffCheckIn.subscribe(load);
  const timer=setInterval(()=>setNow(Date.now()),30000);
  return()=>{unsub?.();clearInterval(timer);};
 },[]);
 const fleet=vehicles.filter(v=>scope==="all"||v.company_id===scope);
 const ids=new Set(fleet.map(v=>v.id));
 const belongs=row=>scope==="all"||row.company_id===scope||ids.has(row.vehicle_id);
 const devices=kiosks.filter(belongs);
 const statuses=useMemo(()=>Object.fromEntries(vehicles.map(v=>[v.id,fleetStatus(v,now)])),[vehicles,now]);
 const tabletStates=useMemo(()=>Object.fromEntries(kiosks.map(d=>[d.id,adminTabletHealth(d,now)])),[kiosks,now]);
 const live=fleet.filter(v=>["live","stale","speed"].includes(statuses[v.id].key));
 const signal=fleet.filter(v=>["lost","stale"].includes(statuses[v.id].key));
 const sos=fleet.filter(v=>v.status==="emergency");
 const onTrip=fleet.filter(v=>v.status==="on_trip");
 const openFaults=faults.filter(belongs).filter(f=>f.status!=="resolved");
 const major=openFaults.filter(f=>["high","critical"].includes(f.severity));
 const due=schedules.filter(belongs).filter(s=>["due","overdue"].includes(s.status));
 const needsTablets=devices.filter(d=>tabletStates[d.id]?.attention);
 const onBoard=fleet.reduce((n,v)=>n+(occupancy[v.id]||0),0);
 const nameOf=id=>fleet.find(v=>v.id===id)?.name;
 const companyOf=row=>row.company_name||companies.find(c=>c.id===row.company_id)?.name||"Unassigned company";
 const routeOf=v=>routes.find(r=>r.id===v.route_id);
 const age=iso=>formatAge(freshnessOf(iso,{now}).ageMs)||"No report";
 const ordered=[...fleet].sort((a,b)=>({sos:0,speed:1,lost:2,stale:3,out:4,live:5,idle:6}[statuses[a.id].key]-{sos:0,speed:1,lost:2,stale:3,out:4,live:5,idle:6}[statuses[b.id].key])||String(a.name).localeCompare(String(b.name),undefined,{numeric:true}));
 const alerts=[
  ...sos.map(v=>({id:"sos-"+v.id,vehicle:v,icon:Siren,title:v.name+": SOS",detail:v.driver_name||companyOf(v),go:"fleet",action:"View fleet",tone:"danger"})),
  ...fleet.filter(v=>statuses[v.id].key==="speed").map(v=>({id:"speed-"+v.id,vehicle:v,icon:Gauge,title:v.name+": speeding",detail:v.driver_name||companyOf(v),go:"fleet",action:"View fleet",tone:"danger"})),
  ...openFaults.map(f=>({id:"fault-"+f.id,vehicle:fleet.find(v=>v.id===f.vehicle_id),icon:OctagonAlert,title:[f.vehicle_name||nameOf(f.vehicle_id),f.title||"Open fault"].filter(Boolean).join(" · "),detail:f.severity ? f.severity+" priority" : "Open fault",go:"faults",action:"Review fault",tone:f.severity==="critical"?"danger":"warning"})),
  ...due.map(m=>({id:"due-"+m.id,vehicle:fleet.find(v=>v.id===m.vehicle_id),icon:Wrench,title:[m.vehicle_name||nameOf(m.vehicle_id),m.service_type||"Maintenance"].filter(Boolean).join(" · "),detail:m.status==="overdue"?"Maintenance overdue":"Maintenance due",go:"schedule",action:"Maintenance",tone:"warning"})),
  ...needsTablets.map(d=>({id:"tablet-"+d.id,icon:Smartphone,title:d.label||d.vehicle_name||"Tablet",detail:tabletStates[d.id].label,go:"kiosks",action:"View tablet",tone:"warning"})),
  ...signal.filter(v=>statuses[v.id].key==="lost").map(v=>({id:"lost-"+v.id,vehicle:v,icon:SatelliteDish,title:v.name+": signal lost",detail:"Last fix "+age(v.last_location_update),go:"fleet",action:"View fleet",tone:"warning"})),
 ];
 const tabletRows=[...devices].sort((a,b)=>Number(tabletStates[b.id]?.attention)-Number(tabletStates[a.id]?.attention)).slice(0,6);
 return <div className="tt-admin-overview space-y-6">
  <PageActions>
   <label className="sr-only" htmlFor="tt-overview-company">Overview company</label>
   <select id="tt-overview-company" value={scope} onChange={e=>setScope(e.target.value)} className="h-10 max-w-[230px] rounded-xl border border-input bg-card px-3 text-sm"><option value="all">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
   <Button onClick={()=>onNavigate("vehicles?create=1")}><Plus className="w-4 h-4" />Add vehicle</Button>
  </PageActions>
  <section aria-label="Fleet overview" className="tt-admin-stats grid grid-cols-2 gap-3 xl:grid-cols-4">
   <Stat icon={Bus} tone="bg-primary/15 text-primary" value={fleet.length} label="Vehicles" detail={scope==="all"?"Across all companies":"Selected company"} onClick={()=>onNavigate("vehicles")} />
   <Stat icon={Bus} tone="bg-info/15 text-info" value={onTrip.length} label="On trip" detail={live.length+" buses sharing location"} onClick={()=>onNavigate("fleet")} />
   <Stat icon={OctagonAlert} tone="bg-danger/15 text-danger" value={openFaults.length>=500?"500+":openFaults.length} label="Open faults" detail="Loaded unresolved fault records" onClick={()=>onNavigate("faults")} />
   <Stat icon={Smartphone} tone="bg-warning/15 text-warning" value={kiosksReady?needsTablets.length:"—"} label="Tablets needing attention" detail={kiosksReady?"Current tablet reports":"Tablet data unavailable"} onClick={()=>onNavigate("kiosks")} />
  </section>
  <ul aria-label="Fleet totals" className="tt-admin-totals flex flex-wrap gap-x-6 gap-y-2 text-sm">
   {[["Active buses",live.length,"fleet"],["Signal issues",signal.length,"fleet"],["Major issues",sos.length+major.length,"faults"],["Passengers",occupancyReady?onBoard:"—","checkins"],["Active trips",trips.filter(belongs).length,"trips"],["Companies",scope==="all"?companies.length:1,"companies"],["Maintenance due",due.length,"schedule"],["Parts",parts.filter(belongs).length,"parts"]].map(([label,value,go])=><li key={label}><button type="button" onClick={()=>onNavigate(go)} className="min-h-[44px] flex items-center gap-2"><strong className="text-lg tabular-nums">{value}</strong><span className="text-muted-foreground">{label}</span></button></li>)}
  </ul>
  <div className="tt-admin-top-grid grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
   <Panel title="Live Fleet" action={<ViewAll onClick={()=>onNavigate("fleet")} label="Open Live Fleet" />} className="tt-admin-map-panel overflow-hidden">
    <div className="p-3 pt-1"><Suspense fallback={<div className="h-[410px] animate-pulse rounded-xl bg-muted" />}><LiveTransitMap variant="page" className="h-[410px] rounded-xl" vehicles={fleet.filter(v=>v.current_lat!=null&&v.current_lng!=null)} label="Fleet map" /></Suspense></div>
    <p className="px-5 pb-4 text-xs text-muted-foreground">Latest recorded positions. Delayed or missing reports are shown in Fleet status.</p>
   </Panel>
   <Panel title="Needs attention" action={<ViewAll onClick={()=>onNavigate("health")} label="Fleet health" />}>
    <div className="tt-admin-alert-list px-4 pb-4 space-y-3">
     {alerts.slice(0,5).map(a=>{const Icon=a.icon;return <button type="button" key={a.id} onClick={()=>onNavigate(a.go)} className="tt-admin-attention-row">
      {a.vehicle?<BusArtwork vehicle={a.vehicle} width={72} className="h-14 w-[72px] shrink-0" />:<span className="tt-admin-attention-icon"><Icon className="w-6 h-6" /></span>}
      <span className="min-w-0 flex-1"><strong className="block break-words">{a.title}</strong><span className={cn("block text-sm mt-1",a.tone==="danger"?"text-danger":"text-warning")}>{a.detail}</span></span>
      <span className="tt-admin-attention-action">{a.action}<ChevronRight className="w-4 h-4" /></span>
     </button>})}
     {!alerts.length&&<p className="flex gap-2 items-center py-8 text-sm text-muted-foreground"><CircleCheck className="w-5 h-5 text-success" />No issues in the loaded fleet records.</p>}
     {alerts.length>5&&<p className="text-xs text-muted-foreground">{alerts.length-5} more items. Open Fleet health or the related section to review them.</p>}
     {!kiosksReady&&<p role="status" className="text-sm text-warning">Tablet health could not be loaded.</p>}
    </div>
   </Panel>
  </div>
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
   <Panel title="Fleet status" action={<ViewAll onClick={()=>onNavigate("vehicles")} label="View vehicles" />}>
    <div className="overflow-x-auto"><table className="tt-admin-status-table"><thead><tr><th>Vehicle</th><th>Company</th><th>Status</th><th>Last update</th></tr></thead><tbody>
     {ordered.slice(0,7).map(v=><tr key={v.id}><td><button type="button" onClick={()=>onNavigate("fleet")} className="flex items-center gap-2 text-left"><BusArtwork vehicle={v} width={62} className="w-[62px] h-12 shrink-0" /><span><strong className="block">{v.name}</strong><small className="text-muted-foreground">{routeOf(v)?.name||v.plate_number||"No route assigned"}</small></span></button></td><td>{companyOf(v)}</td><td><StatusPill status={statuses[v.id]} />{occupancy[v.id]>0&&<small className="block mt-1 text-muted-foreground">{occupancy[v.id]}{v.capacity?"/"+v.capacity:""} on board</small>}</td><td className="text-muted-foreground">{age(v.last_location_update)}</td></tr>)}
    </tbody></table></div>
    {!fleet.length&&<p className="p-5 text-sm text-muted-foreground">No vehicles in this view.</p>}
   </Panel>
   <Panel title="Tablet health" action={<ViewAll onClick={()=>onNavigate("kiosks")} label="View tablets" />}>
    <div className="px-4 pb-4 space-y-2">{tabletRows.map(d=><button key={d.id} type="button" onClick={()=>onNavigate("kiosks")} className="tt-admin-tablet-row"><Smartphone className="w-6 h-6 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><strong className="block break-words">{d.label||d.vehicle_name||"Tablet"}</strong><small className="block text-muted-foreground">{d.vehicle_name||"No vehicle"} · {companyOf(d)}</small><small className="block text-muted-foreground">Last seen: {age(d.last_seen)}</small></span><StatusPill status={tabletStates[d.id]} /></button>)}</div>
    {!devices.length&&<p className="p-5 text-sm text-muted-foreground">{kiosksReady?"No tablets in this view.":"Tablet data unavailable."}</p>}
   </Panel>
  </div>
  <RecentActivityFeed onNavigate={onNavigate} />
  {tools}
 </div>;
}
