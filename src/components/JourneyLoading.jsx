import React, { useEffect, useState } from "react";
import { Bus } from "lucide-react";
import Logo from "@/components/Logo";
import BusArtwork from "@/components/BusArtwork";

// Pure presentation: requests, offline caches and access checks stay with the
// caller. No simulated percentages, completed steps or artificial loading delay.
export default function JourneyLoading({
 label = "Opening TransitTrack…", heading = "Getting ready for your journey",
 company, vehicle, context, onRetry, fullScreen = true,
}) {
 const [slow, setSlow] = useState(false);
 useEffect(() => {
  setSlow(false);
  const timer = setTimeout(() => setSlow(true), 12000);
  return () => clearTimeout(timer);
 }, [label]);
 return (
  <section className={`tt-journey-loading ${fullScreen ? "tt-journey-loading-full" : "tt-journey-loading-inline"}`} aria-label="TransitTrack loading screen" aria-busy="true">
   <div className="tt-loading-contours" aria-hidden="true" />
   <header className="tt-loading-header">
    <div className="tt-loading-brand"><Logo className="w-9 h-9" /><span>Transit<span className="tt-loading-accent">Track</span></span></div>
    {context && <span className="tt-loading-context">{context}</span>}
   </header>
   <div className="tt-loading-body">
    {company?.name && <div className="tt-loading-company">
     {company.logo_url ? <img src={company.logo_url} alt="" /> : <Bus size={22} aria-hidden="true" />}
     <span>{company.name}</span>
    </div>}
    <div className="tt-loading-scene" aria-hidden="true">
     <div className="tt-loading-halo" />
     <svg className="tt-loading-road" viewBox="0 0 640 160" fill="none">
      <ellipse cx="320" cy="85" rx="285" ry="52" stroke="currentColor" strokeOpacity=".25" />
      <ellipse className="tt-loading-route-light" cx="320" cy="85" rx="285" ry="52" stroke="currentColor" strokeWidth="2" strokeDasharray="220 1100" />
      <g fill="currentColor"><circle cx="35" cy="85" r="4" /><circle cx="155" cy="128" r="4" /><circle cx="405" cy="135" r="4" /><circle cx="605" cy="85" r="4" /></g>
     </svg>
     <BusArtwork vehicle={vehicle} width={520} className="tt-loading-bus" />
    </div>
    <h1>{heading}</h1>
    <p className="tt-loading-status" role="status" aria-live="polite" aria-atomic="true">{label}</p>
    <div className="tt-loading-progress" aria-hidden="true"><span /></div>
    {slow && <div className="tt-loading-slow">
     <p>This is taking longer than usual. Check your connection.</p>
     {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
    </div>}
   </div>
   <footer className="tt-loading-footer">TransitTrack</footer>
  </section>
 );
}
