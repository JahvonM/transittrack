import { useEffect, useState } from "react";
export const DRIVER_LANDSCAPE_QUERY = "(min-width: 960px) and (orientation: landscape)";
export default function useDriverLandscape() {
 const [landscape,setLandscape]=useState(()=>window.matchMedia(DRIVER_LANDSCAPE_QUERY).matches);
 useEffect(()=>{
  const media=window.matchMedia(DRIVER_LANDSCAPE_QUERY),change=()=>setLandscape(media.matches);
  change();
  if(media.addEventListener)media.addEventListener("change",change);else media.addListener(change);
  return()=>{if(media.removeEventListener)media.removeEventListener("change",change);else media.removeListener(change);};
 },[]);
 return landscape;
}
