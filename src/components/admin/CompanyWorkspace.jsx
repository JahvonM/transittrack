import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Pencil, Bus, Users, Route, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NestedPage, PageIntro, Panel, Kpi, KpiRow } from "@/components/admin/kit";
import { toast } from "@/components/ui/use-toast";
import CompanyEditDialog from "@/components/CompanyEditDialog";
import PlanPickupsTab from "./PlanPickupsTab";

const tabs = [["overview","Overview"],["people","People"],["transport","Assigned transport"],["pickups","Pickup planning"]];
const errorText = e => e?.response?.data?.error || e.message || "Please try again.";
function Rows({ items, children, empty }) {
 return items.length ? <div className="divide-y">{items.map(children)}</div> : <p className="py-5 text-sm text-muted-foreground">{empty}</p>;
}
export default function CompanyWorkspace({ company, tab, onTab, onBack, onChange }) {
 const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const [editing,setEditing]=useState(false),[search,setSearch]=useState(""),[busy,setBusy]=useState("");
 const request=useRef(0);
 const load=useCallback(async()=>{
  const version=++request.current;
  setLoading(true);setError("");
  try {
   const response=await base44.functions.invoke("companyWorkspace",{company_id:company.id});
   if(version===request.current)setData(response.data);
  } catch(e){if(version===request.current)setError(errorText(e));}
  finally{if(version===request.current)setLoading(false);}
 },[company.id]);
 useEffect(()=>{load();return()=>{request.current++;};},[load]);
 const saveRoute=async(vehicle,routeId)=>{
  if(busy)return;
  setBusy(vehicle.id);
  try {
   await base44.entities.Vehicle.update(vehicle.id,{route_id:routeId});
   setData(old=>({...old,vehicles:old.vehicles.map(v=>v.id===vehicle.id?{...v,route_id:routeId}:v)}));
   toast({title:"Bus route updated"});
  }catch(e){toast({title:"Could not update route",description:errorText(e),variant:"destructive"});}
  finally{setBusy("");}
 };
 const people=data ? [
  ...data.people.map(p=>({...p,key:"member:"+p.id,kind:p.scope==="manager"?"Company manager":"App passenger"})),
  ...data.contacts.filter(c=>!c.email || !data.people.some(p=>p.email?.toLowerCase()===c.email.toLowerCase())).map(c=>({...c,key:"contact:"+c.id,kind:"Directory "+(c.type||"passenger")})),
  ...data.drivers.map(d=>({...d,name:d.full_name,key:"driver:"+d.id,kind:"Driver"}))
 ] : [];
 const visible=people.filter(p=>[p.name,p.email,p.phone,p.kind].join(" ").toLowerCase().includes(search.toLowerCase()));
 const workplace=data?.workplaces.find(w=>w.lat!==null && w.lng!==null && Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng)));
 return <div className="space-y-5">
  <PageIntro>Manage this company's people, transport, and pickups.</PageIntro>
  <div className="flex flex-wrap items-center gap-3">
   <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/>All companies</Button>
   {company.logo_url && <img src={company.logo_url} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1"/>}
   <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold break-words">{company.name}</h2><p className="text-sm text-muted-foreground">{company.phone || "No main phone added"}</p></div>
   <Button variant="outline" onClick={()=>setEditing(true)}><Pencil className="mr-2 h-4 w-4"/>Edit details / workplace</Button>
   <Button variant="outline" onClick={load} disabled={loading||!!busy} aria-label="Refresh company"><RefreshCw className="h-4 w-4"/></Button>
  </div>
  <div role="tablist" aria-label="Company sections" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
   {tabs.map(([key,label])=><Button key={key} id={"company-tab-"+key} role="tab" aria-selected={tab===key} aria-controls="company-content" variant={tab===key?"default":"ghost"} onClick={()=>onTab(key)}>{label}</Button>)}
  </div>
  <section id="company-content" role="tabpanel" aria-labelledby={"company-tab-"+tab} className="space-y-4">
   {error ? <div role="alert" className="rounded-xl border p-5"><p>{error}</p><Button className="mt-3" onClick={load}>Try again</Button></div>
    : !data ? <p role="status" className="py-10 text-center">Loading company…</p>
    : <>
     {data.limited && <p role="status" className="rounded-xl border p-3 text-sm">Showing the most recent 1,000 records per category. Counts below cover the loaded records.</p>}
     {tab==="overview" && <>
      <KpiRow className="grid-cols-2 lg:grid-cols-4">
       <Kpi label="People" value={people.length} icon={Users}/>
       <Kpi label="Buses" value={data.vehicles.length} icon={Bus}/>
       <Kpi label="Routes" value={data.routes.length} icon={Route}/>
       <Kpi label="Devices" value={data.devices.length} icon={MapPin}/>
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
       <Panel title="Company contacts"><dl className="space-y-3 text-sm">{[["Main phone",company.phone],["Boss / owner",company.boss_phone],["Secretary",company.secretary_phone]].map(([label,value])=><div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd>{value||"Not added"}</dd></div>)}</dl></Panel>
       <Panel title="Workplace / destination"><p className="font-medium">{workplace?.name||"No workplace pin set"}</p><p className="mt-2 text-sm text-muted-foreground">{workplace ? Number(workplace.lat).toFixed(5)+", "+Number(workplace.lng).toFixed(5) : "Add the exact workplace location for pickups and drop-offs."}</p><Button variant="outline" className="mt-3" onClick={()=>setEditing(true)}>Edit workplace</Button></Panel>
      </div>
      <Panel title="Needs attention"><div className="space-y-2 text-sm"><p>{data.vehicles.filter(v=>!v.route_id).length} buses without a route</p><p>{data.vehicles.filter(v=>!v.driver_email && !v.driver_name).length} buses without an assigned driver</p><p>{data.devices.filter(d=>!d.last_seen || Date.now()-Date.parse(d.last_seen)>180000).length} devices without a recent check-in</p></div><Button variant="outline" className="mt-4" onClick={()=>onTab("pickups")}>Review pickup issues</Button></Panel>
     </>}
     {tab==="people" && <Panel title="People in this company">
      <div className="flex flex-wrap gap-2 mb-4"><Input aria-label="Search company people" placeholder="Search name, phone, email, or role…" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-md"/><Button variant="outline" asChild><Link to="/admin/directory">Manage passengers</Link></Button><Button variant="outline" asChild><Link to="/admin/users">Manage user access</Link></Button></div>
      <Rows items={visible} empty="No matching people.">{p=><div key={p.key} className="flex flex-wrap justify-between gap-2 py-3"><div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{[p.email,p.phone].filter(Boolean).join(" · ")||"No contact details"}</p></div><div className="text-sm text-right"><p>{p.kind}</p><p className="text-muted-foreground">{data.vehicles.find(v=>v.id===p.vehicle_id)?.name||""}</p></div></div>}</Rows>
     </Panel>}
     {tab==="transport" && <>
      <Panel title="Assigned buses"><p className="mb-3 text-sm text-muted-foreground">Change a bus's route here. Vehicle details and driver assignments are managed in Vehicles.</p><Button variant="outline" asChild><Link to="/admin/vehicles">Manage vehicles</Link></Button>
       <Rows items={data.vehicles} empty="No buses assigned to this company.">{v=><div key={v.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-[160px] flex-1"><p className="font-medium">{v.name}</p><p className="text-sm text-muted-foreground">{[v.plate_number,v.driver_name||"No driver",v.status].filter(Boolean).join(" · ")}</p></div><label className="text-sm flex items-center gap-2">Route<select aria-label={"Route for "+v.name} className="max-w-full rounded-lg border bg-background p-2" value={v.route_id||""} disabled={!!busy} onChange={e=>saveRoute(v,e.target.value)}><option value="">No route</option>{v.route_id && !data.routes.some(r=>r.id===v.route_id) && <option value={v.route_id}>Unavailable route</option>}{data.routes.map(r=><option key={r.id} value={r.id}>{r.name}{r.active===false?" (inactive)":""}</option>)}</select></label></div>}</Rows>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2"><Panel title="Drivers"><Rows items={data.drivers} empty="No drivers assigned.">{d=><div key={d.id} className="py-3"><p>{d.full_name}</p><p className="text-sm text-muted-foreground">{d.phone||d.email||"No contact details"}</p></div>}</Rows></Panel>
      <Panel title="Tablets and kiosks"><Rows items={data.devices} empty="No devices assigned.">{d=><div key={d.id} className="py-3"><p>{d.label||d.kiosk_type||"Device"}</p><p className="text-sm text-muted-foreground">{data.vehicles.find(v=>v.id===d.vehicle_id)?.name||"No bus"} · {d.last_seen?"Last seen "+new Date(d.last_seen).toLocaleString():"Not checked in"}</p></div>}</Rows></Panel></div>
     </>}
     {tab==="pickups" && <><div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-medium">{workplace ? "Workplace: "+workplace.name : "Add a workplace pin in Edit details / workplace."}</p><p className="mt-1 text-muted-foreground">Review passenger pickup points and bus assignments for {company.name}. Trip direction is selected on the driver screen.</p></div><NestedPage><PlanPickupsTab key={company.id} companyId={company.id}/></NestedPage></>}
    </>}
  </section>
  <CompanyEditDialog company={company} open={editing} onOpenChange={setEditing} onSaved={()=>{onChange();load();}}/>
 </div>;
}
