p = 'src/components/driver/DriverNavMap.jsx'
s = open(p).read()

def rep(old, new):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, 1)

rep('export default function DriverNavMap({ session, invoke }) {',
    '''// fill: take the parent's full height (the combined Drive screen).
// pushLocation: send GPS to the server itself — off on the Drive screen,
// where the tracking panel owns location sharing (and its Paused state).
// pins: extra points such as staff pickup spots.
export default function DriverNavMap({ session, invoke, fill = false, pushLocation: shouldPush = true, pins = [] }) {''')
rep('if (now - lastPush.current >= GPS_INTERVAL_MS) { lastPush.current = now; pushLocation(p.coords.latitude, p.coords.longitude); }',
    'if (shouldPush && now - lastPush.current >= GPS_INTERVAL_MS) { lastPush.current = now; pushLocation(p.coords.latitude, p.coords.longitude); }')
rep('''  }, [vehicleId, pushLocation]);''', '''  }, [vehicleId, pushLocation, shouldPush]);''')
rep('''    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">''',
    '''    <div className={fill ? "h-full min-h-0 flex flex-col gap-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2 flex-wrap">''')
rep('<div className="relative rounded-2xl overflow-hidden border h-[72vh]">',
    '<div className={`relative rounded-2xl overflow-hidden border ${fill ? "flex-1 min-h-[220px]" : "h-[72vh]"}`}>')
rep('''            stops={nextStop ? [{ ...nextStop, color: "#10b981" }] : []}''',
    '''            stops={nextStop ? [{ ...nextStop, color: "#10b981" }] : []}
            pins={pins}''')
rep('''          {nextStop && (
              <Marker longitude={nextStop.lng} latitude={nextStop.lat} anchor="center">''',
    '''          {pins.filter((p) => p.lat != null && p.lng != null).map((p, i) => (
              <Marker key={`pin-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: p.color || "#34d399" }} title={p.label} />
              </Marker>
            ))}
            {nextStop && (
              <Marker longitude={nextStop.lng} latitude={nextStop.lat} anchor="center">''')
open(p, 'w').write(s)
print('ok')
