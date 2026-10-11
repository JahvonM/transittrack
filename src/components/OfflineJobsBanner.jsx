import React,{useEffect,useState} from "react";
import {useLocation} from "react-router-dom";
import {CloudOff,CloudUpload} from "lucide-react";
import {base44} from "@/api/base44Client";
import {flushJobs} from "@/lib/offlineJobs";
import {SAVED_WORK_EVENT,savedWork,exportSavedWork,retryReviewedWork,archiveReviewedWork,removeArchivedWork} from "@/lib/savedWork";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
// Work saved during a short signal drop uploads by itself within a minute or
// two; a notice for that only flickered on and off. It shows once something
// has really been waiting.
const WAIT_NOTICE_MS=2*60*1000;
const savedAt=item=>Date.parse(item.queued_at||item.t||"");
const count=(n,one,many)=>n+" "+(n===1?one:many);
export default function OfflineJobsBanner() {
 const [items,setItems]=useState([]),[error,setError]=useState(""),[open,setOpen]=useState(false),[admin,setAdmin]=useState(false),[exported,setExported]=useState(false),[confirmed,setConfirmed]=useState(false),[now,setNow]=useState(()=>Date.now());
 const {pathname}=useLocation();
 const refresh=()=>{try {setItems(savedWork());setError("");}catch(e){setError(e.message);}setNow(Date.now());};
 useEffect(()=>{
  refresh();window.addEventListener(SAVED_WORK_EVENT,refresh);window.addEventListener("storage",refresh);
  window.addEventListener("online",refresh);window.addEventListener("offline",refresh);
  return()=>{window.removeEventListener(SAVED_WORK_EVENT,refresh);window.removeEventListener("storage",refresh);window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);};
 },[]);
 const pending=items.filter(item=>item.state!=="archived"),reviewed=pending.filter(item=>item.state==="needs_review");
 const waiting=pending.filter(item=>item.state!=="needs_review");
 useEffect(()=>{
  if(!waiting.length)return undefined;
  const t=setInterval(()=>setNow(Date.now()),30000);
  return()=>clearInterval(t);
 },[waiting.length]);
 useEffect(()=>{if(open)base44.auth.me().then(user=>setAdmin(user.role==="admin")).catch(()=>setAdmin(false));},[open]);
 // Bus tablets show their own upload status, and nobody at a tablet can act on
 // this (clearing saved work needs an admin signed in). Their saved counts
 // still reach Admin -> Fleet health.
 if(/^\/(driver|kiosk)(\/|$)/.test(pathname))return null;
 const offline=typeof navigator!=="undefined"&&navigator.onLine===false;
 const stuck=waiting.some(item=>!(now-savedAt(item)<WAIT_NOTICE_MS));
 const archivedOnly=!pending.length&&items.length;
 if(!error&&!reviewed.length&&!archivedOnly&&!(waiting.length&&(offline||stuck)))return null;
 const exportFile=()=>{
  try {
   const blob=new Blob([exportSavedWork()],{type:"application/json"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
   anchor.href=url;anchor.download="TransitTrack-saved-work-"+new Date().toISOString().slice(0,10)+".json";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExported(true);
  }catch(e){setError(e.message);}
 };
 const retry=()=>{try {retryReviewedWork();flushJobs().catch(e=>setError(e.message));}catch(e){setError(e.message);}};
 const archive=async()=>{
  try {if((await base44.auth.me()).role!=="admin")throw new Error("An online admin is required.");archiveReviewedWork();setConfirmed(false);setExported(false);}catch(e){setError(e.message);}
 };
 const remove=async()=>{
  try {
   if((await base44.auth.me()).role!=="admin")throw new Error("An online admin is required.");
   if(!window.confirm("Permanently remove only archived copies from this tablet? Confirm you saved and reconciled the export."))return;
   removeArchivedWork();setConfirmed(false);setExported(false);
  }catch(e){setError(e.message);}
 };
 const Icon=reviewed.length?CloudOff:CloudUpload;
 return <>
  <button type="button" onClick={()=>{setExported(false);setConfirmed(false);setOpen(true);}} className="fixed left-1/2 -translate-x-1/2 z-50 bottom-[calc(env(safe-area-inset-bottom)+84px)] md:bottom-6 flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-lg" role="status">
   <Icon className="w-4 h-4" />{error?"Saved work needs recovery":reviewed.length?count(reviewed.length,"saved item needs review","saved items need review"):pending.length?count(pending.length,"saved item waiting to upload","saved items waiting to upload"):count(items.length,"archived item on this device","archived items on this device")}
  </button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-auto">
   <DialogHeader><DialogTitle>Saved work on this device</DialogTitle><DialogDescription>Rejected items stay here for review. Export them before reconciling missing records. Credentials are omitted from the export. Keep this device's storage.</DialogDescription></DialogHeader>
   {error&&<p role="alert">{error}</p>}
   <ul className="space-y-2">{(pending.length?pending:items).slice(0,100).map((item,index)=><li key={item.id||item.queue_id||index} className="rounded border p-2 text-sm">
    <strong>{item.label||item.payload?.staff_name||item.payload?.staff_id||(item.storage_key==="tt_gps_queue"?"GPS sample":"Check-in")}</strong>
    <p>{item.state==="archived"?"Archived":item.state==="needs_review"?"Needs review":"Waiting to upload"} · {item.queued_at||item.t||""}</p>{item.last_error&&<p>{item.last_error}</p>}
   </li>)}</ul>
   {pending.length>100&&<p>Showing 100 items. Export includes all saved items.</p>}
   <div className="flex gap-2"><Button onClick={exportFile}>Export saved work</Button><Button variant="outline" onClick={retry}>Retry originals</Button></div>
   {items.some(item=>item.state)&&<div className="space-y-2 border-t pt-3">
    <p className="text-sm">An online admin can archive reviewed items after export and reconciliation. Archived originals remain stored and exportable; they stop blocking dependent uploads.</p>
    {admin&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I saved the export and reconciled these items.</label>}
    <Button variant="outline" disabled={!admin||!exported||!confirmed||!reviewed.length} onClick={archive}>Archive reviewed items</Button>
    {items.some(item=>item.state==="archived")&&<Button variant="outline" disabled={!admin||!exported||!confirmed} onClick={remove}>Remove exported archived copies</Button>}
   </div>}
  </DialogContent></Dialog>
 </>;
}
