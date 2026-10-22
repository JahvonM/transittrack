import React,{useEffect,useRef,useState} from "react";
import {base44} from "@/api/base44Client";
import {deviceRequest} from "@/lib/deviceAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
export default function SigningJobControls({deviceId,onShowSignature}) {
 const [open,setOpen]=useState(false),[pin,setPin]=useState(""),[grant,setGrant]=useState(""),[jobs,setJobs]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const idle=useRef(null);
 const lock=()=>{setOpen(false);setGrant("");setPin("");setJobs([]);setError("");};
 const touch=()=>{clearTimeout(idle.current);idle.current=setTimeout(lock,120000);};
 useEffect(()=>()=>clearTimeout(idle.current),[]);
 const call=async(action,body={})=>(await base44.functions.invoke("jobSigning",deviceRequest(deviceId,{action,operator_grant:grant,...body}))).data;
 const unlock=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{const result=await call("unlock_operator",{pin});setPin("");const state=await call("operator_state",{operator_grant:result.operator_grant});setJobs(state.jobs||[]);setGrant(result.operator_grant);touch();}
  catch(e){setError(e?.response?.data?.error||e.message);}finally{setBusy(false);}
 };
 const arrive=async(job,stage)=>{
  if(busy)return;setBusy(true);setError("");
  try{const result=await call("arrive",{trip_id:job.id,stage});onShowSignature(result.trip,stage);lock();}
  catch(e){setError(e?.response?.data?.error||e.message);}finally{setBusy(false);}
 };
 return <><Button variant="outline" onClick={()=>{setOpen(true);touch();}}>Job controls</Button>
 <Dialog open={open} onOpenChange={value=>value?setOpen(true):lock()}><DialogContent className="max-h-[90dvh] overflow-y-auto max-w-2xl" onPointerDownCapture={touch} onKeyDownCapture={touch}>
 <DialogHeader><DialogTitle>Signing tablet job controls</DialogTitle><DialogDescription>{grant?"Your assigned bus's jobs. Controls lock after two minutes idle.":"Enter the bus PIN to view job details and arrival controls."}</DialogDescription></DialogHeader>
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {!grant?<form className="space-y-3" onSubmit={e=>{e.preventDefault();unlock();}}><Input aria-label="Bus PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/><Button type="submit" disabled={busy||pin.length!==4}>{busy?"Checking…":"Unlock job controls"}</Button></form>:<div className="space-y-3">{jobs.length?jobs.map(job=><section key={job.id} className="rounded-xl border p-4 space-y-2"><h2 className="font-bold">{job.pickup_name} → {job.dropoff_name}</h2><p>{job.passenger_name||job.client_name} · {job.guests??"—"} guests</p>{job.flight_number&&<p>Flight {job.flight_number}</p>}{job.scheduled_time&&<p>{new Date(job.scheduled_time).toLocaleString()}</p>}{job.notes&&<p>{job.notes}</p>}<p className="text-sm text-muted-foreground">{job.status.replaceAll("_"," ")}</p>
 {job.status==="scheduled"?<p>Waiting for the driver to start this job.</p>:!job.pickup_signed_at?<Button disabled={busy||job.status!=="on_the_way"} onClick={()=>arrive(job,"pickup")}>Arrived at pickup · Show sign-in</Button>:<Button disabled={busy} onClick={()=>arrive(job,"dropoff")}>Arrived at drop-off · Show sign-in</Button>}
 </section>):<p>No active jobs assigned to this bus.</p>}<Button variant="outline" onClick={lock}>Lock controls</Button></div>}
 </DialogContent></Dialog></>;
}
