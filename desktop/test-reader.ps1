$ErrorActionPreference = 'Stop'
# Windows CI protocol smoke test; never touches a physical reader.
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = Join-Path $PSScriptRoot 'native\TransitTrack-Card-Reader.exe'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.EnvironmentVariables['TT_SIMULATE'] = '1'
$proc = [Diagnostics.Process]::Start($info)
try {
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    if ($proc.HasExited) { throw 'Compiled NFC helper exited before becoming ready.' }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8765/status' -Headers @{Origin='https://app.mcsweenstransport.com'} -TimeoutSec 2
      $status = $response.Content | ConvertFrom-Json
      if ($status.type -eq 'status' -and $status.simulate -eq $true -and $status.reader -match 'simulated') { $ready = $true; break }
    } catch { if ($proc.HasExited) { throw } }
  }
  if (-not $ready) { throw 'Compiled NFC helper failed the local status protocol check.' }
  Write-Host 'Compiled Windows NFC helper protocol check passed (simulation, no hardware).'
} finally {
  if (-not $proc.HasExited) { $proc.Kill(); $proc.WaitForExit() }
  $proc.Dispose()
}
