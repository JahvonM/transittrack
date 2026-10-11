import {isPermanentRejection,review,notifySavedWork} from "./savedWork";
const STORAGE_KEY="tt_offline_checkins";
function readQueue() {
 try { const items=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");if(!Array.isArray(items))throw new Error();return items; }
 catch { throw new Error("Saved check-ins cannot be read. Do not clear tablet storage."); }
}
function writeQueue(items) {
 try {localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}catch {throw new Error("Tablet storage is full or unavailable; check-in was not saved.");}
 notifySavedWork();
}
export function enqueueCheckIn(payload) {
 const queue=readQueue(),now=new Date().toISOString(),requestId=payload.client_request_id||crypto.randomUUID();
 if(!queue.some(item=>item.payload.client_request_id===requestId)) {
  queue.push({id:"local-"+crypto.randomUUID(),payload:{...payload,client_request_id:requestId,occurred_at:payload.occurred_at||now},queued_at:now});writeQueue(queue);
 }
 return queue.length;
}
export function hasSavedCheckIn(requestId) {return readQueue().some(item=>item.payload.client_request_id===requestId);}
export function acknowledgeCheckIn(requestId) {writeQueue(readQueue().filter(item=>item.payload.client_request_id!==requestId));}
export function quarantineCheckIn(requestId,error) {writeQueue(readQueue().map(item=>item.payload.client_request_id===requestId?review(item,error):item));}
export function queueSyncError() {return readQueue().find(item=>item.state!=="archived"&&item.last_error)?.last_error||"";}
export function queueLength() {return readQueue().filter(item=>item.state!=="archived").length;}
export function isNetworkFailure(error) {return !error?.response||error.response.status===429||error.response.status>=500;}
const inFlight=new Set();
export async function submitSavedCheckIn(invoke,payload) {
 payload={...payload,client_request_id:payload.client_request_id||crypto.randomUUID()};
 enqueueCheckIn(payload);
 inFlight.add(payload.client_request_id);
 try {const result=await invoke("check_in",payload);acknowledgeCheckIn(payload.client_request_id);return result;}
 catch(error) {
  // A refusal answered while the passenger stands at the tablet is shown on
  // screen and nobody boarded, so there is nothing to review later. Keeping it
  // only put up a "needs review" notice nobody at a tablet can clear, and held
  // back that passenger's later saved check-ins. Refusals of check-ins saved
  // offline (replayed by flushQueue) still stay for review.
  if(isPermanentRejection(error))acknowledgeCheckIn(payload.client_request_id);
  throw error;
 }
 finally {inFlight.delete(payload.client_request_id);}
}
// Older versions kept live refusals for review too: refused within seconds of
// being saved, while the person was still at the tablet. Cleared once; this
// version never keeps new ones, so later refusals are never touched.
const LIVE_REFUSAL_MS=10000,LIVE_REFUSALS_CLEARED="tt_live_refusals_cleared";
export function isLiveRefusal(item) {
 if(item?.state!=="needs_review")return false;
 const gap=Date.parse(item.failed_at)-Date.parse(item.queued_at);
 return Number.isFinite(gap)&&gap>=0&&gap<LIVE_REFUSAL_MS;
}
export function clearLiveRefusals() {
 try {if(localStorage.getItem(LIVE_REFUSALS_CLEARED))return 0;} catch {return 0;}
 const queue=readQueue(),kept=queue.filter(item=>!isLiveRefusal(item));
 if(kept.length!==queue.length)writeQueue(kept);
 try {localStorage.setItem(LIVE_REFUSALS_CLEARED,new Date().toISOString());} catch { /* tried again next time */ }
 return queue.length-kept.length;
}
const scope=item=>[item.payload.expected_vehicle_id||"",item.payload.staff_id||item.payload.staff_name||item.id].join(":");
let flushing=false;
export async function flushQueue(invoke) {
 if(flushing)return 0;
 flushing=true;let synced=0;
 try {
  clearLiveRefusals();
  const queue=readQueue();
  let migrated=false;
  for(const item of queue)if(!item.payload.client_request_id){item.payload.client_request_id=crypto.randomUUID();migrated=true;}
  if(migrated)writeQueue(queue);
  const blocked=new Set(queue.filter(item=>item.state==="needs_review").map(scope));
  for(const item of queue) {
   if(item.state||blocked.has(scope(item))||inFlight.has(item.payload.client_request_id))continue;
   try {
    inFlight.add(item.payload.client_request_id);
    await invoke("check_in",{...item.payload,queue_replay:true});acknowledgeCheckIn(item.payload.client_request_id);synced++;
   } catch(error) {
    if(isPermanentRejection(error)){quarantineCheckIn(item.payload.client_request_id,error);blocked.add(scope(item));continue;}
    break; // Global auth/network/throttling/server failures wait for recovery.
   } finally {inFlight.delete(item.payload.client_request_id);}
  }
 } finally {flushing=false;}
 return synced;
}
