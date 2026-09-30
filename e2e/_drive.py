p = 'src/components/driver/DriverTrackingDashboard.jsx'
s = open(p).read()
s = s.replace('import MapboxMap from "@/components/MapboxMap";\n', 'import DriverNavMap from "@/components/driver/DriverNavMap";\n', 1)
s = s.replace('export default function DriverTrackingDashboard({ session, invoke, driverName, onReportIncident }) {',
              '''// The Drive screen: turn-by-turn map + everything the driver needs beside
// it, sized to the screen (no page scrolling). panelTop / panelBottom let the
// app put the shift card, due inspections and trips into the side panel.
export default function DriverTrackingDashboard({ session, invoke, onReportIncident, panelTop = null, panelBottom = null }) {''', 1)
i = s.index('  return (\n    <div className="space-y-3">\n      {/* compact status strip')
s = s[:i] + '''  const staffPins = staff
    .filter((s) => s.home_lat != null && !s.skip_pickup_today)
    .map((s) => ({ lat: s.home_lat, lng: s.home_lng, color: "#34d399", label: s.full_name }));
  const locked = !!liveVehicle?.remote_tracking_lock;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex-1 min-h-0 lg:h-full">
        <DriverNavMap session={session} invoke={invoke} fill pushLocation={false} pins={staffPins} />
      </div>

      <aside className="min-h-0 max-h-[46%] lg:max-h-none lg:h-full flex flex-col gap-3" aria-label="Driving controls">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 pr-0.5">
          {panelTop}

          {/* tracking + passengers in one card */}
          <div className="p-3 rounded-2xl border bg-card space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold leading-none">{occupancy}<span className="text-sm font-medium text-muted-foreground">{liveVehicle?.capacity ? ` / ${liveVehicle.capacity}` : ""}</span></p>
                <p className="text-xs text-muted-foreground mt-1">aboard right now</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={sharing ? "default" : "secondary"}>
                  {sharing ? (<><Radio className="w-3 h-3 mr-1 animate-pulse" /> Tracking</>) : "Paused"}
                </Badge>
                {liveVehicle?.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
                {liveVehicle?.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              {sharing ? (
                <Button variant="outline" className="flex-1 h-12" onClick={stopTracking} disabled={locked}>
                  {locked ? <><Lock className="w-4 h-4 mr-2" /> Locked by dispatch</> : <><Navigation className="w-4 h-4 mr-2" /> Stop tracking</>}
                </Button>
              ) : (
                <Button className="flex-1 h-12" onClick={startTracking}><Navigation className="w-4 h-4 mr-2" /> Start tracking</Button>
              )}
              {onReportIncident && (
                <Button variant="outline" className="h-12 px-3 text-destructive" onClick={onReportIncident} aria-label="Report an incident">
                  <AlertTriangle className="w-5 h-5" /><span className="hidden sm:inline ml-1.5">Report</span>
                </Button>
              )}
            </div>
          </div>

          {panelBottom}

          <StaffRouteList staff={staff} vehicle={liveVehicle} nearbyStaff={nearbyStaff} onAttend={markAttended} />
        </div>

        <div className="shrink-0">
          <SosButton vehicle={liveVehicle} invoke={invoke} />
        </div>
      </aside>
    </div>
  );
}
'''
open(p, 'w').write(s)
print('ok')
