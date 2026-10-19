import React from "react";
import { Navigation, MapPin, MapPinned, Users, ChevronRight, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import SosButton from "./SosButton";
import { StatusStrip } from "./cockpit/CockpitParts";

export default function DriverLandscapeDrive({session,vehicle,focus,count,stops,stopIndex,map,stopChooser,home,atWork,target,
 sharing,shiftActive,directionControl,shiftControl,trackingButton,statusItems,attention,panelTop,panelBottom,
 onNavigate,onChangeStop,onOpenPassengers,onOpenStops,onReportIncident,invoke}) {
 const capacity=Number(vehicle?.capacity)||0;
 return <div className="dl-journey" data-testid="landscape-journey">
  <h1 className="sr-only">Your journey</h1>
  <div className="dl-map-stage">
   {map}
   <div className="dl-route-label"><Route aria-hidden="true"/><div><strong>{session?.route?.name || "Route overview"}</strong><span>{home ? (session?.workplace?.name || "Company")+" → home" : "Pickup stops → "+(session?.workplace?.name || session?.company_name || "company")}</span></div></div>
   <button className="dl-map-caption" onClick={onOpenStops}><Navigation aria-hidden="true"/><span><strong>Route overview</strong><small>Tap a stop to select</small></span><ChevronRight aria-hidden="true"/></button>
    <details className="dl-details"><summary>Trip details & GPS<ChevronRight/></summary><div><StatusStrip items={statusItems}/>{panelBottom}<Button variant="outline" onClick={onReportIncident}>Report an incident</Button></div></details>
  </div>
  <aside className="dl-trip-panel" aria-label="Journey controls">
   <div className="dl-panel-scroll">
    {directionControl}
    <section className="dl-next" aria-label="Next stop">
     <div className="dl-next-label"><small>{atWork&&!target?"COMPANY PICKUP":home?"NEXT DROP-OFF":"NEXT PICKUP"}</small><MapPin aria-hidden="true"/></div>
     <h2>{focus?.name || (stops.length?"Route complete":"No route assigned")}</h2>
     <p className="dl-next-description">{focus ? target ? "Selected next stop" : "Your next scheduled stop" : "Ask dispatch to assign a route"}</p>
     <p className="dl-stop-riders"><Users aria-hidden="true"/>{count!=null ? count+" passenger"+(count===1?"":"s")+" at this stop" : "Pickup count unavailable"}</p>
     <p className="dl-stop-progress">{stopIndex>=0 ? "Stop "+(stopIndex+1)+" of "+stops.length : target ? "Custom destination" : stops.length ? "All route stops complete" : "No stops assigned"}</p>
     <div className="dl-next-actions"><Button onClick={onNavigate} disabled={!focus}><Navigation/>Navigate</Button><Button variant="outline" onClick={onChangeStop}><MapPinned/>Change stop</Button></div>
    </section>
    <div className="dl-stats" aria-label="Journey summary">
     <button onClick={onOpenPassengers}><Users aria-hidden="true"/><span><strong>{session?.occupancy ?? 0}{capacity>0&&<small> / {capacity}</small>}</strong><span>On board</span></span></button>
     <button onClick={onOpenStops}><MapPinned aria-hidden="true"/><span><strong>{stops.length}</strong><span>Assigned stops</span></span></button>
    </div>
    <div className="dl-trip-status"><span><i className={shiftActive?"is-active":""}/>{shiftActive?"Shift active":"Off shift"}</span><span><MapPin aria-hidden="true"/>{sharing?"Location sharing on":"Location sharing off"}</span></div>
    {(attention.length>0 || panelTop) && <section className="dk-attention" aria-label="Needs attention">{attention}{panelTop}</section>}

   </div>
   <div className="dl-control-dock"><div className="dl-trip-actions" aria-label="Driving controls">{!shiftActive&&shiftControl}{trackingButton}{shiftActive&&shiftControl}</div><SosButton vehicle={vehicle} invoke={invoke} emergencyContacts={session?.emergency_contacts} compact/></div>
  </aside>
  {stopChooser}
 </div>;
}
