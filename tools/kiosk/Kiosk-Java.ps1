# These functions read local JDK metadata; they do not install or change Java globally.
function Get-KioskJdkMajor {
    param([string]$HomePath)
    if ([string]::IsNullOrWhiteSpace($HomePath)) { return 0 }
    $HomePath = $HomePath.Trim('"')
    if (-not (Test-Path (Join-Path $HomePath 'bin/java.exe')) -or -not (Test-Path (Join-Path $HomePath 'bin/javac.exe'))) { return 0 }
    $releaseFile = Join-Path $HomePath 'release'
    if (-not (Test-Path $releaseFile)) { return 0 }
    $release = Get-Content -Raw $releaseFile -ErrorAction SilentlyContinue
    if (-not $release) { return 0 }
    $version = [regex]::Match($release, '(?m)^JAVA_VERSION="([0-9]+)[^"]*"')
    if (-not $version.Success) { return 0 }
    return [int]$version.Groups[1].Value
}
function Find-KioskJdk {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        $major = Get-KioskJdkMajor $candidate
        if ($major -in @(17, 21)) { return (Resolve-Path $candidate.Trim('"')).Path }
    }
    return $null
}
function Get-KioskJdkCandidates {
    if ($env:JAVA_HOME) { $env:JAVA_HOME }
    if ($env:ProgramFiles) {
        Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'
        foreach ($root in @('Microsoft', 'Eclipse Adoptium', 'Java', 'Amazon Corretto')) {
            Get-ChildItem -Path (Join-Path $env:ProgramFiles $root) -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
        }
    }
    if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs/Android Studio/jbr' }
    if ($env:USERPROFILE) {
        Get-ChildItem -Path (Join-Path $env:USERPROFILE '.jdks') -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    }
    $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($javaCommand) { Split-Path (Split-Path $javaCommand.Source -Parent) -Parent }
}
