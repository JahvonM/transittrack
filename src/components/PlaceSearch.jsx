import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { cn } from "@/lib/utils";

/**
 * Find a place by name and hand back its coordinates, so a stop or a location
 * can be placed by searching instead of typing latitude and longitude.
 * props: { onSelect({ name, address, lat, lng }), placeholder, proximity, autoFocus, className }
 */
export default function PlaceSearch({ onSelect, placeholder = "Search a place or address", proximity, autoFocus, className }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const seq = useRef(0);
  const near = proximity?.lat != null && proximity?.lng != null ? `${proximity.lng},${proximity.lat}` : "";

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults([]); setBusy(false); setOpen(false); return undefined; }
    const id = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: "6", language: "en" });
        if (near) params.set("proximity", near);
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?${params}`);
        const data = await res.json();
        if (id !== seq.current) return;
        setResults((data.features || []).map((f) => ({
          id: f.id,
          name: f.text || f.place_name,
          address: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
        })));
        setOpen(true);
      } catch {
        if (id === seq.current) { setResults([]); setOpen(true); }
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, near]);

  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (r) => {
    onSelect?.({ name: r.name, address: r.address, lat: r.lat, lng: r.lng });
    setQ("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          className="pl-8 pr-8"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-body-sm text-muted-foreground">{busy ? "Searching…" : "No places found. Try a town, hotel or landmark."}</li>
          ) : results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold">{r.name}</span>
                  <span className="block truncate text-caption text-muted-foreground">{r.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}