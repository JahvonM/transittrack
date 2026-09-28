import json, re, sys
for n in sys.argv[1:]:
    s = open(f"base44/entities/{n}.jsonc").read()
    s = re.sub(r"(?m)^\s*//.*$", "", s)
    p = json.loads(s)["properties"]
    print(n, {k: (v.get("enum") or v.get("type")) for k, v in p.items()})
