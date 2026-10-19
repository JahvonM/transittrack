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
    if ($env:VITE_BASE44_APP_ID -and $env:VITE_BASE44_APP_ID -ne '6a98b192be27b5f9635020ba') { throw 'This PowerShell session points to another app. Open a new session for the TransitTrack checkout.' }
    if (-not $env:VITE_BASE44_APP_ID) { $env:VITE_BASE44_APP_ID = '6a98b192be27b5f9635020ba' }
    if (-not $env:VITE_BASE44_APP_BASE_URL) { $env:VITE_BASE44_APP_BASE_URL = 'https://eager-transit-track-go.base44.app' }
    Write-Host '1/4 Installing the exact locked web dependencies...'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Fix the displayed error before continuing.' }
    Write-Host '2/4 Building the web app...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed. No installation attempted.' }
    Write-Host '3/4 Syncing the integrated Android project...'
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed. No installation attempted.' }
    Write-Host '4/4 Compiling native code and running its unit tests...'
    & (Join-Path $projectRoot 'android\gradlew.bat') -p (Join-Path $projectRoot 'android') "-Dorg.gradle.java.home=$env:JAVA_HOME" :app:compileDebugJavaWithJavac :app:testDebugUnitTest --no-daemon --max-workers=1
    if ($LASTEXITCODE -ne 0) { throw 'Native checks failed. No installation attempted.' }
    Write-Host ''
    Write-Host 'READY: install one update using the same signing identity as the tablet.' -ForegroundColor Green
    Write-Host 'In Android Studio, use your existing Run/signing configuration. Do not uninstall or create a replacement key.'
    $buildConfig = Get-Content -Raw (Join-Path $projectRoot 'android\app\build.gradle')
    $versionName = [regex]::Match($buildConfig, 'versionName\s+"([^"]+)"').Groups[1].Value
    $versionCode = [regex]::Match($buildConfig, 'versionCode\s+(\d+)').Groups[1].Value
    Write-Host "After installation confirm Admin shows kiosk $versionName / build $versionCode."
    Write-Host 'Checklist: docs\kiosk-one-big-test.md'
    Write-Host 'This script has not installed an APK, changed the tablet, published the web app, or created a signing key.'
    if (-not $NoOpen) {
        & npx.cmd cap open android
        if ($LASTEXITCODE -ne 0) { throw 'Checks passed, but Android Studio did not open. Open the android folder manually.' }
    }
}
finally { Pop-Location }
