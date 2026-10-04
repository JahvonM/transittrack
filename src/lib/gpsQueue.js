import {isPermanentRejection,review,notifySavedWork} from "./savedWork";
const KEY="tt_gps_queue",EVENT="tt-gps-queue",MAX_POINTS=2000,MIN_GAP_MS=15000,BATCH=200;
function read() {
 try {const points=JSON.parse(localStorage.getItem(KEY)||"[]");if(!Array.isArray(points))throw new Error();return points;}
 catch {throw new Error("Saved GPS history cannot be read. Do not clear tablet storage.");}
}
function write(points) {
 try {localStorage.setItem(KEY,JSON.stringify(points));}catch {throw new Error("GPS history could not be saved on this tablet");}
 notifySavedWork();try {window.dispatchEvent(new Event(EVENT));}catch { /* tests */ }
}
function thin(points) {
 const active=points.filter(p=>!p.state),paused=points.filter(p=>p.state);
 if(active.length<=MAX_POINTS)return points;
 const half=Math.floor(active.length/2);
 // Retained failures are never thinned/discarded.
 return [...paused,...active.slice(0,half).filter((_,i)=>i%2===0),...active.slice(half)];
}
const round=(n,d)=>typeof n==="number"&&Number.isFinite(n)?Number(n.toFixed(d)):null;
export function queueGpsPoint({lat,lng,speed,heading,accuracy,t,binding}) {
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return false;
 const time=t?new Date(t):new Date();
 if(!Number.isFinite(time.getTime())||time.getTime()>Date.now()+60000||time.getTime()<Date.now()-72*3600000)return false;
 const points=read(),last=points.filter(p=>!p.state).at(-1);
 if(last&&time-new Date(last.t)<MIN_GAP_MS)return false;
 points.push({queue_id:crypto.randomUUID(),...(binding||{}),t:time.toISOString(),lat:round(lat,6),lng:round(lng,6),speed:round(speed,2),heading:round(heading,1),accuracy:round(accuracy,1)});
 write(thin(points));return true;
}
export function queuedGpsCount(){return read().filter(p=>p.state!=="archived").length;}
export const GPS_QUEUE_EVENT=EVENT;
let flushing=false,syncError="";
export function gpsSyncError(){return syncError;}
export async function flushGpsQueue(invoke) {
 if(flushing||!invoke||(typeof navigator!=="undefined"&&navigator.onLine===false))return 0;
 flushing=true;let sent=0;
 const mark=(points,error)=>{const ids=new Set(points.map(p=>p.queue_id));write(read().map(p=>ids.has(p.queue_id)?review(p,error):p));syncError="Saved GPS needs review; export it from Saved work.";};
 const upload=async batch=>{
  try {await invoke("upload_track",{points:batch,queue_replay:true});}
  catch(error) {
   if(!isPermanentRejection(error))throw error;
   if(batch.length===1){mark(batch,error);return;}
   const middle=Math.floor(batch.length/2);
   await upload(batch.slice(0,middle));await upload(batch.slice(middle));return;
  }
  const ids=new Set(batch.map(p=>p.queue_id));write(read().filter(p=>!ids.has(p.queue_id)));sent+=batch.length;
 };
 try {
  const points=read();let migrated=false;
  for(const point of points)if(!point.queue_id){point.queue_id=crypto.randomUUID();migrated=true;}
  if(migrated)write(points);
  // Splitting a rejected batch isolates invalid/expired/old-assignment points.
  for(let guard=0;guard<50;guard++) {
   const batch=read().filter(p=>!p.state).slice(0,BATCH);if(!batch.length)break;
   await upload(batch);
  }
  if(!read().some(p=>p.state==="needs_review"))syncError="";
 } catch(error) {syncError=error?.response?.status?"Saved GPS waiting: server "+error.response.status:error.message||"Waiting for connection";}
 finally {flushing=false;notifySavedWork();try {window.dispatchEvent(new Event(EVENT));}catch { /* tests */ }}
 return sent;
}
export function clearGpsQueue() {write([]);}
