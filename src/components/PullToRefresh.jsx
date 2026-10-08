import React, { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
const THRESHOLD=64;
function atTop(target){
 for(let el=target;el&&el!==document.body;el=el.parentElement){
  const overflow=getComputedStyle(el).overflowY;
  if(/auto|scroll/.test(overflow)&&el.scrollHeight>el.clientHeight&&el.scrollTop>0)return false;
 }
 return window.scrollY<=0;
}
export default function PullToRefresh({onRefresh,children,className}){
 const gesture=useRef(null),busy=useRef(false);
 const [pull,setPull]=useState(0),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
 const refresh=async()=>{
  if(busy.current)return;busy.current=true;setRefreshing(true);setError("");
  try{await onRefresh?.();}catch{setError("Couldn't refresh. Your current information is still here.");}
  finally{busy.current=false;setRefreshing(false);setPull(0);}
 };
 const start=e=>{
  gesture.current=null;
  if(busy.current||e.touches.length!==1||e.target.closest("button,input,textarea,select,[role=dialog],.leaflet-container,.mapboxgl-map")||!atTop(e.target))return;
  gesture.current={x:e.touches[0].clientX,y:e.touches[0].clientY,pull:0};
 };
 const move=e=>{
  const g=gesture.current;if(!g||busy.current)return;
  if(e.touches.length!==1){gesture.current=null;setPull(0);return;}
  const dx=Math.abs(e.touches[0].clientX-g.x),dy=e.touches[0].clientY-g.y;
  if(dx>Math.abs(dy)||dy<0){gesture.current=null;setPull(0);return;}
  g.pull=Math.min(dy*.5,88);setPull(g.pull);
 };
 const end=()=>{const ready=gesture.current?.pull>=THRESHOLD;gesture.current=null;if(ready)void refresh();else setPull(0);};
 return <div className={className} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={()=>{gesture.current=null;setPull(0);}}>
  <div className="flex items-center justify-end pb-2">
   <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh list" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-accent">
    {refreshing?<Loader2 className="h-4 w-4 animate-spin" />:<RefreshCw className="h-4 w-4" />} {refreshing?"Refreshing…":"Refresh"}
   </button>
  </div>
  {pull>0&&<div role="status" className="grid place-items-center text-xs text-muted-foreground" style={{height:pull}}>{pull>=THRESHOLD?"Release to refresh":"Pull to refresh"}</div>}
  {error&&<p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
  {children}
 </div>;
}
