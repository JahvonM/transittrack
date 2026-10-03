def sub(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b, 1)
    open(p, 'w').write(s)

sub('src/pages/StaffPortal.jsx', [
    ('import { haversineKm, etaMinutes } from "@/lib/geo";', 'import { haversineKm, etaMinutes } from "@/lib/geo";\nimport useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";'),
    ('''  const approachingRoute = approaching ? routes.find((r) => r.id === approaching.v.route_id) || null : null;
''', '''  const approachingRoute = approaching ? routes.find((r) => r.id === approaching.v.route_id) || null : null;
  // Better still: how long this bus really takes from here to your stop,
  // learned from its past trips (used once enough of the way is known).
  const travelTimes = useTravelTimes();
  const approachingLearned = useMemo(
    () => (approaching ? etaFromLearned(travelTimes[approaching.v.route_id], approachingRoute, approaching.v, stop) : null),
    [approaching, approachingRoute, travelTimes, stop]
  );
'''),
    ('eta={approaching ? approachingDriving : null}', 'eta={approaching ? approachingLearned || approachingDriving : null}'),
])

sub('src/components/staff/NextBusCard.jsx', [
    ('<p className="text-xs text-muted-foreground mt-2">{eta?.isDriving ? "Live estimate by road" : "Approximate estimate"}</p>',
     '''<p className="text-xs text-muted-foreground mt-2">
                  {eta?.isLearned
                    ? `Based on ${eta.trips || "past"} real trip${eta.trips === 1 ? "" : "s"} on this route`
                    : eta?.isDriving ? "Live estimate by road" : "Approximate estimate"}
                </p>'''),
])

sub('src/components/RouteExplorer.jsx', [
    ('import { haversineKm, etaMinutes, formatEta, fetchDrivingRoute } from "@/lib/geo";', 'import { haversineKm, etaMinutes, formatEta, fetchDrivingRoute } from "@/lib/geo";\nimport useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";'),
    ('''  const route = routes.find((r) => r.id === routeId) || routes[0];
''', '''  const route = routes.find((r) => r.id === routeId) || routes[0];
  const travelTimes = useTravelTimes();
'''),
    ('''      onRoute.forEach((v) => {
        const mins = etaMinutes(haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng), v.speed || 25);
        if (mins != null && (best == null || mins < best.mins)) best = { v, mins };
      });
      return { stop, order: i, best };
    });
  }, [route, vehicles]);''', '''      onRoute.forEach((v) => {
        // Real trips first (only buses still heading to this stop), else a
        // straight-line guess that the road estimate below refines.
        const learned = etaFromLearned(travelTimes[route.id], route, v, stop);
        const mins = learned ? learned.mins : etaMinutes(haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng), v.speed || 25);
        if (mins != null && (best == null || mins < best.mins)) best = { v, mins, learned: !!learned };
      });
      return { stop, order: i, best };
    });
  }, [route, vehicles, travelTimes]);'''),
    ('    const candidates = rows.filter((r) => r.best);', '    const candidates = rows.filter((r) => r.best && !r.best.learned);'),
    ('                const mins = driving ? driving.durationMin : best?.mins;', '                const mins = best?.learned ? best.mins : driving ? driving.durationMin : best?.mins;'),
    ('''<span className="block text-xs text-muted-foreground truncate">Next: {best.v.name}</span>''', '''<span className="block text-xs text-muted-foreground truncate">Next: {best.v.name}{best.learned ? " · from real trips" : ""}</span>'''),
    ('''Times are estimates based on each vehicle's current driving distance to the stop, following roads where available.''', '''Where buses have driven this route enough, times come from their real past trips at this time of day; otherwise from the driving distance to the stop.'''),
])
print("ok")
