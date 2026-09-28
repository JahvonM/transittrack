import re, os
pat = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⬆↔-↪]")
for root, _, files in os.walk("src"):
    for fn in files:
        if not fn.endswith((".js", ".jsx")):
            continue
        p = os.path.join(root, fn)
        for i, line in enumerate(open(p, encoding="utf-8"), 1):
            if pat.search(line):
                print(f"{p}:{i}: {line.strip()[:160]}")
