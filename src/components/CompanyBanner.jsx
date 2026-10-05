import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

export default function CompanyBanner({ name, logoUrl, compact = false, className = "", label = "Company banner" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  if (!name && !logoUrl) return null;
  return (
    <div aria-label={label} className={`relative isolate overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/15 via-card to-card ${compact ? "px-3 py-2" : "px-5 py-4"} ${className}`}>
      {logoUrl && !failed && <img src={logoUrl} alt="" aria-hidden="true" className="absolute right-0 top-1/2 -translate-y-1/2 w-56 h-40 object-contain opacity-10 blur-sm pointer-events-none" />}
      <div className="relative flex items-center gap-3 min-w-0">
        <div className={`shrink-0 rounded-lg bg-white/95 p-1.5 grid place-items-center ${compact ? "w-11 h-11" : "w-16 h-16"}`}>
          {logoUrl && !failed ? <img src={logoUrl} alt={`${name || "Company"} logo`} className="w-full h-full object-contain" onError={() => setFailed(true)} /> : <Building2 className="w-7 h-7 text-slate-700" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">TransitTrack · company transport</p>
          <p className={`font-heading font-semibold break-words leading-tight ${compact ? "text-sm" : "text-lg sm:text-xl"}`}>{name || "Your company"}</p>
        </div>
      </div>
    </div>
  );
}
