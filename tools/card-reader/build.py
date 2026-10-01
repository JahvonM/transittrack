"""Builds public/tools/TransitTrack-Card-Reader.bat from TTCardReader.cs.

The .bat is a batch/PowerShell hybrid: Windows runs the batch header, which
starts Windows PowerShell 5.1 on the same file; PowerShell sees the header as
a comment, compiles the embedded C# (Add-Type) and runs it. Nothing needs to
be installed. Run:  python3 tools/card-reader/build.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
cs = open(os.path.join(HERE, "TTCardReader.cs"), encoding="utf-8").read()
assert all(ord(ch) < 128 for ch in cs), "keep TTCardReader.cs ASCII-only (batch files dislike anything else)"
assert "\n'@" not in cs, "C# code must not contain a line starting with '@"

BAT = r"""<# : batch portion
@echo off
title TransitTrack Card Reader
set "TT_SELF=%~f0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:TT_SELF))"
if errorlevel 1 pause
goto :EOF
: end of batch portion #>

# ---------------------------------------------------------------------------
# TransitTrack Card Reader - connects an ACS ACR122U USB NFC reader to
# TransitTrack (Admin > Card issuing) in Chrome or Edge on this PC.
# Leave this window open (you can minimise it). Close it to stop.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
try { $Host.UI.RawUI.WindowTitle = 'TransitTrack Card Reader' } catch { }
Write-Host ''
Write-Host '  TransitTrack Card Reader' -ForegroundColor Green
Write-Host '  Connects the ACS ACR122U reader to TransitTrack in your browser.'
Write-Host '  Leave this window open - you can minimise it.'
Write-Host ''

$code = @'
__CSHARP__
'@
try {
  Add-Type -TypeDefinition $code -Language CSharp
} catch {
  Write-Host '  Windows would not start the card reader helper:' -ForegroundColor Red
  Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host '  If this is a work PC, ask IT to allow PowerShell scripts (Add-Type).'
  exit 1
}
if (-not [TTCardReader]::Start(8765, $env:TT_ORIGINS, ($env:TT_SIMULATE -eq '1'))) { Start-Sleep -Seconds 10; exit 0 }
Write-Host ''
Write-Host '  Ready. In Chrome or Edge open https://eager-transit-track-go.base44.app/admin/cards' -ForegroundColor Green
Write-Host '  and press Connect reader. If Chrome asks to allow access to apps on this device, choose Allow.'
Write-Host ''
# First run: offer to start automatically when Windows starts. (Asked after
# the helper is already listening, so the page connects even before answering.)
$installDir = Join-Path $env:APPDATA 'TransitTrack'
$installed = Join-Path $installDir 'TransitTrack-Card-Reader.bat'
$declined = Join-Path $installDir 'no-autostart'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'TransitTrack Card Reader.lnk'
# A newer download replaces the copy that starts with Windows.
if ($env:TT_SELF -and (Test-Path -LiteralPath $installed) -and $env:TT_SELF -ne $installed) {
  try { Copy-Item -LiteralPath $env:TT_SELF -Destination $installed -Force } catch { }
}
if ($env:TT_SELF -and -not $env:TT_NO_INSTALL -and -not (Test-Path -LiteralPath $shortcut) -and -not (Test-Path -LiteralPath $declined)) {
  $answer = Read-Host '  Start this helper automatically when Windows starts? (Y/N)'
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  if ($answer -match '^[Yy]') {
    if ($env:TT_SELF -ne $installed) { Copy-Item -LiteralPath $env:TT_SELF -Destination $installed -Force }
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($shortcut)
    $lnk.TargetPath = $installed
    $lnk.WorkingDirectory = $installDir
    $lnk.WindowStyle = 7
    $lnk.Save()
    Write-Host '  Done - it will start (minimised) every time you sign in to Windows.' -ForegroundColor Green
  } else {
    Set-Content -LiteralPath $declined -Value 'declined'
  }
  Write-Host ''
}

[TTCardReader]::Wait()
"""

out = BAT.replace("__CSHARP__", cs.strip("\n"))
out = out.replace("\r\n", "\n").replace("\n", "\r\n")
dest = os.path.join(ROOT, "public", "tools", "TransitTrack-Card-Reader.bat")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w", encoding="ascii", newline="") as f:
    f.write(out)
print("wrote", dest, len(out), "bytes")
