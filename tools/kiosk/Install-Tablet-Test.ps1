# Updates one USB-connected development tablet. Never uninstalls or clears app data.
[CmdletBinding()]
param([string]$Serial)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$buildConfig = Get-Content -Raw (Join-Path $projectRoot 'android\app\build.gradle')
$versionName = [regex]::Match($buildConfig, 'versionName\s+"([^"]+)"').Groups[1].Value
$versionCode = [regex]::Match($buildConfig, 'versionCode\s+(\d+)').Groups[1].Value
$apk = Join-Path $env:USERPROFILE "Downloads\McSween-Kiosk-$versionName-build-$versionCode-test.apk"
if (-not (Test-Path -LiteralPath $apk) -or -not (Test-Path -LiteralPath "$apk.sha256.txt")) {
    throw 'Run tools\kiosk\Prepare-Tablet-Test.ps1 first. The checked test APK and checksum are missing.'
}
$expectedHash = ((Get-Content -LiteralPath "$apk.sha256.txt" -Raw).Trim() -split '\s+')[0]
if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'APK checksum mismatch. Run preparation again; nothing has been installed.'
}
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'Android SDK adb.exe was not found. Install Android Studio Platform Tools.' }
$lines = @(& $adb devices)
if ($LASTEXITCODE -ne 0) { throw 'Cannot list Android devices.' }
$devices = @($lines | ForEach-Object { if ($_ -match '^([^\s]+)\s+device\s*$') { $Matches[1] } })
if ($Serial) {
    if ($Serial -notin $devices) { throw 'The chosen tablet is not connected and authorized. Check USB debugging on the tablet.' }
} else {
    if ($devices.Count -ne 1) { throw 'Connect exactly one authorized test tablet, or pass -Serial with its adb device ID.' }
    $Serial = $devices[0]
}
Write-Host "Updating tablet $Serial with kiosk $versionName / build $versionCode..."
& $adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) {
    throw 'Update failed. Existing data has not been cleared. For a signature mismatch use the original PC/signing environment; NEVER uninstall to bypass it.'
}
& $adb -s $Serial shell pm grant com.transittrack.app android.permission.WRITE_SECURE_SETTINGS
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'USB auto-accept setup was not granted. Enable McSween USB auto-accept manually in Android Accessibility.'
}
& $adb -s $Serial shell am start -W -n com.transittrack.app/.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'Update installed but launch failed. Open McSween Kiosk on the tablet.' }
Write-Host "Update installed. Confirm $versionName / build $versionCode in Admin after its heartbeat." -ForegroundColor Green
Write-Host 'Run the parked checklist in docs\kiosk-one-big-test.md. No uninstall, reset or re-pairing was performed.'
