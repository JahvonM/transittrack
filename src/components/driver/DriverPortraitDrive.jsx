import React, { useMemo } from "react";
import { ArrowRight, Navigation, Users, ChevronRight, MessageCircle, MapPinned } from "lucide-react";
import BusArtwork from "@/components/BusArtwork";
import { Button } from "@/components/ui/button";
import { routeProgress } from "@/components/TripProgress";
import { roadStopsOf, busOnRoad, nextRoadStopIndex } from "@/lib/roadStops";
import { sortStops } from "@/components/passenger/passengerState";
import { StatusStrip } from "./cockpit/CockpitParts";
import SosButton from "./SosButton";

// Presentation only: existing session, shift and tracking handlers own all writes.
export default function DriverPortraitDrive({session,vehicle,nav,sharing,shiftActive,directionControl,shiftControl,trackingButton,
 statusItems,attention,panelTop,panelBottom,onOpenNavigation,onOpenPassengers,onOpenStops,onOpenMessages,onReportIncident,invoke}) {
 const home=session?.trip_direction==="to_home";
 const stops=useMemo(()=>{
  const raw=roadStopsOf(session) || sortStops(session?.route?.stops).filter(s=>s.lat!=null&&s.lng!=null);
  const wp=session?.workplace;
  if(home || wp?.lat==null || wp?.lng==null || raw.some(s=>Math.abs(s.lat-wp.lat)<.00001&&Math.abs(s.lng-wp.lng)<.00001))return raw;
  return [...raw,{...wp,key:"company-destination",fixed:true,riders:[],along:Math.max(0,...raw.map(s=>Number(s.along)||0))+500}];
 },[session?.route,session?.road_stops,session?.workplace,home]);
 const fresh=vehicle?.current_lat!=null && Date.now()-Date.parse(vehicle?.last_location_update || "")<120000;
 const index=useMemo(()=>{
  if(!sharing || !fresh)return 0;
  const roadIndex=nextRoadStopIndex(stops,busOnRoad(session?.route,vehicle.current_lat,vehicle.current_lng));
  return roadIndex ?? routeProgress(stops,vehicle.current_lat,vehicle.current_lng)?.nextIndex ?? 0;
 },[stops,session?.route,vehicle?.current_lat,vehicle?.current_lng,sharing,fresh]);
 const next=nav?.nextStop || stops[index] || null;
 const atWork=home && session?.workplace && !sharing;
 const focus=atWork?session.workplace:next;
 const upcoming=atWork?[session.workplace,...stops.slice(0,2)]:stops.slice(index,index+3);
 const finish=!home?session?.workplace:null;
 const timeline=finish && !upcoming.some(s=>s.name===finish.name)?[...upcoming.slice(0,2),finish]:upcoming;
 const count=focus?.riders?.filter(r=>!session?.staff?.find(s=>s.id===r.ref)?.skip_pickup_today).length;
 return <div className="dk-drive-frame"><div className="dk-drive-scroll">
  <div className="dk-content">
   <header className="dk-page-title"><div><h1>Your journey</h1>{session?.route?.name && <p>{session.route.name}</p>}</div><Button variant="outline" className="dk-change-stop" onClick={onOpenStops}><MapPinned/>Change stop</Button></header>
   {directionControl}
   <button className="dk-next" onClick={onOpenStops} aria-label="View next stop and route">
    <span><small>{atWork?"COMPANY PICKUP":home?"NEXT DROP-OFF":"NEXT PICKUP"}</small><strong>{focus?.name || (stops.length?"Route complete":"No route assigned")}</strong>
     <span>{atWork?"Pick up at work, then take passengers home":count!=null?count+" assigned to this stop":home?"Home drop-off":focus?"View passengers and pickup details":"Ask dispatch to assign a route"}</span>
     {sharing && fresh && nav?.remainingS!=null && <span>{Math.max(1,Math.round(nav.remainingS/60))} min · navigation estimate</span>}
    </span><ArrowRight aria-hidden="true"/>
   </button>
   {timeline.length>0 && <ol className="dk-stop-preview" aria-label="Journey stop preview">
    {timeline.map((s,i)=><li key={s.key || s.name+i}><span className={i===0?"dk-stop-dot next":"dk-stop-dot"}/><span><strong>{s.name}</strong><small>{i===0?(atWork?"Company pickup":home?"Next drop-off":"Next pickup"):s===finish?"Company drop-off":"Upcoming"}</small></span></li>)}
   </ol>}
   <div className="dk-bus-strip"><BusArtwork vehicle={vehicle} fallbackUrl="/images/boarding-coaster.webp" width={170}/><span><strong>{vehicle?.name}</strong><small>{shiftActive?"Shift active":"Off shift"} · {sharing?"Sharing location":"Ready to depart"}</small><small>{session?.occupancy ?? 0} on board{vehicle?.capacity?" · "+vehicle.capacity+" seats":""}</small></span></div>
   {(panelTop || attention.length>0) && <section className="dk-attention" aria-label="Needs attention">{attention}{panelTop}</section>}
   <div className="dk-shortcuts"><Button variant="outline" onClick={onOpenNavigation}><Navigation/>Navigation</Button><Button variant="outline" onClick={onOpenPassengers}><Users/>Passengers</Button></div>
   <details className="dk-details"><summary>Trip details<ChevronRight/></summary><div><StatusStrip items={statusItems}/><Button variant="outline" onClick={onOpenStops}>All stops & pickup tools</Button>{panelBottom}<Button variant="outline" onClick={onReportIncident}>Report an incident</Button></div></details>
  </div></div><div className="dk-fixed-controls"><div className="dk-drive-controls" aria-label="Driving controls">{!shiftActive && shiftControl}{trackingButton}{shiftActive && shiftControl}</div>
   <div className="dk-drive-footer"><Button variant="ghost" onClick={onOpenMessages}><MessageCircle/>Messages</Button><SosButton vehicle={vehicle} invoke={invoke} emergencyContacts={session?.emergency_contacts} compact/></div>
  </div>
 </div>;
}
