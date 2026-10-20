import { useEffect, useState } from "react";
const STORAGE_KEY="tt-theme-v2", EVENT="tt-theme-change";
const query=()=>window.matchMedia("(prefers-color-scheme: dark)");
const preference=()=>{try{const t=localStorage.getItem(STORAGE_KEY);if(["dark","light","system"].includes(t))return t;}catch{/* unavailable */}return "system";};
const resolved=t=>t==="system"?(query().matches?"dark":"light"):t;
// "tt-theme-chosen": a mode was picked in Account -> Appearance (the admin
// console stays dark until one is).
function apply(t){const root=document.documentElement;const mode=resolved(t);root.classList.remove("dark","light");root.classList.add(mode);root.style.colorScheme=mode;let chosen=false;try{chosen=!!localStorage.getItem(STORAGE_KEY);}catch{/* unavailable */}root.classList.toggle("tt-theme-chosen",chosen);}
export function useIsDark(){
 // The kiosk and sign-in screens are always dark; the passenger app follows
 // Light/Dark like the rest of the app.
 // The admin console follows them once a mode has been picked.
 const read=()=>{const c=document.documentElement.classList;const follows=c.contains("tt-passenger-app") || (c.contains("tt-admin-app") && c.contains("tt-theme-chosen"));return (c.contains("tt-future") && !follows) || !c.contains("light");};
 const [dark,setDark]=useState(read);
 useEffect(()=>{const o=new MutationObserver(()=>setDark(read()));o.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-accent"]});return()=>o.disconnect();},[]);
 return dark;
}
export function useTheme(){
 const [theme,update]=useState(preference);
 useEffect(()=>{
  const media=query();
  const sync=()=>{const t=preference();update(t);apply(t);};
  sync();media.addEventListener("change",sync);window.addEventListener(EVENT,sync);window.addEventListener("storage",sync);
  return()=>{media.removeEventListener("change",sync);window.removeEventListener(EVENT,sync);window.removeEventListener("storage",sync);};
 },[]);
 const setTheme=t=>{if(!["system","dark","light"].includes(t))return;try{localStorage.setItem(STORAGE_KEY,t);}catch{/* unavailable */}update(t);apply(t);window.dispatchEvent(new Event(EVENT));};
 const toggle=()=>setTheme(resolved(theme)==="dark"?"light":"dark");
 return {theme,setTheme,toggle};
}
