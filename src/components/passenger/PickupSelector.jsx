import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Bus, Check, LocateFixed, Map, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haversineKm } from "@/lib/geo";
const LocationPinner = lazy(() => import("@/components/staff/LocationPinner"));
const StopsMap = lazy(() => import("@/components/LiteMap"));
const distance = km => km < 1 ? `${Math.round(km*1000/10)*10} m` : `${km.toFixed(1)} km`;

export default function PickupSelector({ options=[], routes=[], value, onChoose, userLoc, intro=true, companyName, onConfirmed }) {
 const [draft,setDraft] = useState(value || "");
 const [mode,setMode] = useState("stops");
 const [query,setQuery] = useState("");
 const [mapOpen,setMapOpen] = useState(false);
 const [saving,setSaving] = useState(false);
 const [error,setError] = useState("");
 const [saved,setSaved] = useState(false);
 useEffect(()=>{setDraft(value || "");setSaved(false);setError("");},[value]);
 const stops=useMemo(()=>{
  const seen=new Set();
  return options.filter(s=>s.name && !seen.has(s.name) && (seen.add(s.name),true)).map(s=>({
   ...s,routeName:s.routeName || routes.find(r=>r.id===s.route_id)?.name || "",
   km:userLoc && Number.isFinite(s.lat) && Number.isFinite(s.lng) ? haversineKm(userLoc.lat,userLoc.lng,s.lat,s.lng) : null,
  })).sort((a,b)=>(a.km ?? Infinity)-(b.km ?? Infinity));
 },[options,routes,userLoc]);
 const filtered=stops.filter(s=>(s.name+" "+s.routeName).toLowerCase().includes(query.trim().toLowerCase()));
 const confirm=async()=>{
  if(!draft || saving)return;
  setSaving(true);setError("");
  try {await onChoose(draft);setSaved(true);onConfirmed?.();}
  catch {setError("Couldn't save your pickup. Your current pickup hasn't changed. Try again.");}
  finally {setSaving(false);}
 };
 return <section className="tt-pickup-selector space-y-4" aria-label="Choose your pickup">
  {intro && <div>{companyName && <p className="text-body-sm text-muted-foreground">{companyName}</p>}<h2 className="text-headline font-bold">Where should we pick you up?</h2><p className="mt-2 text-muted-foreground">Choose a stop or find a pickup nearby.</p></div>}
  <div className="tt-pickup-current flex items-center gap-3 rounded-xl border p-3">
   <MapPin className="w-6 h-6 text-primary shrink-0" aria-hidden="true" /><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Current pickup</p><p className="font-semibold">{value || "No pickup selected yet"}</p></div>
  </div>
  <div className="grid grid-cols-2 gap-3" aria-label="Pickup method">
   <button type="button" aria-pressed={mode==="stops"} disabled={saving} onClick={()=>setMode("stops")} className="tt-pickup-method"><Bus className="w-6 h-6" aria-hidden="true" />Choose a bus stop</button>
   <button type="button" aria-pressed={mode==="near"} disabled={saving} onClick={()=>setMode("near")} className="tt-pickup-method"><LocateFixed className="w-6 h-6" aria-hidden="true" />Find a pickup near me</button>
  </div>
  {mode==="near" ? <div className="space-y-3">
   <h3 className="font-semibold">Find a roadside pickup</h3><p className="text-sm text-muted-foreground">Use your location, search an address or choose your own point. Review the walking directions before saving.</p>
   <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Opening pickup finder…</p>}><LocationPinner onSaved={async name=>{await onChoose(name);onConfirmed?.();}} /></Suspense>
  </div> : <>
   <label className="flex h-12 items-center gap-2 rounded-xl border bg-card px-3 focus-within:ring-2 focus-within:ring-primary">
    <Search className="w-5 h-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Search stops or areas</span>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search stops or areas" className="w-full min-w-0 bg-transparent outline-none" />
   </label>
   <div><h3 className="mb-2 text-sm text-muted-foreground">Available stops</h3>
    <ul className="space-y-2" aria-label="Available pickup stops">{filtered.map(s=><li key={s.name}>
     <button type="button" disabled={saving} aria-pressed={draft===s.name} onClick={()=>{setDraft(s.name);setSaved(false);setError("");}} className="tt-pickup-stop">
      <span className="tt-pickup-pin"><MapPin className="w-5 h-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><strong className="block">{s.name}</strong>{s.routeName && <span className="block text-sm text-muted-foreground">{s.routeName}</span>}{s.personal && <span className="block text-xs text-muted-foreground">Your saved roadside pickup</span>}{s.km!=null && <span className="block text-xs text-muted-foreground">{distance(s.km)} away · straight-line distance</span>}</span>
      {draft===s.name ? <Check className="w-5 h-5 shrink-0 text-primary" aria-label="Selected" /> : <span className="w-5 h-5 rounded-full border shrink-0" aria-hidden="true" />}
     </button>
    </li>)}</ul>
    {!filtered.length && <p className="rounded-xl border p-4 text-sm text-muted-foreground">{stops.length ? "No stops match that search. Try another stop or route name." : "Your company hasn't added stops yet. You can still find a roadside pickup."}</p>}
   </div>
   {!!stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)).length && <>
    <Button type="button" variant="outline" className="w-full h-12" onClick={()=>setMapOpen(v=>!v)} aria-expanded={mapOpen}><Map className="w-5 h-5" />{mapOpen ? "Hide stops map" : "View stops on map"}</Button>
    {mapOpen && <div className="h-64 overflow-hidden rounded-xl border" aria-label="Pickup stops map"><Suspense fallback={<p className="p-4 text-sm">Opening stops map…</p>}><StopsMap fill vehicles={[]} stops={stops} userLocation={userLoc} /></Suspense></div>}
   </>}
   <div className="tt-pickup-confirm rounded-xl border p-4 space-y-3">
    <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Your pickup</p><p className="text-lg font-semibold">{draft || "Select a stop above"}</p></div>
    <Button type="button" className="w-full h-12 text-base" disabled={!draft || saving} onClick={confirm}>{saving ? "Saving pickup…" : "Confirm pickup"}</Button>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {saved && <p role="status" className="text-sm text-primary">Pickup saved.</p>}
   </div>
  </>}
 </section>;
}
