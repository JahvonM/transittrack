import React,{useEffect,useState} from "react";
import {requestMetrics} from "@/lib/requestMetrics";
export default function RequestHealth({devices=[]}) {
 const [local,setLocal]=useState(requestMetrics);
 useEffect(()=>{const timer=setInterval(()=>setLocal(requestMetrics()),5000);return()=>clearInterval(timer);},[]);
 const reported=devices.filter(d=>d.app_health?.request_metrics);
 return <section className="rounded-2xl border bg-card p-4 space-y-4" aria-label="Request health">
  <div><h2 className="font-semibold text-lg">Request health</h2><p className="text-sm text-muted-foreground">Last 10 minutes on this device. Counts reset when the app reloads. No additional monitoring requests.</p></div>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[["Requests",local.requests],["Failed",local.failed],["Busy responses",local.rate_limited],["Average response",local.avg_ms+" ms"]].map(([name,value])=><div key={name}><p className="text-xs text-muted-foreground">{name}</p><strong className="text-lg">{value}</strong></div>)}</div>
  <p className="text-xs text-muted-foreground">Busy responses include rate-limited lists in combined responses. Authentication and connection failures count separately from successful requests.</p>
  <details><summary className="cursor-pointer min-h-11 flex items-center font-semibold">Functions on this device</summary><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Function</th><th>Requests</th><th>Failed</th><th>Busy</th><th>Avg ms</th><th>Max ms</th></tr></thead><tbody>{local.functions.map(r=><tr key={r.name} className="border-t"><td className="p-2">{r.name}</td><td>{r.requests}</td><td>{r.failed}</td><td>{r.rate_limited}</td><td>{r.avg_ms}</td><td>{r.max_ms}</td></tr>)}</tbody></table></div></details>
  <h3 className="font-semibold">Tablet reports</h3>
  {reported.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Tablet</th><th>Reported</th><th>Requests</th><th>Failed</th><th>Busy</th><th>Avg ms</th></tr></thead><tbody>{reported.map(d=>{const m=d.app_health.request_metrics;return <tr key={d.id} className="border-t"><td className="p-2">{d.label || d.vehicle_name || "Tablet"}</td><td>{d.app_health.reported_at?new Date(d.app_health.reported_at).toLocaleTimeString():"—"}</td><td>{m.requests ?? "—"}</td><td>{m.failed ?? "—"}</td><td>{m.rate_limited ?? "—"}</td><td>{m.avg_ms ?? "—"}</td></tr>;})}</tbody></table></div>:<p className="text-sm text-muted-foreground">Tablet summaries appear after they install this update and check in.</p>}
  <p className="text-xs text-muted-foreground">Tablet counters are device-reported snapshots, not live server measurements. Check the reported time before interpreting them.</p>
 </section>;
}
