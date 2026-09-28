import re

jobs = [
    ("src/components/admin/MaintenanceScheduleTab.jsx",
     'if (!window.confirm("Delete this schedule?")) return;',
     'if (!(await confirmAction({ title: "Delete this schedule?", description: "This maintenance schedule will be removed." }))) return;', None),
    ("src/components/admin/InspectionTemplatesTab.jsx",
     'const removeSection = (idx) => {\n    if (!window.confirm("Delete this whole section and its items?")) return;',
     'const removeSection = async (idx) => {\n    if (!(await confirmAction({ title: "Delete this section?", description: "The section and all of its items will be removed from this template." }))) return;', None),
    ("src/components/admin/InspectionTemplatesTab.jsx",
     'if (!window.confirm("Delete this template? This can\'t be undone.")) return;',
     'if (!(await confirmAction({ title: "Delete this template?", description: "This can\'t be undone." }))) return;', None),
    ("src/components/admin/PartsTab.jsx",
     'if (!window.confirm("Delete this part?")) return;',
     'if (!(await confirmAction({ title: "Delete this part?", description: "It will be removed from your parts inventory." }))) return;', None),
    ("src/pages/StaffDirectory.jsx",
     'if (!window.confirm(`Delete ${c.name}?`)) return;',
     'if (!(await confirmAction({ title: `Delete ${c.name}?`, description: "This contact will be removed from the directory." }))) return;', None),
]
for path, old, new, _ in jobs:
    s = open(path).read()
    assert old in s, (path, old)
    s = s.replace(old, new, 1)
    if 'components/ConfirmHost' not in s:
        m = re.search(r'^import [^\n]*;\n', s, re.M)
        s = s[:m.end()] + 'import { confirmAction } from "@/components/ConfirmHost";\n' + s[m.end():]
    open(path, 'w').write(s)
    print("ok", path)
