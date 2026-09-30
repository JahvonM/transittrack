import re
def edit(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    open(path, 'w').write(s)

# --- kioskCheckIn: drop register_badge (cards are issued in Admin > Card issuing),
#     keypad codes only from an admin session.
p = 'base44/functions/kioskCheckIn/entry.ts'
s = open(p).read()
i = s.index("      // --- badge_registry (kiosk or admin app): link a fresh NFC tap to a")
j = s.index("      // --- front_desk: visitor sign-in with a captured signature ---")
s = s[:i] + s[j:]
s = s.replace("""      // --- badge_registry (kiosk or admin app): generate a persistent access
      // code for a staff member, to be written down/handed to them (typed on
      // the bus boarding kiosk's keypad in place of an NFC tap) ---
      case 'generate_access_code': {
        const { staff_id } = body;""", """      // --- admin app (Staff Directory): generate a persistent access code for
      // a staff member, typed on the bus boarding kiosk's keypad in place of
      // an NFC tap. (NFC cards are issued in Admin > Card issuing.) ---
      case 'generate_access_code': {
        if (device) return Response.json({ error: 'Keypad codes are managed by admins' }, { status: 403 });
        const { staff_id } = body;""", 1)
assert "case 'register_badge'" not in s
open(p, 'w').write(s)

# --- Kiosk page: badge registry mode retired
edit('src/pages/Kiosk.jsx', [
    ('import BadgeRegistryKiosk from "@/components/kiosk/BadgeRegistryKiosk";\n', ''),
    ('  badge_registry: { label: "Badge / QR registry", icon: CreditCard },', '  badge_registry: { label: "Retired kiosk mode", icon: CreditCard },'),
    ('          {device?.kiosk_type === "badge_registry" && <BadgeRegistryKiosk invoke={invoke} />}',
     '''          {device?.kiosk_type === "badge_registry" && (
            <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2 shadow-xl">
              <CreditCard className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="text-xl font-semibold">This kiosk mode has been retired</p>
              <p className="text-muted-foreground max-w-md mx-auto">
                Staff cards are now issued by an administrator in Admin → Card issuing. Ask your administrator to switch this tablet to
                <b> Bus boarding</b> in Admin → Kiosk tablets.
              </p>
            </div>
          )}'''),
])

# --- Kiosk setup dialog: no more badge registry option
edit('src/components/admin/KioskDeviceDialog.jsx', [
    ('  { value: "badge_registry", label: "Badge / QR registry" },\n', ''),
])
s = open('src/components/admin/KioskDeviceDialog.jsx').read()
m = re.search(r'setKioskType\((device\?\.kiosk_type[^)]*)\);', s)
assert m, 'setKioskType in effect not found'
s = s.replace(m.group(0), 'setKioskType(device?.kiosk_type && device.kiosk_type !== "badge_registry" ? device.kiosk_type : "bus_boarding");', 1)
open('src/components/admin/KioskDeviceDialog.jsx', 'w').write(s)

edit('src/components/admin/KioskTablets.jsx', [
    ('  badge_registry: { label: "Badge registry", icon: CreditCard },', '  badge_registry: { label: "Retired mode - edit to switch to Bus boarding", icon: CreditCard },'),
])
print('ok')
