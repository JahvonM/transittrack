import React, { useMemo, useState, useEffect } from "react";
import { Navigation, Users, ChevronRight, MessageCircle, MapPinned } from "lucide-react";
import LiteMap from "@/components/LiteMap";
import { getNavTarget, setNavTarget, onNavTarget } from "@/lib/navTarget";
import { Button } from "@/components/ui/button";
import { routeProgress } from "@/components/TripProgress";
import { roadStopsOf, busOnRoad, nextRoadStopIndex } from "@/lib/roadStops";
import { sortStops } from "@/components/passenger/passengerState";
import { StatusStrip } from "./cockpit/CockpitParts";
import SosButton from "./SosButton";

// Presentation only: existing session, shift and tracking handlers own all writes.
export default function DriverPortraitDrive({session,vehicle,nav,sharing,shiftActive,directionControl,shiftControl,trackingButton,
 statusItems,attention,panelTop,panelBottom,onOpenNavigation,onOpenPassengers,onOpenStops,onOpenMessages,onReportIncident,invoke}) {
 const [pickedStop,setPickedStop]=useState(null);
 const [choosing,setChoosing]=useState(false);
 const [target,setTarget]=useState(getNavTarget);
 useEffect(()=>onNavTarget(setTarget),[]);
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
 const focus=target || (atWork?session.workplace:next);
 const count=focus?.riders?.filter(r=>!session?.staff?.find(s=>s.id===r.ref)?.skip_pickup_today).length;
 return <div className="dk-drive-frame"><div className="dk-drive-scroll">
  <div className="dk-content">
   <h1 className="sr-only">Your journey</h1>
   {directionControl}
   <section className="dk-simple-next" aria-label="Next stop">
    <small>{atWork && !target?"COMPANY PICKUP":home?"NEXT DROP-OFF":"NEXT PICKUP"}</small>
    <h2>{focus?.name || (stops.length?"Route complete":"No route assigned")}</h2>
    <p>{sharing && fresh && nav?.remainingS!=null ? Math.max(1,Math.round(nav.remainingS/60))+" min away" : target?"Selected next stop":count!=null?count+" assigned to this stop":focus?"Ready to navigate":"Ask dispatch to assign a route"}</p>
    <div className="dk-next-actions"><Button onClick={()=>{if(focus)setNavTarget(focus);onOpenNavigation();}} disabled={!focus}><Navigation/>Navigate</Button><Button variant="outline" onClick={()=>{setPickedStop(null);setChoosing(true);}}><MapPinned/>Change stop</Button></div>
   </section>
   <section className="dk-overview-map" aria-label="Route overview">
    <LiteMap vehicles={vehicle?.current_lat!=null?[vehicle]:[]} stops={stops} road={session?.route?.path?.map(p=>[p.lng,p.lat])} height="100%" fill onStopClick={stop=>{setPickedStop(stop);setChoosing(true);}}/>
    <span className="dk-map-hint">Tap a stop to choose it</span>
   </section>
   <p className="dk-simple-shift">{shiftActive?"Shift active":"Off shift"} · {vehicle?.name}{sharing?" · Sharing location":""}</p>
   {(panelTop || attention.length>0) && <section className="dk-attention" aria-label="Needs attention">{attention}{panelTop}</section>}

   <details className="dk-details"><summary>Trip details<ChevronRight/></summary><div><p>{session?.occupancy ?? 0} on board{vehicle?.capacity?" · "+vehicle.capacity+" seats":""}</p><Button variant="outline" onClick={onOpenPassengers}><Users/>Passengers</Button><StatusStrip items={statusItems}/><Button variant="outline" onClick={onOpenStops}>All stops & pickup tools</Button>{panelBottom}<Button variant="outline" onClick={onReportIncident}>Report an incident</Button></div></details>
  </div></div><div className="dk-fixed-controls"><div className="dk-drive-controls" aria-label="Driving controls">{!shiftActive && shiftControl}{trackingButton}{shiftActive && shiftControl}</div>
   <div className="dk-drive-footer"><Button variant="ghost" onClick={onOpenMessages}><MessageCircle/>Messages</Button><SosButton vehicle={vehicle} invoke={invoke} emergencyContacts={session?.emergency_contacts} compact/></div>
  </div>
 {choosing && <div className="dk-stop-sheet-backdrop" onClick={()=>setChoosing(false)}><section className="dk-stop-sheet" role="dialog" aria-modal="true" aria-label="Choose next stop" onClick={e=>e.stopPropagation()}>
  <h2>{pickedStop?.name || "Change stop"}</h2>
  {pickedStop ? <><p>Choose your next stop</p><Button onClick={()=>{setNavTarget(pickedStop);setChoosing(false);}}>Make this my next stop</Button><Button variant="outline" onClick={()=>{setNavTarget(pickedStop);setChoosing(false);onOpenNavigation();}}><Navigation/>Navigate here</Button></> : <div className="dk-stop-options">{stops.length?stops.map((stop,i)=><Button key={stop.key || i} variant="outline" onClick={()=>setPickedStop(stop)}>{stop.name || "Stop "+(i+1)}</Button>):<p>No stops assigned to this bus.</p>}<Button variant="outline" onClick={()=>{setChoosing(false);onOpenStops();}}>All stops & pickup tools</Button></div>}
  <Button variant="ghost" onClick={()=>setChoosing(false)}>Cancel</Button>
 </section></div>}
 </div>;
}
