# Run from the existing Windows checkout. Uses the existing Android signing environment.
[CmdletBinding()]
param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $projectRoot
try {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js, then reopen PowerShell.' }
    . (Join-Path $PSScriptRoot 'Kiosk-Java.ps1')
    $foundJdk = Find-KioskJdk -Candidates @(Get-KioskJdkCandidates)
    if (-not $foundJdk) {
        throw 'This build requires JDK 17 or 21. Install JDK 17 with: winget install --exact --id Microsoft.OpenJDK.17 . Then rerun this script. Java 25 cannot run Gradle 8.13.'
    }
    $env:JAVA_HOME = $foundJdk
    $env:PATH = (Join-Path $foundJdk 'bin') + [IO.Path]::PathSeparator + $env:PATH
    Write-Host "Using Java $(Get-KioskJdkMajor $foundJdk): $foundJdk"
    Write-Host 'For Android Studio builds, choose this same path under Settings > Build Tools > Gradle > Gradle JDK.'
    if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
        $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
        if (Test-Path $defaultSdk) { $env:ANDROID_HOME = $defaultSdk }
    }
    Write-Host '1/4 Installing the exact locked web dependencies...'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Fix the displayed error before continuing.' }
    Write-Host '2/4 Building the web app...'
    & npm.cmd run build:supabase
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed. No installation attempted.' }
    Write-Host '3/4 Syncing the integrated Android project...'
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed. No installation attempted.' }
    Write-Host '4/4 Running native tests and building the test APK...'
    # JAVA_HOME above selects the verified JDK. Passing its spaced path again as
    # a -D argument through gradlew.bat breaks quoting in Windows PowerShell 5.1.
    & (Join-Path $projectRoot 'android\gradlew.bat') -p (Join-Path $projectRoot 'android') :app:compileKioskDebugJavaWithJavac :app:testKioskDebugUnitTest :app:assembleKioskDebug --no-daemon --max-workers=1
    if ($LASTEXITCODE -ne 0) { throw 'Native checks failed. No installation attempted.' }
    Write-Host ''
    Write-Host 'CHECKS PASSED: test APK built. Update using the same signing identity as the tablet.' -ForegroundColor Green
    Write-Host 'In Android Studio, use your existing Run/signing configuration. Do not uninstall or create a replacement key.'
    $buildConfig = Get-Content -Raw (Join-Path $projectRoot 'android\app\build.gradle')
    $versionName = [regex]::Match($buildConfig, 'versionName\s+"([^"]+)"').Groups[1].Value
    $versionCode = [regex]::Match($buildConfig, 'versionCode\s+(\d+)').Groups[1].Value
    $apkSource = Join-Path $projectRoot 'android\app\build\outputs\apk\kiosk\debug\app-kiosk-debug.apk'
    if (-not (Test-Path -LiteralPath $apkSource -PathType Leaf)) { throw 'Gradle completed but the test APK was not found.' }
    $downloadDir = Join-Path $env:USERPROFILE 'Downloads'
    New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
    $apkDestination = Join-Path $downloadDir "McSween-Kiosk-$versionName-build-$versionCode-test.apk"
    Copy-Item -LiteralPath $apkSource -Destination $apkDestination -Force
    $apkHash = (Get-FileHash -LiteralPath $apkDestination -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$apkDestination.sha256.txt" -Value "$apkHash  $([IO.Path]::GetFileName($apkDestination))" -Encoding ASCII
    Write-Host "Test APK saved: $apkDestination" -ForegroundColor Green
    Write-Host 'This is a development test APK using your local debug signing identity, not a store release.'
    Write-Host 'Install over the existing app only. If Android reports a signature mismatch, stop; do not uninstall.'
    Write-Host "After installation confirm Admin shows kiosk $versionName / build $versionCode."
    Write-Host 'Then run once: adb shell pm grant com.transittrack.app android.permission.WRITE_SECURE_SETTINGS  (lets USB auto-accept switch itself on, like the Helper)'
    Write-Host 'Checklist: docs\kiosk-one-big-test.md'
    Write-Host 'This script has not installed an APK, changed the tablet, published the web app, or created a signing key.'
    if (-not $NoOpen) {
        & npx.cmd cap open android
        if ($LASTEXITCODE -ne 0) { throw 'Checks passed, but Android Studio did not open. Open the android folder manually.' }
    }
}
finally { Pop-Location }
