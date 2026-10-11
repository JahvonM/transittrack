import { locationIsStale } from "./busEta";
import { haversineKm } from "./geo";
// These labels describe the assigned bus's fresh location, not a scheduled ETA.
// Being one minute away alone never means the bus has arrived.
export function pickupArrival({bus,pickup,mins,now=Date.now(),confirmedArrival=false}) {
 if(!bus?.tracking_active || bus.in_service===false || locationIsStale(bus,now))return null;
 if(confirmedArrival)return {kind:"arrived",label:"Bus arrived",detail:"At your pickup stop · Ready to board"};
 const coordinates=[bus.current_lat,bus.current_lng,pickup?.lat,pickup?.lng];
 if(coordinates.some(x=>x==null || !Number.isFinite(Number(x))))return null;
 const [lat,lng,toLat,toLng]=coordinates.map(Number);
 if(Math.abs(lat)>90 || Math.abs(toLat)>90 || Math.abs(lng)>180 || Math.abs(toLng)>180)return null;
 const distance=haversineKm(lat,lng,toLat,toLng)*1000;
 if(distance<=60) {
  const stopped=bus.speed!=null && Number.isFinite(Number(bus.speed)) && Number(bus.speed)>=0 && Number(bus.speed)<=0.5;
  return stopped?{kind:"arrived",label:"Bus arrived",detail:"At your pickup stop · Ready to board"}:
   {kind:"at_stop",label:"Bus at your stop",detail:"Meet the bus at your pickup point"};
 }
 if(distance<=500 || (Number.isFinite(mins) && mins<=3 && mins>=0))return {kind:"nearby",label:"Bus close to your stop",detail:"Get ready · Head to your pickup point"};
 return {kind:"on_way",label:"Bus on the way",detail:null};
}
