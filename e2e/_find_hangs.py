import glob, re
# A screen can hang if it turns its spinner off only on success. Flag every
# setLoading(false) with no catch/finally/try nearby.
for path in sorted(glob.glob("src/**/*.jsx", recursive=True)):
    if "/ui/" in path:
        continue
    lines = open(path).read().split("\n")
    for i, line in enumerate(lines):
        if re.search(r"set\w*Loading\(false\)", line):
            window = "\n".join(lines[max(0, i - 25): i + 4])
            if not re.search(r"\.catch\(|finally|try\s*\{|catch\s*\(|catch\s*\{", window):
                print(f"{path}:{i+1}: {line.strip()[:120]}")
