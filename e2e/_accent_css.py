# Appends the colour-theme CSS blocks to src/index.css (idempotent).
ACCENTS = {
    # id: (dark primary, light primary, light accent tint)
    "ocean": ("199 89% 60%", "201 96% 32%", "199 80% 93%"),
    "sunset": ("25 95% 60%", "17 88% 40%", "25 90% 93%"),
    "rose": ("340 85% 68%", "336 70% 40%", "340 80% 94%"),
    "violet": ("262 83% 74%", "262 60% 50%", "262 80% 95%"),
    "mint": ("158 64% 52%", "161 94% 24%", "158 60% 92%"),
    "gold": ("45 96% 58%", "32 95% 34%", "45 90% 92%"),
}
f = "src/index.css"
s = open(f).read()
if "/* Colour themes" in s:
    raise SystemExit("already there")
out = ["", "/* Colour themes (Account → Appearance). Lime is the default in :root/.light above. */", "@layer base {"]
for name, (dark, light, tint) in ACCENTS.items():
    out.append(f'  html[data-accent="{name}"] {{')
    out.append(f"    --primary: {dark}; --ring: {dark}; --chart-1: {dark};")
    out.append(f"    --sidebar-primary: {dark}; --sidebar-ring: {dark};")
    out.append("  }")
    out.append(f'  html.light[data-accent="{name}"] {{')
    out.append(f"    --primary: {light}; --ring: {light}; --chart-1: {light};")
    out.append(f"    --sidebar-primary: {light}; --sidebar-ring: {light}; --accent: {tint};")
    out.append("  }")
out.append("}")
marker = "@layer base {\n  * {"
i = s.index(marker)
s = s[:i] + "\n".join(out).lstrip("\n") + "\n\n" + s[i:]
open(f, "w").write(s)
print("css ok")

h = "index.html"
s = open(h).read()
old = '          root.classList.add(t);\n'
new = old + '          var a = localStorage.getItem("tt-accent");\n          if (a) root.setAttribute("data-accent", a);\n'
if 'tt-accent' not in s:
    assert old in s
    s = s.replace(old, new, 1)
    open(h, "w").write(s)
print("boot ok")
