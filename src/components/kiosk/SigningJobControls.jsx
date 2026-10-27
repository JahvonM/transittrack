import React,{useEffect,useRef,useState} from "react";
import {base44} from "@/api/base44Client";
import {deviceRequest} from "@/lib/deviceAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";

// Moving the tablet to another bus: pick the bus, then that bus's PIN.
// Signatures saved on the tablet belong to its current bus, so it waits
// until they have been sent.
function ChangeBus({busName,jobs,savedCount,call,onMoved,onCancel}) {
 const [buses,setBuses]=useState(null),[choice,setChoice]=useState(null),[pin,setPin]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  if(savedCount>0)return;
  let live=true;
  call("list_buses").then(r=>{if(live)setBuses((r.buses||[]).filter(b=>b.id!==r.current));}).catch(e=>{if(live)setError(e?.response?.data?.error||"Couldn't load the buses. Check the connection.");});
  return()=>{live=false;};
 },[savedCount]);
 const move=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{const r=await call("change_bus",{vehicle_id:choice.id,pin});onMoved(r.bus,r.operator_grant);}
  catch(e){setPin("");setError(e?.response?.data?.error||e.message);}finally{setBusy(false);}
 };
 const underWay=jobs.filter(j=>["on_the_way","arrived"].includes(j.status));
 if(savedCount>0)return <section className="space-y-3"><h2 className="text-lg font-bold">Change bus</h2>
  <p role="status">{savedCount===1?"1 signature is":`${savedCount} signatures are`} saved on this tablet and not sent yet. They belong to {busName||"this bus"}, so the tablet can change bus once they have been sent. Keep it connected to the internet.</p>
  <Button variant="outline" onClick={onCancel}>Back</Button></section>;
 return <section className="space-y-3"><h2 className="text-lg font-bold">Change bus</h2>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {!choice?<>
   <p>Which bus is this tablet going on?</p>
   {buses===null&&!error&&<p role="status" className="text-muted-foreground">Loading buses…</p>}
   {buses?.length===0&&<p>No other buses in service.</p>}
   {buses?.length>0&&<div className="grid gap-2 sm:grid-cols-2">{buses.map(b=><Button key={b.id} variant="outline" className="h-auto justify-start py-3 text-left" onClick={()=>{setChoice(b);setError("");}}><span><span className="block font-semibold">{b.name}</span>{b.plate_number&&<span className="block text-sm text-muted-foreground">{b.plate_number}</span>}</span></Button>)}</div>}
   <Button variant="outline" onClick={onCancel}>Back</Button>
  </>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();move();}}>
   <p>Moving this tablet from {busName||"this bus"} to <strong>{choice.name}</strong>.</p>
   {underWay.length>0&&<p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{underWay.length===1?"A job":`${underWay.length} jobs`} on {busName||"this bus"} {underWay.length===1?"is":"are"} under way. Those guests won't be able to sign on this tablet after it moves.</p>}
   <label htmlFor="move-pin" className="block font-medium">PIN for {choice.name}</label>
   <Input id="move-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/>
   <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||pin.length!==4}>{busy?"Moving…":`Move to ${choice.name}`}</Button><Button type="button" variant="outline" onClick={()=>{setChoice(null);setPin("");setError("");}}>Choose another bus</Button></div>
  </form>}
 </section>;
}

export default function SigningJobControls({deviceId,busName,savedCount=0,onShowSignature,onShowNameSign,onBusChanged}) {
 const [open,setOpen]=useState(false),[pin,setPin]=useState(""),[grant,setGrant]=useState(""),[jobs,setJobs]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[moving,setMoving]=useState(false),[moved,setMoved]=useState("");
 const idle=useRef(null);
 const lock=()=>{setOpen(false);setGrant("");setPin("");setJobs([]);setError("");setMoving(false);setMoved("");};
 const touch=()=>{clearTimeout(idle.current);idle.current=setTimeout(lock,120000);};
 useEffect(()=>()=>clearTimeout(idle.current),[]);
 useEffect(()=>{lock();},[deviceId]);
 const call=async(action,body={})=>(await base44.functions.invoke("jobSigning",deviceRequest(deviceId,{action,operator_grant:grant,...body}))).data;
 const unlock=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{const result=await call("unlock_operator",{pin});setPin("");const state=await call("operator_state",{operator_grant:result.operator_grant});setJobs(state.jobs||[]);setGrant(result.operator_grant);touch();}
  catch(e){if(e?.response?.status===403){setGrant("");setJobs([]);}setError(e?.response?.data?.error||e.message);}finally{setBusy(false);}
 };
 const arrive=async(job,stage)=>{
  if(busy)return;setBusy(true);setError("");
  try{const result=await call("arrive",{trip_id:job.id,stage});onShowSignature(result.trip,stage);lock();}
  catch(e){if(e?.response?.status===403){setGrant("");setJobs([]);}setError(e?.response?.data?.error||e.message);}finally{setBusy(false);}
 };
 const movedTo=async(bus,nextGrant)=>{
  onBusChanged?.(bus);
  setGrant(nextGrant);setMoving(false);setMoved(`This tablet is now on ${bus.name}.`);
  try{const state=await call("operator_state",{operator_grant:nextGrant});setJobs(state.jobs||[]);}catch{setJobs([]);}
 };
 return <><Button variant="outline" onClick={()=>{setOpen(true);touch();}}>Job controls</Button>
 <Dialog open={open} onOpenChange={value=>value?setOpen(true):lock()}><DialogContent className="max-h-[90dvh] overflow-y-auto max-w-2xl" onPointerDownCapture={touch} onKeyDownCapture={touch}>
 <DialogHeader><DialogTitle>Signing tablet job controls</DialogTitle><DialogDescription>{grant?"Your assigned bus's jobs. Controls lock after two minutes idle.":"Enter the bus PIN to view job details and arrival controls."}</DialogDescription></DialogHeader>
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {!grant?<form className="space-y-3" onSubmit={e=>{e.preventDefault();unlock();}}><Input aria-label="Bus PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/><Button type="submit" disabled={busy||pin.length!==4}>{busy?"Checking…":"Unlock job controls"}</Button></form>
 :moving?<ChangeBus busName={busName} jobs={jobs} savedCount={savedCount} call={call} onMoved={movedTo} onCancel={()=>setMoving(false)}/>
 :<div className="space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3"><p>{moved?<span role="status" className="font-semibold">{moved}</span>:<>This tablet is on <strong>{busName||"its bus"}</strong>.</>}</p><Button variant="outline" onClick={()=>{setMoving(true);setMoved("");}}>Change bus</Button></div>
 {jobs.length?jobs.map(job=><section key={job.id} className="rounded-xl border p-4 space-y-2"><h2 className="font-bold">{job.pickup_name} → {job.dropoff_name}</h2><p>{job.passenger_name||job.client_name} · {job.guests??"—"} guests</p>{job.flight_number&&<p>Flight {job.flight_number}</p>}{job.scheduled_time&&<p>{new Date(job.scheduled_time).toLocaleString()}</p>}{job.notes&&<p>{job.notes}</p>}<p className="text-sm text-muted-foreground">{job.status.replaceAll("_"," ")}</p>
 <Button variant="outline" onClick={()=>{onShowNameSign(job);lock();}}>Show guest name card</Button>
 {job.status==="scheduled"?<p>Waiting for the driver to start this job.</p>:!job.pickup_signed_at?<Button disabled={busy||job.status!=="on_the_way"} onClick={()=>arrive(job,"pickup")}>Arrived at pickup · Show sign-in</Button>:<Button disabled={busy} onClick={()=>arrive(job,"dropoff")}>Arrived at drop-off · Show sign-in</Button>}
 </section>):<p>No active jobs assigned to this bus.</p>}<Button variant="outline" onClick={lock}>Lock controls</Button></div>}
 </DialogContent></Dialog></>;
}
