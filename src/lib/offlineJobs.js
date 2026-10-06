import {isPermanentRejection,review,notifySavedWork} from "./savedWork";
const KEY="tt_offline_jobs";
export const JOBS_EVENT="tt-offline-jobs";
const runners={};
const inFlight=new Set();
let flushing=false,started=false;
function read() {
 try {const items=JSON.parse(localStorage.getItem(KEY)||"[]");if(!Array.isArray(items))throw new Error();return items;}
 catch {throw new Error("Saved work cannot be read. Do not clear tablet storage.");}
}
function write(jobs) {
 try {localStorage.setItem(KEY,JSON.stringify(jobs));}catch {return false;}
 notifySavedWork();try {window.dispatchEvent(new Event(JOBS_EVENT));}catch { /* tests */ }return true;
}
function mustWrite(jobs) {if(!write(jobs))throw new Error("Saved work could not be updated; keep this device's storage.");}
export function isOfflineError(error) {return (typeof navigator!=="undefined"&&navigator.onLine===false)||!error?.response||[401,429].includes(error.response.status)||error.response.status>=500;}
export function registerRunner(kind,fn){runners[kind]=fn;}
export function bindDriverPayload(payload) {
 // A corrupt or unreadable session cache must never stop offline work from
 // being saved — fall back to the unbound payload instead of throwing.
 let cache=null;
 try {cache=JSON.parse(localStorage.getItem("tt_driver_session_cache")||"null");} catch {cache=null;}
 const vehicle=cache?.session?.vehicle;
 return vehicle&&cache.device_id===payload.device_id?{...payload,expected_device_id:payload.expected_device_id||payload.device_id,expected_company_id:payload.expected_company_id||vehicle.company_id,expected_vehicle_id:payload.expected_vehicle_id||vehicle.id}:payload;
}
export function enqueueJob(kind,payload,label) {
 const jobs=read();
 if(kind.startsWith("driver_"))payload=bindDriverPayload(payload);
 const id=payload.client_request_id||crypto.randomUUID();
 if(jobs.some(job=>job.kind===kind&&job.payload.client_request_id===id))return true;
 jobs.push({id:"job-"+crypto.randomUUID(),kind,payload:{...payload,client_request_id:id},label:label||kind,queued_at:new Date().toISOString()});
 return write(jobs);
}
export function pendingJobs(){return read().filter(job=>job.state!=="archived");}
export function completeJob(requestId){mustWrite(read().filter(job=>job.payload.client_request_id!==requestId));}
export function quarantineJob(requestId,error){mustWrite(read().map(job=>job.payload.client_request_id===requestId?review(job,error):job));}
export async function submitSavedJob(kind,payload,label,runner) {
 payload={...payload,client_request_id:payload.client_request_id||crypto.randomUUID()};
 if(kind.startsWith("driver_"))payload=bindDriverPayload(payload);
 if(!enqueueJob(kind,payload,label))throw new Error("Work could not be saved on this device. Keep this screen open.");
 const id=payload.client_request_id;
 inFlight.add(id);
 const save=next=>mustWrite(read().map(job=>job.payload.client_request_id===id?{...job,payload:{...next,client_request_id:id}}:job));
 try {const result=await runner(payload,save);completeJob(id);return result;}
 catch(error){if(isPermanentRejection(error))quarantineJob(id,error);throw error;}
 finally{inFlight.delete(id);}
}
const scope=job=>job.payload.expected_vehicle_id||job.payload.vehicle_id||job.payload.device_id||job.kind;
export async function flushJobs() {
 if(flushing||(typeof navigator!=="undefined"&&navigator.onLine===false))return 0;
 flushing=true;let synced=0;
 try {
  const jobs=read(),blocked=new Set(jobs.filter(job=>job.state==="needs_review").map(scope));
  for(const job of jobs) {
   const runner=runners[job.kind],id=job.payload.client_request_id;
   if(!runner||job.state||blocked.has(scope(job))||inFlight.has(id))continue;
   const save=payload=>mustWrite(read().map(saved=>saved.id===job.id?{...saved,payload}:saved));
   try {
    inFlight.add(id);await runner(job.payload,save);
    mustWrite(read().filter(saved=>saved.id!==job.id));synced++;
   } catch(error) {
    if(isPermanentRejection(error)){mustWrite(read().map(saved=>saved.id===job.id?review(saved,error):saved));blocked.add(scope(job));continue;}
    mustWrite(read().map(saved=>saved.id===job.id?{...saved,last_error:error?.response?.status?"Server returned "+error.response.status:"Connection unavailable",failed_at:new Date().toISOString()}:saved));break;
   } finally{inFlight.delete(id);}
  }
 } finally{flushing=false;}
 return synced;
}
export function startOfflineSync() {
 if(started||typeof window==="undefined")return;started=true;
 const run=()=>flushJobs().catch(()=>notifySavedWork());
 window.addEventListener("online",run);setInterval(run,60000);setTimeout(run,3000);
}