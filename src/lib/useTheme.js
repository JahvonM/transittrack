import { useEffect, useState } from "react";
const STORAGE_KEY="tt-theme-v2", EVENT="tt-theme-change";
const query=()=>window.matchMedia("(prefers-color-scheme: dark)");
const preference=()=>{try{const t=localStorage.getItem(STORAGE_KEY);if(["dark","light","system"].includes(t))return t;}catch{/* unavailable */}return "system";};
const resolved=t=>t==="system"?(query().matches?"dark":"light"):t;
function apply(t){const root=document.documentElement;const mode=resolved(t);root.classList.remove("dark","light");root.classList.add(mode);root.style.colorScheme=mode;}
export function useIsDark(){
 const read=()=>document.documentElement.classList.contains("tt-future")||!document.documentElement.classList.contains("light");
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
