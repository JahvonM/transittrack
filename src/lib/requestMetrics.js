// Numeric diagnostics only. No request bodies, replies, error messages, URLs,
// users, PINs or card identifiers are retained. Memory expires after 10 minutes.
export function createRequestMetrics({now=()=>Date.now(),windowMs=600000}={}) {
 const buckets=new Map();
 const trim=()=>{for(const [key,row]of buckets)if(row.at<now()-windowMs)buckets.delete(key);};
 const record=(name,{status,durationMs=0,partialStatuses=[]}={})=>{
  try {
   trim();
   const safe=/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)?name:"unknown";
   const minute=Math.floor(now()/60000)*60000,key=minute+":"+safe;
   if(!buckets.has(key)){if(buckets.size>=640)return;buckets.set(key,{at:minute,name:safe,requests:0,failed:0,rate_limited:0,network_errors:0,partial_failures:0,total_ms:0,max_ms:0});}
   const r=buckets.get(key),ms=Number.isFinite(durationMs)?Math.max(0,Math.min(3600000,Math.round(durationMs))):0;
   const partial=partialStatuses.slice(0,32).filter(s=>Number.isInteger(s)&&s>=400&&s<=599);
   r.requests++;r.failed+=(!status || status>=400 || partial.length)?1:0;
   r.rate_limited+=(status===429 || partial.includes(429))?1:0;r.network_errors+=!status?1:0;
   r.partial_failures+=partial.length;r.total_ms+=ms;r.max_ms=Math.max(r.max_ms,ms);
  }catch{/* Monitoring must never interrupt an app request. */}
 };
 const snapshot=()=>{
  trim();const functions=new Map();
  for(const r of buckets.values()){
   const f=functions.get(r.name)||{name:r.name,requests:0,failed:0,rate_limited:0,network_errors:0,partial_failures:0,total_ms:0,max_ms:0};
   for(const k of ["requests","failed","rate_limited","network_errors","partial_failures","total_ms"])f[k]+=r[k];
   f.max_ms=Math.max(f.max_ms,r.max_ms);functions.set(r.name,f);
  }
  const rows=[...functions.values()].map(({total_ms,...r})=>({...r,avg_ms:Math.round(total_ms/r.requests)})).sort((a,b)=>b.failed-a.failed||b.requests-a.requests);
  const sum=k=>rows.reduce((n,r)=>n+r[k],0),requests=sum("requests");
  return {window_seconds:windowMs/1000,observed_at:new Date(now()).toISOString(),requests,failed:sum("failed"),rate_limited:sum("rate_limited"),network_errors:sum("network_errors"),partial_failures:sum("partial_failures"),avg_ms:requests?Math.round(rows.reduce((n,r)=>n+r.avg_ms*r.requests,0)/requests):0,max_ms:Math.max(0,...rows.map(r=>r.max_ms)),functions:rows};
 };
 return {record,snapshot};
}
const metrics=createRequestMetrics();
export const recordRequest=metrics.record;
export const requestMetrics=metrics.snapshot;
