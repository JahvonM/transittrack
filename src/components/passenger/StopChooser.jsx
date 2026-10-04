import React, { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/lib/geo";
import { sortStops } from "./passengerState";

const fmtDist = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000 / 10) * 10} m from you` : `${km.toFixed(1)} km from you`);

/**
 * Pick the stop you get on at. Stops are grouped by route; when your location
 * is known they're sorted nearest first and the closest one is marked.
 */
export default function StopChooser({ routes, value, onChoose, userLoc, intro = true, companyName }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const seen = new Set();
    let nearest = null;
    const out = (routes || []).map((r) => {
      const stops = sortStops(r.stops)
        .filter((s) => !seen.has(s.name) && (seen.add(s.name), true))
        .map((s) => {
          const km = userLoc && s.lat != null ? haversineKm(userLoc.lat, userLoc.lng, s.lat, s.lng) : null;
          if (km != null && (!nearest || km < nearest.km)) nearest = { name: s.name, km };
          return { ...s, km };
        });
      if (userLoc) stops.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
      return { id: r.id, name: r.name || "Route", stops };
    }).filter((g) => g.stops.length);
    return { list: out, nearest: nearest?.name || null };
  }, [routes, userLoc]);

  const needle = q.trim().toLowerCase();
  const visible = groups.list
    .map((g) => ({ ...g, stops: needle ? g.stops.filter((s) => s.name.toLowerCase().includes(needle)) : g.stops }))
    .filter((g) => g.stops.length);
  const total = groups.list.reduce((n, g) => n + g.stops.length, 0);

  return (
    <div>
      {intro && (
        <div className="px-6 pb-6 pt-4 lg:px-0">
          {companyName && <p className="text-body-sm text-muted-foreground">{companyName}</p>}
          <h1 className="mt-2 text-display font-bold">Where do you get on the bus?</h1>
          <p className="mt-3 text-body text-muted-foreground">Pick your stop and TransitTrack shows when your bus will arrive, and can tell you when it's one stop away.</p>
        </div>
      )}
      {total > 8 && (
        <div className="px-6 pb-4 lg:px-0">
          <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search stops</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stops" className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground" />
          </label>
        </div>
      )}
      {visible.length === 0 && <p className="px-6 text-body text-muted-foreground lg:px-0">{total ? "No stops match that search." : "This company hasn't added any stops yet."}</p>}
      {visible.map((g) => (
        <section key={g.id} className="px-6 pb-6 lg:px-0" aria-label={g.name}>
          <h2 className="mb-1 text-body-sm font-semibold text-muted-foreground">{g.name}</h2>
          <ul className="divide-y divide-border border-y border-border" aria-label={`Stops on ${g.name}`}>
            {g.stops.map((s) => {
              const selected = s.name === value;
              const near = s.name === groups.nearest;
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => onChoose(s.name)}
                    aria-pressed={selected}
                    className={cn("flex min-h-[64px] w-full items-center gap-3 py-2 text-left hover:bg-accent/50", selected && "font-bold")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-title-sm font-semibold">{s.name}</span>
                      {(near || s.km != null) && (
                        <span className="block text-body-sm text-muted-foreground">
                          {near && <span className="font-semibold text-foreground">Nearest stop</span>}
                          {near && s.km != null && ", "}
                          {fmtDist(s.km)}
                        </span>
                      )}
                    </span>
                    {selected && <Check className="h-5 w-5 text-primary" aria-label="Selected" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
