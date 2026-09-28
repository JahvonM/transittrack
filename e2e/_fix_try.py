import re, subprocess
files = subprocess.check_output(["git", "diff", "--name-only"], text=True).split()
for f in files:
    s = open(f).read()
    s2 = re.sub(r"(?m)^( *)try \{ {2,}(?=\S)", lambda m: m.group(1) + "try {\n" + m.group(1) + "  ", s)
    if s2 != s:
        open(f, "w").write(s2)
        print("fixed", f)
