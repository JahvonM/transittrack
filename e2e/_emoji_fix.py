import re

def add_lucide(s, names):
    m = re.search(r'import \{([^}]*)\} from "lucide-react";', s, re.S)
    if not m:
        return s.replace('import React', 'import { %s } from "lucide-react";\nimport React' % ", ".join(names), 1) if False else \
            re.sub(r'^(import React[^\n]*\n)', r'\1import { %s } from "lucide-react";\n' % ", ".join(names), s, count=1, flags=re.M)
    existing = [x.strip() for x in m.group(1).split(",") if x.strip()]
    for n in names:
        if n not in existing:
            existing.append(n)
    return s[:m.start()] + 'import { ' + ", ".join(existing) + ' } from "lucide-react";' + s[m.end():]

PREVIEW_OLD = '''  if (m.message_type === "image") return "📷 Photo";
  if (m.message_type === "audio") return "🎤 Voice note";'''
PREVIEW_NEW = '''  if (m.message_type === "image") return <><Camera className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Photo</>;
  if (m.message_type === "audio") return <><Mic className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Voice note</>;'''

for f in ["src/components/manager/CompanyMessages.jsx", "src/components/admin/FloatingMessages.jsx",
          "src/components/driver/DriverChats.jsx", "src/pages/MechanicPortal.jsx"]:
    s = open(f).read()
    assert PREVIEW_OLD in s, f
    s = s.replace(PREVIEW_OLD, PREVIEW_NEW)
    s, n = re.subn(r"`\$\{(.+?)\}: \$\{previewText\(last\)\}`", r"<>{\1}: {previewText(last)}</>", s)
    print(f, "template usages converted:", n)
    s = add_lucide(s, ["Camera", "Mic"])
    open(f, "w").write(s)

WAVE = '<Hand className="inline-block w-6 h-6 ml-1 -mt-1 text-primary tt-wave" aria-hidden="true" />'
for f in ["src/components/Greeting.jsx", "src/components/driver/DriverGreeting.jsx"]:
    s = open(f).read()
    assert "{name} 👋" in s, f
    s = s.replace("{name} 👋", "{name} " + WAVE)
    s = add_lucide(s, ["Hand"])
    open(f, "w").write(s)
    print("wave", f)

f = "src/components/MapboxMap.jsx"
s = open(f).read()
old = 'const VEHICLE_ICON = (type) =>\n  type === "taxi" ? "🚕" : "🚌";\n\n'
if s.count("VEHICLE_ICON") == 1 and old in s:
    s = s.replace(old, "")
    open(f, "w").write(s)
    print("removed unused VEHICLE_ICON")

css = open("src/index.css").read()
if "tt-wave" not in css:
    css += '''
/* Greeting hand wave */
@keyframes tt-wave-kf {
  0%, 60%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(14deg); }
  20% { transform: rotate(-8deg); }
  40% { transform: rotate(-4deg); }
  50% { transform: rotate(10deg); }
}
.tt-wave { transform-origin: 70% 70%; animation: tt-wave-kf 2.4s ease-in-out 0.4s 2; }
'''
    open("src/index.css", "w").write(css)
    print("css wave added")
