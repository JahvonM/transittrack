p = 'src/components/driver/DriverNavMap.jsx'
s = open(p).read()
if 'TripProgress' not in s:
    s = s.replace('import MapBusPin, { useFacingRight } from "@/components/MapBusPin";',
                  'import MapBusPin, { useFacingRight } from "@/components/MapBusPin";\nimport TripProgress from "@/components/TripProgress";', 1)
    anchor = '      <div className="relative rounded-2xl overflow-hidden border h-[72vh]">'
    assert s.count(anchor) == 1
    block = ('      {route?.stops?.length > 1 && pos && (\n'
             '        <TripProgress\n'
             '          stops={[...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))}\n'
             '          lat={pos.lat}\n'
             '          lng={pos.lng}\n'
             '          label={route.name || "Your route"}\n'
             '        />\n'
             '      )}\n')
    s = s.replace(anchor, block + anchor, 1)
    open(p, 'w').write(s)

p = 'src/components/RouteExplorer.jsx'
s = open(p).read()
if 'TripProgress' not in s:
    s = s.replace('import { haversineKm, etaMinutes, formatEta, fetchDrivingRoute } from "@/lib/geo";',
                  'import { haversineKm, etaMinutes, formatEta, fetchDrivingRoute } from "@/lib/geo";\nimport TripProgress from "@/components/TripProgress";', 1)
    s = s.replace('  const route = routes.find((r) => r.id === routeId) || routes[0];\n',
                  '  const route = routes.find((r) => r.id === routeId) || routes[0];\n'
                  '  const liveBus = route ? vehicles.find((v) => v.route_id === route.id && v.current_lat != null) : null;\n', 1)
    anchor = '            <ol className="space-y-2">'
    assert s.count(anchor) == 1
    block = ('            {liveBus && (\n'
             '              <TripProgress stops={route.stops} lat={liveBus.current_lat} lng={liveBus.current_lng} label={liveBus.name + " on " + (route.name || "this route")} />\n'
             '            )}\n')
    s = s.replace(anchor, block + anchor, 1)
    open(p, 'w').write(s)

# Empty states: swap plain "No ... yet" lines for the parked-bus EmptyState.
swaps = {
    'src/components/admin/CompletedTripsTab.jsx': [('<p className="text-sm text-muted-foreground">No completed trips yet.</p>', '<EmptyState text="No completed trips yet." />')],
    'src/components/admin/CheckInLog.jsx': [
        ('<p className="text-sm text-muted-foreground">No check-ins recorded yet.</p>', '<EmptyState text="No check-ins recorded yet." />'),
        ('<p className="text-sm text-muted-foreground">No visitor sign-ins recorded yet.</p>', '<EmptyState text="No visitor sign-ins recorded yet." />'),
    ],
    'src/components/admin/AdsTab.jsx': [('<p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl">No ads yet.</p>', '<div className="border rounded-2xl"><EmptyState text="No ads yet." /></div>')],
    'src/components/admin/CompaniesTab.jsx': [('<p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl">No companies yet.</p>', '<div className="border rounded-2xl"><EmptyState text="No companies yet." /></div>')],
    'src/components/admin/FloatingMessages.jsx': [('<p className="text-sm text-muted-foreground text-center py-10 px-4">No vehicles yet.</p>', '<EmptyState text="No vehicles yet." />')],
    'src/components/manager/CompanyMessages.jsx': [('<p className="text-sm text-muted-foreground text-center py-10 px-4">No vehicles yet.</p>', '<EmptyState text="No vehicles yet." />')],
    'src/components/manager/FleetAnalytics.jsx': [('<p className="text-sm text-muted-foreground py-6 text-center">No trip data yet.</p>', '<EmptyState text="No trip data yet." />')],
    'src/pages/DrivingReports.jsx': [('<p className="text-sm text-muted-foreground py-8 text-center">No vehicles yet.</p>', '<EmptyState text="No vehicles yet." />')],
    'src/pages/DriverSchedule.jsx': [
        ('<p className="text-sm text-muted-foreground">No shifts scheduled for today.</p>', '<EmptyState text="No shifts scheduled for today." />'),
        ('<p className="text-sm text-muted-foreground">No upcoming shifts.</p>', '<EmptyState text="No upcoming shifts." />'),
    ],
    'src/pages/RouteAnalytics.jsx': [('<p className="text-muted-foreground">No routes yet.</p>', '<EmptyState text="No routes yet." />')],
    'src/pages/DriverProfile.jsx': [('<p className="text-muted-foreground">No vehicles assigned.</p>', '<EmptyState text="No vehicles assigned." />')],
}
import re
for path, pairs in swaps.items():
    s = open(path).read()
    changed = 0
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new)
            changed += 1
    if changed and 'components/EmptyState' not in s:
        m = re.search(r'^import [^\n]*\n', s, re.M)
        s = s[:m.end()] + 'import EmptyState from "@/components/EmptyState";\n' + s[m.end():]
    open(path, 'w').write(s)
    print(path, changed, "of", len(pairs))
print("done")
