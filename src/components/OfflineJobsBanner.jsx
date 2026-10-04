import React,{useEffect,useState} from "react";
import {CloudOff,CloudUpload} from "lucide-react";
import {base44} from "@/api/base44Client";
import {flushJobs} from "@/lib/offlineJobs";
import {SAVED_WORK_EVENT,savedWork,exportSavedWork,retryReviewedWork,archiveReviewedWork} from "@/lib/savedWork";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
export default function OfflineJobsBanner() {
 const [items,setItems]=useState([]),[error,setError]=useState(""),[open,setOpen]=useState(false),[admin,setAdmin]=useState(false),[exported,setExported]=useState(false),[confirmed,setConfirmed]=useState(false);
 const refresh=()=>{try {setItems(savedWork());setError("");}catch(e){setError(e.message);}};
 useEffect(()=>{
  refresh();window.addEventListener(SAVED_WORK_EVENT,refresh);window.addEventListener("storage",refresh);
  return()=>{window.removeEventListener(SAVED_WORK_EVENT,refresh);window.removeEventListener("storage",refresh);};
 },[]);
 useEffect(()=>{if(open)base44.auth.me().then(user=>setAdmin(user.role==="admin")).catch(()=>setAdmin(false));},[open]);
 const pending=items.filter(item=>item.state!=="archived"),reviewed=pending.filter(item=>item.state==="needs_review");
 if(!pending.length&&!error)return null;
 const exportFile=()=>{
  try {
   const blob=new Blob([exportSavedWork()],{type:"application/json"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
   anchor.href=url;anchor.download="TransitTrack-saved-work-"+new Date().toISOString().slice(0,10)+".json";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExported(true);
  }catch(e){setError(e.message);}
 };
 const retry=()=>{try {retryReviewedWork();flushJobs().catch(e=>setError(e.message));}catch(e){setError(e.message);}};
 const archive=()=>{try {archiveReviewedWork();setConfirmed(false);setExported(false);}catch(e){setError(e.message);}};
 const Icon=reviewed.length?CloudOff:CloudUpload;
 return <>
  <button type="button" onClick={()=>{setExported(false);setConfirmed(false);setOpen(true);}} className="fixed left-1/2 -translate-x-1/2 z-50 bottom-[calc(env(safe-area-inset-bottom)+84px)] md:bottom-6 flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-lg" role="status">
   <Icon className="w-4 h-4" />{error?"Saved work needs recovery":reviewed.length?reviewed.length+" saved items need review":pending.length+" saved items waiting to upload"}
  </button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-auto">
   <DialogHeader><DialogTitle>Saved work on this device</DialogTitle><DialogDescription>Rejected items stay here for review. Export them before reconciling missing records. Credentials are omitted from the export. Keep this device's storage.</DialogDescription></DialogHeader>
   {error&&<p role="alert">{error}</p>}
   <ul className="space-y-2">{pending.slice(0,100).map((item,index)=><li key={item.id||item.queue_id||index} className="rounded border p-2 text-sm">
    <strong>{item.label||item.payload?.staff_name||item.payload?.staff_id||(item.storage_key==="tt_gps_queue"?"GPS sample":"Check-in")}</strong>
    <p>{item.state==="needs_review"?"Needs review":"Waiting to upload"} · {item.queued_at||item.t||""}</p>{item.last_error&&<p>{item.last_error}</p>}
   </li>)}</ul>
   {pending.length>100&&<p>Showing 100 items. Export includes all saved items.</p>}
   <div className="flex gap-2"><Button onClick={exportFile}>Export saved work</Button><Button variant="outline" onClick={retry}>Retry originals</Button></div>
   {reviewed.length>0&&<div className="space-y-2 border-t pt-3">
    <p className="text-sm">An online admin can archive reviewed items after export and reconciliation. Archived originals remain stored and exportable; they stop blocking dependent uploads.</p>
    {admin&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I saved the export and reconciled these items.</label>}
    <Button variant="outline" disabled={!admin||!exported||!confirmed} onClick={archive}>Archive reviewed items</Button>
   </div>}
  </DialogContent></Dialog>
 </>;
}
