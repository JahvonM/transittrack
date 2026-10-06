import {submitSavedJob,isOfflineError,bindDriverPayload} from "@/lib/offlineJobs";
import {patchDriverSession} from "@/hooks/useDriverSession";
export async function shiftAction(invoke,action,selectedShift) {
 const device_id=localStorage.getItem("tt_driver_device_id");
 // A corrupt or unreadable session cache must not block starting/ending a shift.
 let cache=null;
 try {cache=JSON.parse(localStorage.getItem("tt_driver_session_cache")||"null");} catch {cache=null;}
 const current=selectedShift||cache?.session?.open_shift;
 const client_request_id=crypto.randomUUID(),occurred_at=new Date().toISOString();
 const payload=bindDriverPayload({device_id,action,occurred_at,client_request_id,
  ...(action==="end_shift"&&current ? current.id?.startsWith("local-") ? {start_request_id:current.client_request_id} : {shift_id:current.id} : {})});
 if(!device_id)throw new Error("Pair this driver tablet first.");
 if(action==="end_shift"&&!payload.shift_id&&!payload.start_request_id)throw new Error("Refresh the current shift before ending it.");
 try {
  const result=await submitSavedJob("driver_shift",payload,action==="start_shift"?"Start shift":"End shift",p=>invoke(action,p));
  return {...result,queued:false};
 } catch(error) {
  if(!isOfflineError(error))throw error;
  // Storage failure never pretends the action was saved.
  const {pendingJobs}=await import("@/lib/offlineJobs");
  if(!pendingJobs().some(job=>job.payload.client_request_id===client_request_id))throw error;
  const shift=action==="start_shift"?{id:"local-"+client_request_id,client_request_id,started_at:occurred_at,offline:true}:null;
  patchDriverSession({open_shift:shift});return {shift,queued:true};
 }
}