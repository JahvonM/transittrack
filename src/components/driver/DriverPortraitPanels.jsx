import React, { useState, useMemo, useEffect } from "react";
import useDriverLandscape from "@/hooks/useDriverLandscape";
import { Bus, MapPin, ClipboardCheck, Wrench, MessageCircle, FileText, Tablet, ChevronRight, LifeBuoy, ListOrdered, ShieldCheck, User, Clock, Users, Search, IdCard } from "lucide-react";
import { accountName } from "@/lib/userName";
import StaffRouteListItem from "./StaffRouteListItem";
import { haversineKm } from "@/lib/geo";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
const time=value=>value?new Date(value).toLocaleTimeString([], {timeZone:TRANSIT_TIME_ZONE,hour:"numeric",minute:"2-digit"}):"";
export function DriverKioskHeader({session,offline,onMessages,unread}) {
 const landscape=useDriverLandscape();
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
 const gpsReady=session.vehicle?.current_lat!=null && session.vehicle?.current_lng!=null && now-Date.parse(session.vehicle?.last_location_update||"")<120000;
 if(landscape)return <header className="dl-header"><strong className="dl-brand"><Bus aria-hidden="true"/><span>Transit<span>Track</span></span></strong><div className="dl-company">{session.company_logo_url&&<img src={session.company_logo_url} alt=""/>}<span>{session.company_name || session.vehicle?.company_name || "Company"}</span><strong>{session.vehicle?.name || "Bus"}</strong></div><div className="dl-header-status"><span className={offline?"dl-offline":""}><i/>{offline?"Offline":"Online"}</span><span><MapPin aria-hidden="true"/>{gpsReady?"GPS ready":"Finding GPS"}</span><time>{time(now)}</time></div></header>;
 return <header className="dk-header"><div className="dk-brand-row"><strong>Transit<span>Track</span></strong><button aria-label="Open driver messages" onClick={onMessages}><MessageCircle/>{unread&&<span className="dk-unread" aria-label="Unread messages"/>}</button></div><div className="dk-company-row"><span>{session.company_logo_url&&<img src={session.company_logo_url} alt=""/>}{session.company_name || session.vehicle?.company_name || "Company"} · {session.vehicle?.name}</span><span role={offline?"status":undefined}>{offline?"Offline":time(now)}</span></div></header>;
}
function Tool({icon:Icon,title,sub,onClick,badge}) {
 return <button className="dk-tool" onClick={onClick}><Icon aria-hidden="true"/><span><strong>{title}</strong>{sub&&<small>{sub}</small>}</span>{badge&&<span className="dk-unread"/>}<ChevronRight className="dk-chevron"/></button>;
}
export function DriverKioskMore({session,selectTab,onReport,unread,onHelp,onNameSign}) {
 return <div className="dk-content dk-more"><h1>More</h1><Tool icon={User} title={session.driver_name || "Driver & tablet"} sub="Tablet settings & pairing" onClick={()=>selectTab("settings")}/>
 <h2>Tools</h2><div className="dk-tool-grid">
 <Tool icon={ClipboardCheck} title="Inspection" onClick={()=>selectTab("inspection")}/>
 <Tool icon={Wrench} title="Report fault" onClick={onReport}/>
 <Tool icon={MessageCircle} title="Messages" badge={unread} onClick={()=>selectTab("chat")}/>
 <Tool icon={Clock} title="Jobs & history" onClick={()=>selectTab("trips")}/>
 </div>
 {onNameSign&&<Tool icon={IdCard} title="Name sign" sub="Company logo and a guest's name, full screen" onClick={onNameSign}/>}
 <Tool icon={Tablet} title="Tablet & reader" sub="Status and settings" onClick={()=>selectTab("settings")}/>
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
export function DriverKioskPassengers({session}) {
 const [query,setQuery]=useState("");
 const staff=session.staff || [];
 const filtered=useMemo(()=>staff.filter(s=>(accountName(s)+" "+(s.email||"")+" "+(s.pickup_name||"")).toLowerCase().includes(query.toLowerCase())),[staff,query]);
 const recent=[...(session.check_ins || [])].sort((a,b)=>Date.parse(b.boarded_at||b.created_date||0)-Date.parse(a.boarded_at||a.created_date||0));
 const latest=recent[0];
 return <div className="dk-content dk-passengers"><h1>Passengers</h1><p className="dk-muted">{session.trip_direction==="to_home"?"To home":"To work"} · {session.vehicle?.name}</p>
 <div className="dk-counts"><span><Users/><strong>{session.occupancy ?? 0}</strong><small>on board</small></span><span><Users/><strong>{staff.length}</strong><small>assigned</small></span></div>
 <label className="dk-search"><Search/><input aria-label="Search passengers" placeholder="Search passengers" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <section aria-label="Assigned passengers"><h2>Assigned passengers{query?" · "+filtered.length:""}</h2><div className="dk-passenger-list">{filtered.length?filtered.map(s=>{
 const name=accountName(s);
 const dist=s.home_lat!=null && session.vehicle?.current_lat!=null?haversineKm(session.vehicle.current_lat,session.vehicle.current_lng,s.home_lat,s.home_lng)*1000:null;
 return <div key={s.id} className="dk-passenger-row"><span className="dk-avatar" aria-hidden="true">{name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "P"}</span><StaffRouteListItem s={{...s,dist,isNear:false}} vehicle={session.vehicle} onAttend={()=>{}}/></div>;
 }):<p className="dk-muted">{query?"No passengers match this search.":"No passengers assigned to this route yet."}</p>}</div></section>
 <details className="dk-details"><summary>Recent boarding history<Clock/></summary><div>{recent.length?<ol className="dk-history">{recent.map(r=><li key={r.id}><strong>{r.staff_name || "Passenger"}</strong><small>{r.status==="boarded"?"Boarded":"Exited"} · {time(r.boarded_at || r.created_date)}{r.check_in_method?" · "+r.check_in_method:""}</small></li>)}</ol>:<p>No recent boarding activity.</p>}</div></details>
 {latest&&<section className="dk-latest" aria-label="Latest boarding activity"><strong>{latest.staff_name || "Passenger"} {latest.status==="boarded"?"boarded":"exited"}</strong><small>{time(latest.boarded_at||latest.created_date)}{latest.check_in_method?" · "+latest.check_in_method:""}</small></section>}
 </div>;
}
