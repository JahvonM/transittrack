import React, { useMemo, useState } from "react";
import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/lib/geo";
import { sortStops } from "./passengerState";

const fmtDist = (km) => (km == null ? null : km < 1 ? `${Math.round((km * 1000) / 10) * 10} m` : `${km.toFixed(1)} km`);

function StopRow({ s, selected, nearest, onChoose, showRoute }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(s.name)}
        aria-pressed={selected}
        className={cn("flex min-h-[64px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent/60", selected && "bg-accent")}
      >
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", nearest ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")} aria-hidden="true">
          <MapPin className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{s.name}</span>
          <span className="block truncate text-body-sm text-muted-foreground">
            {nearest ? "Nearest stop" : showRoute ? s.routeName : null}
          </span>
        </span>
        {s.km != null && <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">{fmtDist(s.km)}</span>}
        {selected && <Check className="h-5 w-5 shrink-0 text-primary" aria-label="Selected" />}
      </button>
    </li>
  );
}

/**
 * Pick the stop you get on at. "Nearby" lists every stop nearest first when
 * your location is known; "All stops" groups them by route. Search filters
 * both.
 */
export default function StopChooser({ routes, value, onChoose, userLoc, intro = true, companyName }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(userLoc ? "nearby" : "all");
  const { groups, flat, nearest } = useMemo(() => {
    const seen = new Set();
    const all = [];
    const gs = (routes || []).map((r) => {
      const stops = sortStops(r.stops)
        .filter((s) => !seen.has(s.name) && (seen.add(s.name), true))
        .map((s) => {
          const km = userLoc && s.lat != null ? haversineKm(userLoc.lat, userLoc.lng, s.lat, s.lng) : null;
          const row = { ...s, km, routeName: r.name || "Route" };
          all.push(row);
          return row;
        });
      return { id: r.id, name: r.name || "Route", stops };
    }).filter((g) => g.stops.length);
    const sorted = [...all].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return { groups: gs, flat: sorted, nearest: userLoc ? sorted[0]?.name : null };
  }, [routes, userLoc]);

  const needle = q.trim().toLowerCase();
  const match = (s) => !needle || s.name.toLowerCase().includes(needle);
  const total = flat.length;

  return (
    <div>
      {intro && (
        <div className="px-6 pb-4 pt-2 lg:px-0">
          {companyName && <p className="text-body-sm text-muted-foreground">{companyName}</p>}
          <h1 className="mt-1 text-headline font-bold">Choose a stop</h1>
          <p className="mt-1 text-body text-muted-foreground">Where do you get on? TransitTrack shows when your bus will arrive, and can tell you when it's one stop away.</p>
        </div>
      )}
      <div className="px-6 lg:px-0">
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search stops</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a stop" className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground" />
        </label>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Stop list">
          {[["nearby", "Nearby"], ["all", "All stops"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("h-10 rounded-lg text-body-sm font-semibold transition-colors", tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 lg:px-0" role="tabpanel">
        {total === 0 && <p className="px-2 text-body text-muted-foreground">This company hasn't added any stops yet.</p>}
        {tab === "nearby" && total > 0 && (
          <>
            {!userLoc && (
              <p className="flex items-center gap-2 px-2 pb-2 text-body-sm text-muted-foreground">
                <LocateFixed className="h-4 w-4 shrink-0" aria-hidden="true" /> Turn on location to sort stops by distance.
              </p>
            )}
            <ul className="space-y-0.5" aria-label="Stops near you">
              {flat.filter(match).map((s) => (
                <StopRow key={s.name} s={s} selected={s.name === value} nearest={s.name === nearest} onChoose={onChoose} showRoute />
              ))}
            </ul>
          </>
        )}
        {tab === "all" && groups.map((g) => {
          const stops = g.stops.filter(match);
          if (!stops.length) return null;
          return (
            <section key={g.id} className="pb-3" aria-label={g.name}>
              <h2 className="px-2 pb-1 text-body-sm font-semibold text-muted-foreground">{g.name}</h2>
              <ul className="space-y-0.5">
                {stops.map((s) => <StopRow key={s.name} s={s} selected={s.name === value} nearest={s.name === nearest} onChoose={onChoose} />)}
              </ul>
            </section>
          );
        })}
        {total > 0 && needle && !flat.some(match) && <p className="px-2 text-body text-muted-foreground">No stops match that search.</p>}
      </div>
    </div>
  );
}
