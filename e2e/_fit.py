p = 'src/components/driver/DriverTrackingDashboard.jsx'
s = open(p).read()
i = s.index('  return (\n    <div className="h-full min-h-0 flex flex-col gap-3 lg:grid')
s = s[:i] + '''  // Sized to the screen with nothing to scroll: landscape = map | panel,
  // portrait = map on top, two panel columns below. Lists show what fits and
  // open the rest in a sheet.
  return (
    <div className="h-full min-h-0 flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-3">
      <div className="flex-1 min-h-0 lg:h-full">
        <DriverNavMap session={session} invoke={invoke} fill pushLocation={false} pins={staffPins} />
      </div>

      <aside className="shrink-0 h-[44%] lg:h-full min-h-0 flex flex-col gap-2" aria-label="Driving controls">
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid gap-2 md:grid-cols-2 md:[grid-template-rows:minmax(0,1fr)] lg:flex lg:flex-col">
          <div className="flex flex-col gap-2 min-h-0 shrink-0">
            {panelTop}

            {/* passengers + tracking in one card */}
            <div className="p-3 rounded-2xl border bg-card space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <p className="flex-1 min-w-0 leading-tight">
                  <span className="text-xl font-bold">{occupancy}</span>
                  <span className="text-sm text-muted-foreground">{liveVehicle?.capacity ? ` / ${liveVehicle.capacity}` : ""} aboard</span>
                </p>
                <div className="flex items-center gap-1">
                  {liveVehicle?.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
                  {liveVehicle?.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
                  <Badge variant={sharing ? "default" : "secondary"}>
                    {sharing ? (<><Radio className="w-3 h-3 mr-1 animate-pulse" /> Tracking</>) : "Paused"}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {sharing ? (
                  <Button variant="outline" className="flex-1 h-11" onClick={stopTracking} disabled={locked}>
                    {locked ? <><Lock className="w-4 h-4 mr-2" /> Locked by dispatch</> : <><Navigation className="w-4 h-4 mr-2" /> Stop tracking</>}
                  </Button>
                ) : (
                  <Button className="flex-1 h-11" onClick={startTracking}><Navigation className="w-4 h-4 mr-2" /> Start tracking</Button>
                )}
                {onReportIncident && (
                  <Button variant="outline" className="h-11 px-3 text-destructive" onClick={onReportIncident} aria-label="Report an incident">
                    <AlertTriangle className="w-5 h-5" /><span className="hidden sm:inline ml-1.5">Report</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-h-[160px] md:min-h-0 lg:flex-1">
            {panelBottom}
            <div className="flex-1 min-h-[120px] md:min-h-0">
              <StaffRouteList staff={staff} vehicle={liveVehicle} nearbyStaff={nearbyStaff} onAttend={markAttended} compact />
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <SosButton vehicle={liveVehicle} invoke={invoke} compact />
        </div>
      </aside>
    </div>
  );
}
'''
open(p, 'w').write(s)

p = 'src/pages/DriverApp.jsx'
s = open(p).read()
old = '<DueInspectionsBanner due={dueInspections} onStart={(t) => openInspection(t, { from: "unlock" })} />\n                )}\n                <ShiftCard session={session} invoke={invoke} refresh={refresh} beforeStart={() => beforeShift("start_shift")} beforeEnd={() => beforeShift("end_shift")} />'
assert old in s
s = s.replace(old, '<DueInspectionsBanner compact due={dueInspections} onStart={(t) => openInspection(t, { from: "unlock" })} />\n                )}\n                <ShiftCard compact session={session} invoke={invoke} refresh={refresh} beforeStart={() => beforeShift("start_shift")} beforeEnd={() => beforeShift("end_shift")} />', 1)
old = '''              <DriverTrips
                trips={session.trips}'''
assert old in s
s = s.replace(old, '''              <DriverTrips
                compact
                trips={session.trips}''', 1)
# panel tops: keep the two cards as siblings (the panel column spaces them)
open(p, 'w').write(s)
print('ok')
