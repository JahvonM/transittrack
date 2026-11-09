import { RearDashcamTool, RearDashcamIndicator } from "./RearDashcamControls";
import React, { useState, useMemo, useEffect } from "react";
import useDriverLandscape from "@/hooks/useDriverLandscape";
import { ownDeviceNoun } from "@/lib/driverOwnDevice";
import { Bus, MapPin, ClipboardCheck, Wrench, MessageCircle, FileText, Tablet, ChevronRight, LifeBuoy, ListOrdered, ShieldCheck, User, Clock, Users, Search, IdCard, Smartphone } from "lucide-react";
import { accountName } from "@/lib/userName";
import StaffRouteListItem from "./StaffRouteListItem";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ConfirmHost";
import { useToast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";
import { haversineKm } from "@/lib/geo";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { MARKS, marksFor, markNote } from "@/lib/rideMarks";
const time=value=>value?new Date(value).toLocaleTimeString([], {timeZone:TRANSIT_TIME_ZONE,hour:"numeric",minute:"2-digit"}):"";
export function DriverKioskHeader({session,offline,onMessages,unread}) {
 const landscape=useDriverLandscape();
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
 const gpsReady=session.vehicle?.current_lat!=null && session.vehicle?.current_lng!=null && now-Date.parse(session.vehicle?.last_location_update||"")<120000;
 if(landscape)return <header className="dl-header"><strong className="dl-brand"><Bus aria-hidden="true"/><span>McSween <span>Transport</span></span></strong><div className="dl-company">{session.company_logo_url&&<img src={session.company_logo_url} alt=""/>}<span>{session.company_name || session.vehicle?.company_name || "Company"}</span><strong>{session.vehicle?.name || "Bus"}</strong></div><div className="dl-header-status"><span className={offline?"dl-offline":""}><i/>{offline?"Offline":"Online"}</span><span><MapPin aria-hidden="true"/>{gpsReady?"GPS ready":"Finding GPS"}</span><RearDashcamIndicator/><time>{time(now)}</time></div></header>;
 return <header className="dk-header"><div className="dk-brand-row"><strong>McSween <span>Transport</span></strong><button aria-label="Open driver messages" onClick={onMessages}><MessageCircle/>{unread&&<span className="dk-unread" aria-label="Unread messages"/>}</button></div><div className="dk-company-row"><span>{session.company_logo_url&&<img src={session.company_logo_url} alt=""/>}{session.company_name || session.vehicle?.company_name || "Company"} · {session.vehicle?.name}</span><RearDashcamIndicator/><span role={offline?"status":undefined}>{offline?"Offline":time(now)}</span></div></header>;
}
function Tool({icon:Icon,title,sub,onClick,badge}) {
 return <button className="dk-tool" onClick={onClick}><Icon aria-hidden="true"/><span><strong>{title}</strong>{sub&&<small>{sub}</small>}</span>{badge&&<span className="dk-unread"/>}<ChevronRight className="dk-chevron"/></button>;
}
export function DriverKioskMore({session,selectTab,onReport,unread,onHelp,onNameSign}) {
 return <div className="dk-content dk-more"><h1>More</h1><Tool icon={User} title={session.driver_name || "Driver & tablet"} sub={session.personal?`${ownDeviceNoun()==="tablet"?"Tablet":"Phone"} settings & pairing`:"Tablet settings & pairing"} onClick={()=>selectTab("settings")}/>
 <h2>Tools</h2><div className="dk-tool-grid">
 <Tool icon={ClipboardCheck} title="Inspection" onClick={()=>selectTab("inspection")}/>
 <Tool icon={Wrench} title="Report fault" onClick={onReport}/>
 <Tool icon={MessageCircle} title="Messages" badge={unread} onClick={()=>selectTab("chat")}/>
 <Tool icon={Clock} title="Jobs & history" onClick={()=>selectTab("trips")}/>
 </div>
 {onNameSign&&<Tool icon={IdCard} title="Name sign" sub="Shows on the boarding tablet" onClick={onNameSign}/>}
 <RearDashcamTool/>
 {session.personal
  ? <Tool icon={ownDeviceNoun()==="tablet"?Tablet:Smartphone} title={`${ownDeviceNoun()==="tablet"?"Tablet":"Phone"} & GPS`} sub="Background GPS, change bus" onClick={()=>selectTab("settings")}/>
  : <Tool icon={Tablet} title="Tablet & reader" sub="Status and settings" onClick={()=>selectTab("settings")}/>}
 <Tool icon={ListOrdered} title="Stops & pickups" onClick={()=>selectTab("stops")}/>
 <Tool icon={FileText} title="Licence & insurance" onClick={()=>selectTab("documents")}/>
 <Tool icon={ShieldCheck} title="Safety standards" onClick={()=>selectTab("safety")}/>
 <Tool icon={LifeBuoy} title="Help & support" onClick={onHelp}/>
 <p className="dk-muted">Driver tablet · Your assigned bus and company</p>
 </div>;
}
export function DriverKioskHistory({session}) {
 const rows=[...(session.check_ins || [])].sort((a,b)=>Date.parse(b.boarded_at||b.created_date||0)-Date.parse(a.boarded_at||a.created_date||0));
 return <section aria-label="Recent boarding history"><h2>Recent boarding history</h2>{rows.length?<ol className="dk-history">{rows.map(r=><li key={r.id}><strong>{r.staff_name || "Passenger"}</strong><small>{r.status==="boarded"?"Boarded":"Exited"} · {time(r.boarded_at || r.created_date)}{r.check_in_method?" · "+r.check_in_method:""}</small></li>)}</ol>:<p className="dk-muted">No recent boarding activity.</p>}</section>;
}
// The driver's marks for a passenger who couldn't tap, or didn't come. Each is
// recorded with the driver's name; got on / got off are flagged for review.
export function DriverKioskPassengers({session,invoke,refresh}) {
 const {toast}=useToast();
 const [query,setQuery]=useState("");
 const [busyRef,setBusyRef]=useState("");
 // A mark just saved shows straight away and stays until the next full
 // update from the server has caught up (about a minute).
 const [rides,setRides]=useState({});
 const staff=(session.staff || []).map(s=>rides[s.id] && rides[s.id].until>Date.now()?{...s,ride:rides[s.id].ride}:s);
 // Keep marks for when the bus is stopped: no list editing while driving.
 const speed=Number(session.vehicle?.speed);
 const moving=Number.isFinite(speed) && speed>8 && session.vehicle?.last_location_update && Date.now()-Date.parse(session.vehicle.last_location_update)<60_000;
 const mark=async(s,kind)=>{
  const name=accountName(s) || "this passenger";
  const m=MARKS[kind];
  if(!invoke || busyRef)return;
  if(m.confirm && !(await confirmAction({title:m.confirm(name),description:markNote(kind),confirmLabel:m.label})))return;
  setBusyRef(s.id);
  try { const res=await invoke("ride_exception",{ref:s.id,kind,driver_name:session.driver_name || ""}); setRides(r=>({...r,[s.id]:{ride:res.ride,until:Date.now()+90_000}})); toast({title:m.done(name)}); refresh?.(); }
  catch(e){ toast({title:"Couldn't save that",description:errorData(e).error || "Check the connection and try again.",variant:"destructive"}); }
  finally{ setBusyRef(""); }
 };
 const counts={waiting:staff.filter(s=>!s.skip_pickup_today && (s.ride?.state || "not_yet")==="not_yet").length,noShow:staff.filter(s=>s.ride?.state==="no_show").length};
 const filtered=useMemo(()=>staff.filter(s=>(accountName(s)+" "+(s.email||"")+" "+(s.pickup_name||"")).toLowerCase().includes(query.toLowerCase())),[staff,query]);
 const recent=[...(session.check_ins || [])].sort((a,b)=>Date.parse(b.boarded_at||b.created_date||0)-Date.parse(a.boarded_at||a.created_date||0));
 const latest=recent[0];
 return <div className="dk-content dk-passengers"><h1>Passengers</h1><p className="dk-muted">{session.trip_direction==="to_home"?"To home":"To work"} · {session.vehicle?.name}</p>
 <div className="dk-counts"><span><Users/><strong>{session.occupancy ?? 0}</strong><small>On board</small></span><span><Users/><strong>{counts.waiting}</strong><small>Still to pick up</small></span>{counts.noShow>0 && <span><Users/><strong>{counts.noShow}</strong><small>Didn't show</small></span>}<span><Users/><strong>{staff.length}</strong><small>Assigned</small></span></div>
 {moving && invoke && <p className="dk-muted" role="status">Stop the bus to mark passengers.</p>}
 <label className="dk-search"><Search/><input aria-label="Search passengers" placeholder="Search passengers" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <section aria-label="Assigned passengers"><h2>Assigned passengers{query?" · "+filtered.length:""}</h2><div className="dk-passenger-list">{filtered.length?filtered.map(s=>{
 const name=accountName(s);
 const dist=s.home_lat!=null && session.vehicle?.current_lat!=null?haversineKm(session.vehicle.current_lat,session.vehicle.current_lng,s.home_lat,s.home_lng)*1000:null;
 const actions=invoke && !s.skip_pickup_today?<span className="flex shrink-0 flex-col gap-1">{marksFor(s.ride?.state).map(k=><Button key={k} size="sm" variant="outline" className="h-11" disabled={moving || !!busyRef} onClick={()=>mark(s,k)} aria-label={`${MARKS[k].label}: ${name}`}>{busyRef===s.id?"Saving…":MARKS[k].label}</Button>)}</span>:null;
 return <div key={s.id} className="dk-passenger-row"><span className="dk-avatar" aria-hidden="true">{name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "P"}</span><StaffRouteListItem s={{...s,dist,isNear:false}} vehicle={session.vehicle} onAttend={()=>{}} actions={actions}/></div>;
 }):<p className="dk-muted">{query?"No passengers match this search.":"No passengers assigned to this route yet."}</p>}</div></section>
 <details className="dk-details"><summary>Recent boarding history<Clock/></summary><div>{recent.length?<ol className="dk-history">{recent.map(r=><li key={r.id}><strong>{r.staff_name || "Passenger"}</strong><small>{r.status==="boarded"?"Boarded":"Exited"} · {time(r.boarded_at || r.created_date)}{r.check_in_method?" · "+r.check_in_method:""}</small></li>)}</ol>:<p>No recent boarding activity.</p>}</div></details>
 {latest&&<section className="dk-latest" aria-label="Latest boarding activity"><strong>{latest.staff_name || "Passenger"} {latest.status==="boarded"?"boarded":"exited"}</strong><small>{time(latest.boarded_at||latest.created_date)}{latest.check_in_method?" · "+latest.check_in_method:""}</small></section>}
 </div>;
}