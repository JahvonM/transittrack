def sub(f, old, new, count=1):
    s = open(f).read()
    assert old in s, (f, old[:70])
    open(f, "w").write(s.replace(old, new, count))

# Map accent follows the chosen colour theme (and light/dark).
sub("src/lib/mapbox.js",
    'export const mapAccentFor = (isDark) => (isDark ? "#D6F54A" : "#5E7A0A");',
    '// Follows the chosen colour theme; isDark is kept in the signature so callers\n'
    '// re-read it whenever the theme (class or accent) changes.\n'
    'export const mapAccentFor = (isDark) => accentHex(isDark);')
s = open("src/lib/mapbox.js").read()
if 'from "@/lib/accents"' not in s:
    s = 'import { accentHex } from "@/lib/accents";\n' + s
    open("src/lib/mapbox.js", "w").write(s)

# On-trip glow uses the accent too.
sub("src/lib/vehicleStatus.js", "export function statusColor(status) {\n  return STATUS_COLORS[status] || STATUS_COLORS.on_trip;\n}",
    "export function statusColor(status) {\n  if (!status || status === \"on_trip\") return accentHex();\n  return STATUS_COLORS[status] || accentHex();\n}")
s = open("src/lib/vehicleStatus.js").read()
if 'from "@/lib/accents"' not in s:
    s = 'import { accentHex } from "@/lib/accents";\n' + s
    open("src/lib/vehicleStatus.js", "w").write(s)

# Anything watching the theme also re-renders when the accent changes.
sub("src/lib/useTheme.js", 'obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });',
    'obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-accent"] });')

# Illustrated bus stripe/headsign follow the accent.
f = "src/components/AnimatedBus.jsx"
s = open(f).read()
s = s.replace('fill="#D6F54A" fillOpacity="0.55"', 'style={{ fill: "hsl(var(--primary))" }} fillOpacity="0.55"')
s = s.replace('fill="#D6F54A"', 'style={{ fill: "hsl(var(--primary))" }}')
open(f, "w").write(s)

# Saved accent on the account wins on a new device.
f = "src/lib/AuthContext.jsx"
sub(f, "import { setAuditActor } from '@/lib/auditLog';",
    "import { setAuditActor } from '@/lib/auditLog';\nimport { ACCENT_KEY, applyAccent } from '@/lib/accents';")
sub(f, "      setAuditActor(currentUser);\n",
    "      setAuditActor(currentUser);\n"
    "      try {\n"
    "        if (currentUser?.theme_accent && !localStorage.getItem(ACCENT_KEY)) applyAccent(currentUser.theme_accent);\n"
    "      } catch { /* storage blocked */ }\n")
print("wired")
