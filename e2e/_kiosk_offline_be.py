p = 'base44/functions/kioskCheckIn/entry.ts'
s = open(p).read()
def rep(old, new):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, 1)

rep("""          card_tag: cardTag, status, boarded_at: new Date().toISOString(),""",
    """          card_tag: cardTag, status, boarded_at: occurredAt(body.occurred_at),""")

rep("""const VEHICLE_ONLY_ACTIONS""", """// A check-in saved on the tablet while offline carries the time it really
// happened; accept it if it's plausible (not in the future, not days old).
function occurredAt(value) {
  const t = value ? new Date(value).getTime() : NaN;
  const now = Date.now();
  if (Number.isFinite(t) && t <= now + 60_000 && t >= now - 72 * 3600_000) return new Date(t).toISOString();
  return new Date(now).toISOString();
}

const VEHICLE_ONLY_ACTIONS""")

rep("""      case 'lookup_tag': {""", """      // --- bus_boarding: the list a tablet keeps so cards and keypad codes
      // still work with no WiFi (refreshed every few minutes when online) ---
      case 'offline_directory': {
        if (!device) return Response.json({ error: 'Tablets only' }, { status: 403 });
        const directory = await loadStaffDirectory(base44, companyId);
        return Response.json({
          generated_at: new Date().toISOString(),
          staff: directory.map((s) => ({
            id: s.id, full_name: s.full_name, photo_url: s.photo_url || '',
            nfc_tag: s.nfc_tag || '', access_code: s.access_code || '',
            one_time_code: s.one_time_code || '', one_time_code_expires_at: s.one_time_code_expires_at || null,
          })),
        });
      }

      case 'lookup_tag': {""")
open(p, 'w').write(s)
print('ok')
