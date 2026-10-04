export const SAVED_WORK_EVENT="tt-saved-work";
export const SAVED_KEYS=["tt_offline_checkins","tt_offline_jobs","tt_gps_queue"];
export function notifySavedWork() { try { window.dispatchEvent(new Event(SAVED_WORK_EVENT)); } catch { /* tests/non-browser */ } }
export function isPermanentRejection(error) { return [400,403,404,409,410,413,422].includes(error?.response?.status); }
export function failureReason(error) { return error?.response?.data?.error || (error?.response?.status ? "Server returned "+error.response.status : error?.message || "Connection unavailable"); }
export function review(item,error) { return {...item,state:"needs_review",last_error:failureReason(error),failed_at:new Date().toISOString()}; }
export function readSaved(key) {
 try { const items=JSON.parse(localStorage.getItem(key)||"[]");if(!Array.isArray(items))throw new Error();return items; }
 catch { throw new Error("Saved work cannot be read. Do not clear tablet storage."); }
}
export function writeSaved(key,items) { localStorage.setItem(key,JSON.stringify(items));notifySavedWork(); }
export function savedWork() { return SAVED_KEYS.flatMap(key=>readSaved(key).map(item=>({...item,storage_key:key}))); }
const privateFields=new Set(["device_token","driver_grant","verification_grant","token","token_hash","pin","driver_pin","pin_hash","salt","password","card_uid","card_tag","nfc_card_tag","nfc_tag_id","access_code","one_time_code"]);
export function exportSavedWork() {
 const scrub=value=>Array.isArray(value)?value.map(scrub):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([key])=>!privateFields.has(key)).map(([key,item])=>[key,scrub(item)])):value;
 return JSON.stringify({exported_at:new Date().toISOString(),items:scrub(savedWork())},null,2);
}
export function retryReviewedWork() {
 // Retry unchanged originals; never move old work to a new assignment or refresh credentials.
 for(const key of SAVED_KEYS)writeSaved(key,readSaved(key).map(({state,last_error,failed_at,...item})=>state==="needs_review"?item:{...item,...(state?{state}:{}),...(last_error?{last_error}:{}),...(failed_at?{failed_at}:{})}));
}

export function archiveReviewedWork() {
 for(const key of SAVED_KEYS)writeSaved(key,readSaved(key).map(item=>item.state==="needs_review"?{...item,state:"archived",archived_at:new Date().toISOString()}:item));
}

export function removeArchivedWork() {
 for(const key of SAVED_KEYS)writeSaved(key,readSaved(key).filter(item=>item.state!=="archived"));
}
