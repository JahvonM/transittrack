// Device-provided diagnostics are bounded counters, never authorization inputs.
export function cleanRequestMetrics(value: unknown) {
 if(!value || typeof value!=='object' || Array.isArray(value))return undefined;
 const data=value as Record<string,unknown>;
 const out:Record<string,string|number>={};
 for(const key of ['window_seconds','requests','failed','rate_limited','network_errors','auth_errors','server_errors','partial_failures','avg_ms','max_ms']){
  const n=data[key];if(typeof n==='number' && Number.isFinite(n))out[key]=Math.max(0,Math.min(1000000,Math.round(n)));
 }
 if(typeof data.observed_at==='string' && Number.isFinite(Date.parse(data.observed_at)))out.observed_at=new Date(data.observed_at).toISOString();
 return out;
}
