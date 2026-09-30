p = 'src/components/driver/SosButton.jsx'
s = open(p).read()
s = s.replace('export default function SosButton({ vehicle, invoke }) {',
              '// compact: a single-row button for the Drive screen side panel.\nexport default function SosButton({ vehicle, invoke, compact = false }) {', 1)
old = '''        className={`w-full rounded-2xl border-2 border-destructive/40 py-5 flex flex-col items-center gap-1 transition-all ${'''
assert old in s
s = s.replace(old, '''        className={`w-full rounded-2xl border-2 border-destructive/40 ${compact ? "py-3 px-4 flex flex-row items-center justify-center gap-3 text-left" : "py-5 flex flex-col items-center gap-1"} transition-all ${''', 1)
old = '''        <Siren className={`w-8 h-8 text-destructive ${holding ? "animate-ping" : ""}`} />
        <span className="font-bold text-destructive">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
        <span className="text-xs text-muted-foreground">'''
assert old in s
s = s.replace(old, '''        <Siren className={`${compact ? "w-7 h-7" : "w-8 h-8"} text-destructive shrink-0 ${holding ? "animate-ping" : ""}`} />
        {compact ? (
          <span className="flex flex-col">
            <span className="font-bold text-destructive leading-tight">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
            <span className="text-xs text-muted-foreground">
              {fired ? "Admin notified" : cooldown ? "Available again shortly…" : "Press and hold to activate"}
            </span>
          </span>
        ) : (<>
        <span className="font-bold text-destructive">{fired ? "SOS SENT" : holding ? "HOLD…" : "SOS"}</span>
        <span className="text-xs text-muted-foreground">''', 1)
old = '''          {fired ? "Admin notified · alert management below" : cooldown ? "Just cancelled — available again shortly…" : "Press and hold to activate"}
        </span>
      </button>'''
assert old in s
s = s.replace(old, '''          {fired ? "Admin notified · alert management below" : cooldown ? "Just cancelled — available again shortly…" : "Press and hold to activate"}
        </span>
        </>)}
      </button>''', 1)
open(p, 'w').write(s)

p = 'src/components/driver/DriverTrackingDashboard.jsx'
s = open(p).read()
old = '<SosButton vehicle={liveVehicle} invoke={invoke} />'
assert old in s
s = s.replace(old, '<SosButton vehicle={liveVehicle} invoke={invoke} compact />', 1)
open(p, 'w').write(s)

p = 'src/components/driver/DriverNavMap.jsx'
s = open(p).read()
h0 = s.index('      <div className="flex items-center justify-between gap-2 flex-wrap">')
h1 = s.index('      {route?.stops?.length > 1 && pos && (')
header = s[h0:h1]
b0 = header.index('        <div className="flex items-center gap-2">\n          <span className={`text-xs')
b1 = header.rindex('      </div>')
badges = header[b0:b1].rstrip()
# drop one indent level from the badges block for use as a const
badges_const = '\n'.join(ln[4:] if ln.startswith('    ') else ln for ln in badges.split('\n'))
s = s[:h0] + '      {!fill && (\n' + '\n'.join('  ' + ln if ln else ln for ln in header.rstrip('\n').split('\n')) + '\n      )}\n' + s[h1:]
anchor = '  return (\n    <div className={fill ? "h-full min-h-0 flex flex-col gap-2" : "space-y-3"}>'
assert anchor in s
s = s.replace(anchor, '''  // GPS + connection status: in the header normally, floating on the map
  // on the Drive screen (where the top bar already names the bus).
  const statusBadges = (
''' + badges_const + '''
  );

''' + anchor, 1)
s = s.replace(header.rstrip('\n')[b0:b1].rstrip() if False else badges, '{statusBadges}', 1)
old = '''        <button
          type="button"
          onClick={recenter}
          className={`absolute right-4 bottom-6 z-10'''
assert old in s
s = s.replace(old, '''        {fill && <div className="absolute left-3 bottom-8 z-10 [&>div]:flex-wrap">{statusBadges}</div>}
        <button
          type="button"
          onClick={recenter}
          className={`absolute right-4 bottom-6 z-10''', 1)
open(p, 'w').write(s)
print('ok')
