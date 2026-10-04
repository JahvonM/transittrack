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
 catch(error) {if(isPermanentRejection(error))quarantineCheckIn(payload.client_request_id,error);throw error;}
 finally {inFlight.delete(payload.client_request_id);}
}
const scope=item=>[item.payload.expected_vehicle_id||"",item.payload.staff_id||item.payload.staff_name||item.id].join(":");
let flushing=false;
export async function flushQueue(invoke) {
 if(flushing)return 0;
 flushing=true;let synced=0;
 try {
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
