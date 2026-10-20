const KEY="tt_passenger_display_snapshot_v1";
const pick=(row,fields)=>row?Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])):null;
export function savePassengerSnapshot(userId,company,myBus,result) {
 if(!userId || !company?.id)return null;
 const savedAt=new Date().toISOString();
 const snapshot={userId,savedAt,company:pick(company,["id","name","phone","logo_url"]),myBus:pick(myBus,["id","name"]),
  result:{workplace:pick(result.workplace,["id","name","lat","lng","company_id"]),
   vehicles:(result.vehicles || []).map(v=>pick(v,["id","name","company_id","company_name","route_id","current_lat","current_lng","speed","heading","status","image_url","tracking_active","last_location_update","trip_direction","return_pickup_state","in_service"])),
   routes:(result.routes || []).map(r=>({...pick(r,["id","name","company_id","path","path_via"]),stops:(r.stops || []).map(s=>pick(s,["name","lat","lng","order"]))})),
   trips:(result.trips || []).map(t=>pick(t,["id","company_id","vehicle_id","vehicle_name","route_name","pickup_name","dropoff_name","scheduled_time","status"]))}};
 try{localStorage.setItem(KEY,JSON.stringify(snapshot));}catch{/* The current screen still holds its data. */}
 return savedAt;
}
export function loadPassengerSnapshot(userId,companyId) {
 try {
  const value=JSON.parse(localStorage.getItem(KEY) || "null");
  if(!value || value.userId!==userId || !userId || (companyId && value.company?.id!==companyId))return null;
  if(Date.now()-Date.parse(value.savedAt)>24*3600000 || !Number.isFinite(Date.parse(value.savedAt)))return null;
  return value;
 }catch{return null;}
}
// Just the company from the last saved home, kept longer than the home itself:
// enough to start loading the buses while the company is being re-checked,
// instead of one after the other.
export function loadSavedCompany(userId) {
 try {
  const value=JSON.parse(localStorage.getItem(KEY) || "null");
  if(!value || !userId || value.userId!==userId || !value.company?.id)return null;
  const age=Date.now()-Date.parse(value.savedAt);
  if(!Number.isFinite(age) || age>30*24*3600000)return null;
  return value.company;
 }catch{return null;}
}
export function clearPassengerSnapshot(){try{localStorage.removeItem(KEY);}catch{/* storage unavailable */}}
