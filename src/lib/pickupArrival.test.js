import {it,expect} from "vitest";
import {pickupArrival} from "./pickupArrival";
const now=Date.parse("2026-10-11T22:00:00Z"),pickup={lat:12.01,lng:-61.77};
const bus={tracking_active:true,current_lat:12.01,current_lng:-61.77,speed:0,last_location_update:new Date(now-10000).toISOString()};
it("distinguishes nearby, at stop and stopped arrival",()=>{
 expect(pickupArrival({bus:{...bus,current_lat:12.012},pickup,now,mins:2}).kind).toBe("nearby");
 expect(pickupArrival({bus:{...bus,speed:5},pickup,now}).kind).toBe("at_stop");
 expect(pickupArrival({bus,pickup,now}).kind).toBe("arrived");
 expect(pickupArrival({bus:{...bus,speed:null},pickup,now}).kind).toBe("at_stop");
});
it("a one-minute ETA is never evidence of arrival",()=>{
 expect(pickupArrival({bus:{...bus,current_lat:12.05},pickup,mins:1,now}).kind).toBe("nearby");
});
it("rejects stale, future, invalid and inactive positions",()=>{
 for(const change of [{tracking_active:false},{in_service:false},{last_location_update:new Date(now-130000).toISOString()},{last_location_update:new Date(now+60000).toISOString()},{current_lat:null},{current_lat:100}]){
 expect(pickupArrival({bus:{...bus,...change},pickup,now})).toBeNull();
 }
 expect(pickupArrival({bus,pickup:null,now})).toBeNull();
});
it("uses a fresh driver confirmation and rejects an old one",()=>{
 expect(pickupArrival({bus:{...bus,current_lat:12.05},pickup,now,confirmedArrival:true}).kind).toBe("arrived");
 expect(pickupArrival({bus:{...bus,last_location_update:new Date(now-130000).toISOString()},pickup,now,confirmedArrival:true})).toBeNull();
});
