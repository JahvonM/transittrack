import React, { useEffect, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";
import { nativeDashcamAvailable, openRearDashcam, rearDashcamState } from "@/lib/nativeDashcam";
function useDashcamState() {
 const [state,setState]=useState(null);
 useEffect(()=>{
  if(!nativeDashcamAvailable())return undefined;
  let alive=true,reading=false;
  const read=async()=>{if(reading)return;reading=true;try{const next=await rearDashcamState();if(alive)setState(next);}finally{reading=false;}};
  void read();const timer=setInterval(()=>{void read();},2000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 return state;
}
export function RearDashcamTool() {
 const state=useDashcamState(),[error,setError]=useState("");
 if(!nativeDashcamAvailable())return null;
 const open=()=>{setError("");void openRearDashcam().catch(()=>setError("Install the latest kiosk update to open recording controls."));};
 return <button className="dk-tool" onClick={open}><Camera aria-hidden="true"/><span><strong>Rear dashcam{state?.recording?" · Recording":""}</strong><small>{error || state?.message || "Local clips · video only"}</small></span><ChevronRight className="dk-chevron"/></button>;
}
export function RearDashcamIndicator() {
 const state=useDashcamState();
 if(!state?.active && state?.phase!=="ERROR")return null;
 return <button type="button" title={state.message} aria-label={state.recording?"Rear dashcam recording — open controls":"Rear dashcam status — open controls"}
  onClick={()=>{void openRearDashcam().catch(()=>{});}} style={{color:state.phase==="ERROR"?"#fbbf24":"#fb7185",fontWeight:700,background:"transparent",border:0}}>
  {state.recording?"● REC":state.phase==="ERROR"?"Camera stopped":"Camera starting"}
 </button>;
}
