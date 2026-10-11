$ErrorActionPreference = 'Stop'
# Build once on Windows. Installed desktops do not run PowerShell or Add-Type.
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw 'The Windows .NET Framework C# compiler is required to build the NFC helper.' }
$source = Join-Path $PSScriptRoot '..\tools\card-reader\TTCardReader.cs'
$output = Join-Path $PSScriptRoot 'native\TransitTrack-Card-Reader.exe'
$entry = Join-Path ([IO.Path]::GetTempPath()) ('tt-reader-entry-' + [Guid]::NewGuid().ToString('N') + '.cs')
try {
  [IO.File]::WriteAllText($entry, 'public static class DesktopReader { public static void Main() { TTCardReader.Run(8765, System.Environment.GetEnvironmentVariable("TT_ORIGINS"), System.Environment.GetEnvironmentVariable("TT_SIMULATE") == "1"); } }')
  & $csc /nologo /target:exe /platform:anycpu /optimize+ "/out:$output" $source $entry
  if ($LASTEXITCODE -ne 0) { throw 'NFC helper compilation failed.' }
} finally {
  Remove-Item -LiteralPath $entry -Force -ErrorAction SilentlyContinue
}
