import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import BusArtwork from "@/components/BusArtwork";
import { fetchDrivingRoute } from "@/lib/geo";
import { locationIsStale } from "@/lib/busEta";

export default function ReturnPickupCard({ bus, workplace, homeName, onMap, onEditPickup, onChat }) {
 const [now,setNow]=useState(Date.now);
 const [eta,setEta]=useState(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t);},[]);
 const bucket=Math.floor(now/30000);
 const stale=locationIsStale(bus,now);
 const hasPlace=workplace?.lat!=null && workplace?.lng!=null;
 const phase=bus?.return_pickup_state;
 const active=bus?.tracking_active && !stale && bus?.in_service!==false;
 useEffect(()=>{
   let alive=true;setEta(null);
   if(!active || !hasPlace || phase==='arrived' || phase==='departed') {setLoading(false);return;}
   setLoading(true);
   fetchDrivingRoute([{lat:bus.current_lat,lng:bus.current_lng},{lat:Number(workplace.lat),lng:Number(workplace.lng)}])
     .then(r=>{if(alive){setEta(r?.durationMin ?? null);setLoading(false);}})
     .catch(()=>{if(alive)setLoading(false);});
   return()=>{alive=false;};
   // Refresh at most twice a minute while live; never use an old ETA after a state change.
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[bus?.id,active,hasPlace,workplace?.lat,workplace?.lng,bucket,phase]);
 let answer=active && phase==='departed' ? "Bus has left the company" :
   active && phase==='arrived' ? "Your bus is here" :
   !hasPlace ? "Company boarding point not set" :
   bus?.in_service===false ? "Bus out of service" :
   !bus?.tracking_active ? "Not started yet" :
   stale ? "Waiting for a fresh bus location" :
   eta!=null ? "About "+Math.max(1,Math.round(eta))+" min to your company" :
   loading ? "Calculating road ETA…" : "Arrival time unavailable";
 return <section aria-label="Going home pickup" className="mx-6 mb-4 rounded-2xl border border-primary/40 bg-card p-4 lg:mx-0">
   <p className="text-body-sm font-semibold text-primary">Going home</p>
   <h2 className="mt-2 text-title font-bold">{answer}</h2>
   <p className="mt-2 text-body text-muted-foreground">{bus?.name || "Your bus"} · Pickup: {workplace?.name || "Company address"}</p>
   <BusArtwork vehicle={bus} width={280} className="h-40 w-full my-3" />
   <p className="text-body-sm">{active && phase==='departed' ? "If you missed the bus, contact your driver or company." :
     active && phase==='arrived' ? "Please board at the company boarding point." :
     "Meet the bus at your company to travel home."}</p>
   <p className="mt-2 text-body-sm text-muted-foreground">Home stop: {homeName || "Not set"}</p>
   {!hasPlace && <p className="mt-2 text-body-sm text-warning">Ask your company administrator to set its address and map point.</p>}
   <div className="mt-4 flex flex-wrap gap-2">
     <Button onClick={onMap} variant="outline">Show map</Button>
     <Button onClick={onChat} variant="outline">Message driver</Button>
     <Button onClick={onEditPickup} variant="ghost">Edit home spot</Button>
   </div>
 </section>;
}
