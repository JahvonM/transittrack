"""Compile-checks the C# embedded in the .bat (mono mcs, C# 5 like Windows
PowerShell 5.1's Add-Type) and builds a simulate-mode test binary.
Usage: python3 tools/card-reader/test_compile.py  ->  /tmp/ttreader.exe"""
import re, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bat = open(os.path.join(ROOT, "public/tools/TransitTrack-Card-Reader.bat"), encoding="ascii", newline="").read()
m = re.search(r"\$code = @'\r\n(.*?)\r\n'@", bat, re.S)
assert m, "embedded C# not found"
open("/tmp/embedded.cs", "w").write(m.group(1))
open("/tmp/Program.cs", "w").write(
    "public static class Program { public static void Main() { "
    "TTCardReader.Run(8765, System.Environment.GetEnvironmentVariable(\"TT_ORIGINS\"), true); } }\n")
r = subprocess.run(["mcs", "-langversion:5", "-warn:4", "-out:/tmp/ttreader.exe", "/tmp/embedded.cs", "/tmp/Program.cs"],
                   capture_output=True, text=True)
print(r.stdout, r.stderr)
sys.exit(r.returncode)
