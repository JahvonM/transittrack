import React, { useEffect, useMemo, useState } from "react";
import { Hourglass, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import BusLoader from "@/components/BusLoader";
import EmptyState from "@/components/EmptyState";
import { bucketOf, legKey, routeCoverage, stopKey, typicalSeconds } from "@/lib/travelTimes";

const fmt = (s) => {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
const DAY = { wd: "weekdays", sa: "Saturdays", su: "Sundays" };
const bucketLabel = (b) => {
  const h = Number(b.slice(2));
  const t = (x) => new Date(2000, 0, 1, x).toLocaleTimeString([], { hour: "numeric" });
  return `${DAY[b.slice(0, 2)]} ${t(h)}–${t((h + 1) % 24)}`;
};

// Admin → Fleet management → Travel times: what the app has learned about how
// long buses really take between stops, from their own GPS history.
export default function TravelTimesTab() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState(null);
  const [learned, setLearned] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, t] = await Promise.all([
      base44.entities.Route.list("name", 500).catch(() => []),
      base44.entities.RouteTravelTimes.list("-learned_at", 500).catch(() => []),
    ]);
    setRoutes(r || []);
    setLearned(Object.fromEntries((t || []).map((x) => [x.route_id, x])));
  };
  useEffect(() => { load(); }, []);

  const learnNow = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("learnTravelTimes", {});
      const list = res.data?.routes || [];
      toast({
        title: res.data?.skipped ? "Already updated a moment ago" : "Travel times updated",
        description: list.length ? list.map((r) => `${r.route}: ${r.legs} stop-to-stop trips`).join(" · ") : res.data?.skipped || "No routes with buses assigned yet.",
      });
      await load();
    } catch (e) {
      toast({ title: "Couldn't update travel times", description: e?.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const bucket = bucketOf(Date.now());

  if (!routes) return <BusLoader className="py-12" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="text-foreground font-medium">ETAs from your own buses</p>
          <p>
            Every night the app looks at the last 6 weeks of GPS from each bus and learns how long it really takes between
            the stops on its route, for each hour of the day. Passengers then see ETAs from those real trips instead of a map
            estimate. The more the buses drive with tracking on, the better it gets.
          </p>
        </div>
        <Button onClick={learnNow} disabled={busy} className="shrink-0">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${busy ? "animate-spin" : ""}`} /> {busy ? "Learning…" : "Learn now"}
        </Button>
      </div>

      {routes.length === 0 ? (
        <EmptyState text="No routes yet. Add a route with its stops in Route planner first." />
      ) : (
        routes.map((route) => (
          <RouteCard key={route.id} route={route} record={learned[route.id]} bucket={bucket} />
        ))
      )}
    </div>
  );
}

function RouteCard({ route, record, bucket }) {
  const stops = useMemo(
    () => [...(route.stops || [])].filter((s) => s?.lat != null && s?.lng != null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [route]
  );
  const cov = routeCoverage(record, stops);
  const status = cov.total === 0 ? null : cov.learned === cov.total ? "Learned" : cov.learned ? "Partly learned" : "Learning";

  return (
    <section className="rounded-2xl border bg-card overflow-hidden" aria-label={`Travel times for ${route.name}`}>
      <header className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
        <Hourglass className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">{route.name}</h3>
        {status && (
          <Badge variant={cov.learned === cov.total ? "default" : "secondary"}>
            {status} · {cov.learned}/{cov.total} legs
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {record ? `${record.leg_samples || 0} trips between stops · ${record.vehicles_used || 0} bus${record.vehicles_used === 1 ? "" : "es"} · updated ${when(record.learned_at)}` : "Not learned yet"}
        </span>
      </header>
      {stops.length < 2 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">This route needs at least two stops.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">From → to</th>
                <th className="px-3 py-2 font-medium">Now <span className="font-normal">({bucketLabel(bucket)})</span></th>
                <th className="px-3 py-2 font-medium">Usually</th>
                <th className="px-3 py-2 font-medium">Slow days</th>
                <th className="px-3 py-2 font-medium text-right">Trips</th>
              </tr>
            </thead>
            <tbody>
              {stops.slice(0, -1).map((a, i) => {
                const b = stops[i + 1];
                const entry = record?.legs?.[legKey(a, b)];
                const wait = record?.dwells?.[stopKey(b)]?.all;
                const now = typicalSeconds(entry, bucket);
                return (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">
                      <span className="font-medium">{a.name || `Stop ${i + 1}`}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{b.name || `Stop ${i + 2}`}</span>
                      {wait?.median > 0 && <span className="block text-xs text-muted-foreground">then waits about {fmt(wait.median)} at {b.name || "the stop"}</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{now != null ? fmt(now) : <span className="text-muted-foreground">learning…</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(entry?.all?.median)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{entry?.all?.p80 != null ? `up to ${fmt(entry.all.p80)}` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-right">{entry?.all?.n || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
