import json, re, sys
for n in sys.argv[1:]:
    s = open(f"base44/entities/{n}.jsonc").read()
    s = re.sub(r"(?m)^\s*//.*$", "", s)
    d = json.loads(s)
    print(n, {k: (v.get("enum") or v.get("type")) for k, v in d["properties"].items()})
    print("  rls:", json.dumps(d.get("rls"))[:400])
