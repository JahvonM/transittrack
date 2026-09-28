import re

def sub(f, old, new):
    s = open(f).read()
    assert old in s, (f, old[:70])
    open(f, "w").write(s.replace(old, new, 1))

f = "src/components/admin/AdminShell.jsx"
s = open(f).read()
m = re.search(r'import \{([^}]*)\} from "lucide-react";', s, re.S)
names = [x.strip() for x in m.group(1).split(",") if x.strip()]
for n in ["Timer", "ScrollText"]:
    if n not in names:
        names.append(n)
s = s[:m.start()] + "import {\n  " + ",\n  ".join(names) + ",\n} from \"lucide-react\";" + s[m.end():]
open(f, "w").write(s)
sub(f, '  { id: "sync", label: "Fleet sync", icon: RefreshCw, group: "Fleet Operations" },',
    '  { id: "shifts", label: "Driver shifts", icon: Timer, group: "Fleet Operations" },\n  { id: "sync", label: "Fleet sync", icon: RefreshCw, group: "Fleet Operations" },')
sub(f, '  { id: "data", label: "Data manager", icon: Database, group: "Admin" },',
    '  { id: "audit", label: "Change history", icon: ScrollText, group: "Admin" },\n  { id: "data", label: "Data manager", icon: Database, group: "Admin" },')

f = "src/pages/Admin.jsx"
sub(f, 'import BusLoader from "@/components/BusLoader";',
    'import BusLoader from "@/components/BusLoader";\nimport ShiftsTab from "@/components/admin/ShiftsTab";\nimport AuditLogTab from "@/components/admin/AuditLogTab";')
sub(f, '        {section === "sync" && <FleetSyncTab />}',
    '        {section === "sync" && <FleetSyncTab />}\n        {section === "shifts" && <ShiftsTab />}\n        {section === "audit" && <AuditLogTab />}')
print("sections ok")
