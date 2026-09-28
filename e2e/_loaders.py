import re, subprocess
IMPORT = 'import BusLoader from "@/components/BusLoader";'
files = subprocess.check_output(["grep", "-rlE", r"<p className=\"[^\"]*\">Loading…</p>", "src"], text=True).split()
for f in files:
    if "MaintenanceQueue" in f:
        continue
    s = open(f).read()
    s = re.sub(r"<p className=\"[^\"]*\">Loading…</p>", '<BusLoader className="py-8" />', s)
    if "@/components/BusLoader" not in s:
        lines = s.split("\n")
        last = max(i for i, l in enumerate(lines) if l.startswith("import "))
        while not lines[last].rstrip().endswith(";"):
            last += 1
        lines.insert(last + 1, IMPORT)
        s = "\n".join(lines)
    open(f, "w").write(s)
    print("loader", f)
