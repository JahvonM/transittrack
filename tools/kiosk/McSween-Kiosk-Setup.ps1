#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Worker,
    [switch]$SelfTest,
    [ValidateSet('CheckPC','UpdateMain','Build','FindDevices','DeviceInfo','Install','SetOwner','SetupNew','OpenKiosk','OpenStudio')]
    [string]$Action = 'CheckPC',
    [string]$ProjectPath = '',
    [string]$DeviceSerial = '',
    [string]$LogPath = '',
    [string]$ResultPath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Package = 'com.transittrack.app'
$script:AdminComponent = 'com.transittrack.app/.TransitDeviceAdminReceiver'
$script:SetupScript = $PSCommandPath
$script:Utf8 = [Text.UTF8Encoding]::new($false)

function Write-SetupLog([string]$Message) {
    if ($LogPath) {
        [IO.File]::AppendAllText($LogPath, $Message + [Environment]::NewLine, $script:Utf8)
    }
}
function Resolve-Program([string]$Name) {
    $found = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $found) { throw "$Name was not found. Install the prerequisite and reopen this setup app." }
    return $found.Source
}
function Get-AdbPath {
    $candidates = @()
    if ($env:ANDROID_HOME) { $candidates += Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe' }
    if ($env:ANDROID_SDK_ROOT) { $candidates += Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe' }
    $candidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return Resolve-Program 'adb.exe'
}
function Assert-CommandResult($Result, [string]$Label) {
    if ($Result.ExitCode -ne 0) {
        throw "$Label failed (exit $($Result.ExitCode)). See the output above. No following step was run."
    }
}
function Invoke-Native([string]$Program, [string[]]$Arguments, [string]$Label) {
    Write-SetupLog ('--- ' + $Label + ' ---')
    $lines = [Collections.Generic.List[string]]::new()
    $previousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 represents native stderr as ErrorRecord objects.
        # Compiler warnings must not terminate a successful native command.
        $ErrorActionPreference = 'Continue'
        & $Program @Arguments 2>&1 | ForEach-Object {
            $line = $_.ToString()
            $lines.Add($line)
            Write-SetupLog $line
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    return [pscustomobject]@{ ExitCode = $code; Lines = @($lines.ToArray()) }
}
function Invoke-Checked([string]$Program, [string[]]$Arguments, [string]$Label) {
    $result = Invoke-Native $Program $Arguments $Label
    Assert-CommandResult $result $Label
    return $result
}
function ConvertFrom-AdbDevices([string[]]$Lines) {
    foreach ($line in $Lines) {
        if ($line -match '^(\S+)\s+(device|unauthorized|offline)(?:\s+(.*))?$') {
            $serial = $Matches[1]; $state = $Matches[2]
            $model = ''
            if ($line -match '\bmodel:(\S+)') { $model = $Matches[1].Replace('_',' ') }
            [pscustomobject]@{
                Serial = $serial; State = $state; Model = $model
                Display = "$serial | $state | $model"
            }
        }
    }
}
function Read-Devices {
    $r = Invoke-Checked (Get-AdbPath) @('devices','-l') 'Find Android devices'
    return @(ConvertFrom-AdbDevices $r.Lines)
}
function Assert-SelectedDevice([string]$Serial, [object[]]$Devices) {
    if ([string]::IsNullOrWhiteSpace($Serial)) { throw 'Select a device first. Click Find devices, then choose its serial number.' }
    $matching = @($Devices | Where-Object { $_.Serial -ceq $Serial })
    if ($matching.Count -ne 1) { throw 'The selected device is no longer connected. Refresh the list and select it again.' }
    if ($matching[0].State -ne 'device') {
        throw "Device $Serial is $($matching[0].State). Unlock it and approve USB debugging, then refresh the list."
    }
}
function Assert-Connected([string]$Serial) {
    Assert-SelectedDevice $Serial @(Read-Devices)
}
function Invoke-Adb([string]$Serial, [string[]]$Arguments, [string]$Label) {
    return Invoke-Checked (Get-AdbPath) (@('-s',$Serial) + $Arguments) $Label
}
function Get-ProjectRoot([string]$Root) {
    if (-not $Root -or -not (Test-Path -LiteralPath $Root -PathType Container)) {
        throw 'Choose the transittrack project folder first.'
    }
    $resolved = (Resolve-Path -LiteralPath $Root).Path
    foreach ($relative in @('android\app\build.gradle','tools\kiosk\Prepare-Tablet-Test.ps1','tools\kiosk\Install-Tablet-Test.ps1','tools\kiosk\Kiosk-Java.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $resolved $relative) -PathType Leaf)) {
            throw "This is not the expected TransitTrack checkout: $relative is missing."
        }
    }
    return $resolved
}
function Get-ApkInfo([string]$Root) {
    $content = Get-Content -LiteralPath (Join-Path $Root 'android\app\build.gradle') -Raw
    $name = [regex]::Match($content,'versionName\s+"([^"]+)"').Groups[1].Value
    $code = [regex]::Match($content,'versionCode\s+(\d+)').Groups[1].Value
    if (-not $name -or -not $code) { throw 'Cannot determine the APK version from android/app/build.gradle.' }
    return [pscustomobject]@{
        Name=$name; Code=$code
        Path=(Join-Path $env:USERPROFILE "Downloads\McSween-Kiosk-$name-build-$code-test.apk")
    }
}
function Get-OwnerPackage([string[]]$Lines) {
    # Only an explicit device-owner section counts, never an active admin/profile owner.
    for ($i=0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match '^\s*(?:Device Owner|mDeviceOwner)\b') {
            if ($Lines[$i] -match '(?i)[:=]\s*(?:null|none)\s*$') { continue }
            for ($j=$i; $j -lt [Math]::Min($Lines.Count,$i+12); $j++) {
                if ($j -gt $i -and ($Lines[$j] -match '^\s*$' -or $Lines[$j] -match '^\s*(?:Profile Owner|Active admins|Enabled Device Admins)\b')) { break }
                if ($Lines[$j] -match 'ComponentInfo\{([^/\s}]+)/[^}]+\}') { return $Matches[1] }
                if ($Lines[$j] -match '^\s*package=([A-Za-z0-9_.]+)\s*$') { return $Matches[1] }
            }
        }
    }
    return ''
}
function Read-DeviceInfo([string]$Serial) {
    Assert-Connected $Serial
    $release = Invoke-Adb $Serial @('shell','getprop','ro.build.version.release') 'Android version'
    $api = Invoke-Adb $Serial @('shell','getprop','ro.build.version.sdk') 'Android API'
    $model = Invoke-Adb $Serial @('shell','getprop','ro.product.model') 'Device model'
    $package = Invoke-Adb $Serial @('shell','dumpsys','package',$script:Package) 'Installed kiosk version'
    $policy = Invoke-Adb $Serial @('shell','dumpsys','device_policy') 'Read Android ownership'
    $owner = Get-OwnerPackage $policy.Lines
    $version = [regex]::Match(($package.Lines -join [Environment]::NewLine),'versionName=([^\s]+)').Groups[1].Value
    if (-not $version) { $version = 'not installed / unavailable' }
    $apiNumber = 0
    [void][int]::TryParse(($api.Lines -join '').Trim(),[ref]$apiNumber)
    $ownerText = if ($owner -eq $script:Package) { 'McSween Kiosk' } elseif ($owner) { $owner } else { 'none detected; Android decides eligibility' }
    $summary = "$(($model.Lines -join '').Trim()) | Android $(($release.Lines -join '').Trim()) / API $apiNumber | Kiosk $version | Owner: $ownerText"
    Write-SetupLog $summary
    return [pscustomobject]@{ Summary=$summary; Api=$apiNumber; Owner=$owner; Version=$version }
}
function Assert-NoForeignOwner([string]$Owner) {
    if ($Owner -and $Owner -ne $script:Package) {
        throw "Another app is device owner: $Owner. This tool will not remove it, transfer ownership, or reset the device."
    }
}
function Install-Kiosk([string]$Root,[string]$Serial) {
    Assert-Connected $Serial
    $apk = Get-ApkInfo $Root
    if (-not (Test-Path -LiteralPath $apk.Path -PathType Leaf)) {
        throw "Build APK first. The expected file is missing: $($apk.Path)"
    }
    Write-SetupLog "Installing/updating kiosk $($apk.Name), build $($apk.Code), on $Serial."
    $r = Invoke-Checked (Join-Path $PSHOME 'powershell.exe') @(
        '-NoProfile','-ExecutionPolicy','Bypass','-File',
        (Join-Path $Root 'tools\kiosk\Install-Tablet-Test.ps1'),'-Serial',$Serial
    ) 'Install APK using the existing checksum-checked updater'
    return $apk
}
function Set-KioskOwner([string]$Serial) {
    $info = Read-DeviceInfo $Serial
    if ($info.Api -lt 26) { throw 'Full kiosk locking requires Android 8 / API 26 or newer.' }
    Assert-NoForeignOwner $info.Owner
    if ($info.Owner -eq $script:Package) { Write-SetupLog 'McSween Kiosk is already device owner. Ownership is unchanged.'; return }
    $path = Invoke-Adb $Serial @('shell','pm','path',$script:Package) 'Check kiosk installation'
    if (-not (($path.Lines -join '') -match 'package:')) { throw 'Install McSween Kiosk first.' }
    Write-SetupLog 'Requesting full managed-device ownership for the selected kiosk.'
    $r = Invoke-Adb $Serial @('shell','dpm','set-device-owner',$script:AdminComponent) 'Set McSween Kiosk as device owner'
    if (-not (($r.Lines -join [Environment]::NewLine) -match 'Success:\s*Device owner set')) {
        throw 'Android did not confirm ownership. Check its output above. No account removal, reset, or ownership transfer was attempted.'
    }
    Write-SetupLog 'Android confirmed device ownership. Open the native gear on the device and confirm Device management: ready.'
}
function Open-Kiosk([string]$Serial) {
    Assert-Connected $Serial
    $r = Invoke-Adb $Serial @('shell','am','start','-W','-n','com.transittrack.app/.MainActivity') 'Open kiosk'
    if (($r.Lines -join [Environment]::NewLine) -match '(?im)^\s*(Error:|Exception occurred)') {
        throw 'Android could not open McSween Kiosk. See its output above.'
    }
}
function Run-SetupAction([string]$Name,[string]$Root,[string]$Serial) {
    if ($Name -eq 'FindDevices') { return @{ Devices=@(Read-Devices); Summary='Select the intended device by serial number.' } }
    if ($Name -eq 'DeviceInfo') { return Read-DeviceInfo $Serial }
    if ($Name -eq 'SetOwner') { Set-KioskOwner $Serial; return @{ Summary='Ownership step completed. Confirm readiness on the device.' } }
    if ($Name -eq 'OpenKiosk') { Open-Kiosk $Serial; return @{ Summary='Kiosk launch requested.' } }
    $Root = Get-ProjectRoot $Root
    if ($Name -eq 'CheckPC') {
        $git=Resolve-Program 'git.exe'; $node=Resolve-Program 'node.exe'; $npm=Resolve-Program 'npm.cmd'; $adb=Get-AdbPath
        Write-SetupLog "Git: $git"; Write-SetupLog "Node: $node"; Write-SetupLog "npm: $npm"; Write-SetupLog "ADB: $adb"
        . (Join-Path $Root 'tools\kiosk\Kiosk-Java.ps1')
        $jdk = Find-KioskJdk -Candidates @(Get-KioskJdkCandidates)
        if (-not $jdk) { throw 'JDK 17 or 21 is required. Install a supported JDK, then reopen this tool. The build script will select it.' }
        Write-SetupLog "Supported JDK: $jdk"
        $apk=Get-ApkInfo $Root
        Write-SetupLog "Source APK version: $($apk.Name) / build $($apk.Code)"
        Write-SetupLog 'Use the original PC and signing environment for upgrades. This tool does not replace signing keys.'
        return @{ Summary="PC prerequisites found. APK source $($apk.Name) / build $($apk.Code)." }
    }
    if ($Name -eq 'UpdateMain') {
        $git=Resolve-Program 'git.exe'
        $status=Invoke-Checked $git @('-C',$Root,'status','--porcelain') 'Check for local changes'
        if (@($status.Lines | Where-Object { $_.Trim() }).Count -gt 0) { throw 'There are local changes. Save/commit them before updating. This tool will not discard or stash your work.' }
        $branch=Invoke-Checked $git @('-C',$Root,'branch','--show-current') 'Check current branch'
        if (($branch.Lines -join '').Trim() -ne 'main') { throw 'Update main requires the main branch. During PR review, use Build APK on the review branch. This tool does not switch branches.' }
        $origin=Invoke-Checked $git @('-C',$Root,'remote','get-url','origin') 'Check repository origin'
        if (($origin.Lines -join '').Trim() -notmatch '(?i)(?:github\.com[:/])JahvonM/transittrack(?:\.git)?/?$') {
            throw 'Origin is not the expected JahvonM/transittrack repository. No update was attempted.'
        }
        $r=Invoke-Checked $git @('-C',$Root,'pull','--ff-only','origin','main') 'Update main without merging or discarding work'
        return @{ Summary='Project updated. Reopen this setup app if the tool itself changed.' }
    }
    if ($Name -eq 'Build') {
        $r=Invoke-Checked (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Root 'tools\kiosk\Prepare-Tablet-Test.ps1'),'-NoOpen') 'Run checks and build APK'
        $apk=Get-ApkInfo $Root
        if (-not (Test-Path -LiteralPath $apk.Path -PathType Leaf)) { throw 'The build finished but the expected APK is missing.' }
        return @{ Summary="APK ready: $($apk.Path)" }
    }
    if ($Name -eq 'Install') {
        $apk=Install-Kiosk $Root $Serial
        return @{ Summary="Installed/updated kiosk $($apk.Name) / build $($apk.Code). Pairing and ownership were not reset." }
    }
    if ($Name -eq 'SetupNew') {
        $before=Read-DeviceInfo $Serial
        if ($before.Api -lt 26) { throw 'Full kiosk locking requires Android 8 / API 26 or newer.' }
        Assert-NoForeignOwner $before.Owner
        $apk=Install-Kiosk $Root $Serial
        try { Set-KioskOwner $Serial } catch { throw "APK installation completed, but ownership setup stopped: $($_.Exception.Message)" }
        Open-Kiosk $Serial
        return @{ Summary='Installation and ownership completed. On the device: pair it, set the exit code, connect Wi-Fi, then Start kiosk mode.' }
    }
    if ($Name -eq 'OpenStudio') {
        $npx=Resolve-Program 'npx.cmd'
        Push-Location $Root
        try { $r=Invoke-Checked $npx @('cap','open','android') 'Open the Android project in Android Studio' } finally { Pop-Location }
        return @{ Summary='Android Studio launch requested. Routine builds do not need this step.' }
    }
    throw "Unsupported action: $Name"
}
function ConvertTo-ProcessArgument([string]$Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped=[regex]::Replace($Value,'(\\*)"','$1$1\"')
    $escaped=[regex]::Replace($escaped,'(\\+)$','$1$1')
    return '"' + $escaped + '"'
}

function New-SetupWindow {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $script:Form=[Windows.Forms.Form]::new()
    $script:Form.Text='McSween Kiosk Setup'
    $script:Form.Size=[Drawing.Size]::new(1100,820)
    $script:Form.MinimumSize=[Drawing.Size]::new(960,720)
    $script:Form.StartPosition='CenterScreen'
    $script:Form.BackColor=[Drawing.Color]::FromArgb(11,16,24)
    $script:Form.ForeColor=[Drawing.Color]::FromArgb(238,242,246)
    $script:Form.Font=[Drawing.Font]::new('Segoe UI',10)
    $layout=[Windows.Forms.TableLayoutPanel]::new()
    $layout.Dock='Fill';$layout.Padding=[Windows.Forms.Padding]::new(22);$layout.ColumnCount=1;$layout.RowCount=9
    foreach($height in @(54,38,42,42,90,90,46,0,54)) {
        if($height -eq 0){$style=[Windows.Forms.RowStyle]::new([Windows.Forms.SizeType]::Percent,100)}
        else{$style=[Windows.Forms.RowStyle]::new([Windows.Forms.SizeType]::Absolute,$height)}
        [void]$layout.RowStyles.Add($style)
    }
    $script:Form.Controls.Add($layout)
    $title=[Windows.Forms.Label]::new();$title.Text='McSween Kiosk Setup';$title.Dock='Fill'
    $title.Font=[Drawing.Font]::new('Segoe UI',23,[Drawing.FontStyle]::Bold)
    $title.ForeColor=[Drawing.Color]::FromArgb(208,241,92);$layout.Controls.Add($title,0,0)
    $intro=[Windows.Forms.Label]::new();$intro.Text='Build once. Select a phone or tablet. Install, check ownership, and finish setup on its screen.'
    $intro.Dock='Fill';$layout.Controls.Add($intro,0,1)

    $folderRow=[Windows.Forms.TableLayoutPanel]::new();$folderRow.Dock='Fill';$folderRow.ColumnCount=2
    [void]$folderRow.ColumnStyles.Add([Windows.Forms.ColumnStyle]::new([Windows.Forms.SizeType]::Percent,100))
    [void]$folderRow.ColumnStyles.Add([Windows.Forms.ColumnStyle]::new([Windows.Forms.SizeType]::Absolute,120))
    $script:RootBox=[Windows.Forms.TextBox]::new();$script:RootBox.Dock='Fill';$script:RootBox.Text=$ProjectPath
    $script:RootBox.BackColor=[Drawing.Color]::FromArgb(18,25,35);$script:RootBox.ForeColor=[Drawing.Color]::White
    $script:BrowseButton=[Windows.Forms.Button]::new();$script:BrowseButton.Text='Project folder';$script:BrowseButton.Dock='Fill'
    $script:BrowseButton.ForeColor=[Drawing.Color]::FromArgb(11,16,24);$script:BrowseButton.BackColor=[Drawing.Color]::FromArgb(208,241,92)
    $script:BrowseButton.Add_Click({
        $dialog=[Windows.Forms.FolderBrowserDialog]::new()
        $dialog.Description='Select the transittrack project folder'
        if(Test-Path -LiteralPath $script:RootBox.Text){$dialog.SelectedPath=$script:RootBox.Text}
        if($dialog.ShowDialog($script:Form) -eq [Windows.Forms.DialogResult]::OK){$script:RootBox.Text=$dialog.SelectedPath}
        $dialog.Dispose()
    })
    $folderRow.Controls.Add($script:RootBox,0,0);$folderRow.Controls.Add($script:BrowseButton,1,0);$layout.Controls.Add($folderRow,0,2)

    $deviceRow=[Windows.Forms.TableLayoutPanel]::new();$deviceRow.Dock='Fill';$deviceRow.ColumnCount=2
    [void]$deviceRow.ColumnStyles.Add([Windows.Forms.ColumnStyle]::new([Windows.Forms.SizeType]::Percent,100))
    [void]$deviceRow.ColumnStyles.Add([Windows.Forms.ColumnStyle]::new([Windows.Forms.SizeType]::Absolute,120))
    $script:DeviceBox=[Windows.Forms.ComboBox]::new();$script:DeviceBox.Dock='Fill';$script:DeviceBox.DropDownStyle='DropDownList'
    $script:DeviceBox.DisplayMember='Display'
    $script:DeviceBox.BackColor=[Drawing.Color]::FromArgb(18,25,35);$script:DeviceBox.ForeColor=[Drawing.Color]::White
    $script:RefreshButton=[Windows.Forms.Button]::new();$script:RefreshButton.Text='Find devices';$script:RefreshButton.Dock='Fill'
    $script:RefreshButton.ForeColor=[Drawing.Color]::FromArgb(11,16,24);$script:RefreshButton.BackColor=[Drawing.Color]::FromArgb(208,241,92)
    $script:RefreshButton.Add_Click({Start-SetupAction 'FindDevices'})
    $deviceRow.Controls.Add($script:DeviceBox,0,0);$deviceRow.Controls.Add($script:RefreshButton,1,0);$layout.Controls.Add($deviceRow,0,3)

    $script:ActionButtons=[Collections.Generic.List[Windows.Forms.Button]]::new()
    $rows=@(
        @(@('Check PC','CheckPC'),@('Update main','UpdateMain'),@('Build APK','Build'),@('Open Android Studio','OpenStudio')),
        @(@('Check device','DeviceInfo'),@('Install / Update APK','Install'),@('Set device owner','SetOwner'),@('Set up new device','SetupNew'),@('Open kiosk','OpenKiosk'))
    )
    for($i=0;$i -lt $rows.Count;$i++){
        $panel=[Windows.Forms.FlowLayoutPanel]::new();$panel.Dock='Fill';$panel.WrapContents=$true
        foreach($entry in $rows[$i]){
            $button=[Windows.Forms.Button]::new();$button.Text=$entry[0];$button.Tag=$entry[1]
            $button.Size=[Drawing.Size]::new(158,54);$button.Margin=[Windows.Forms.Padding]::new(0,10,10,6)
            $button.FlatStyle='Flat';$button.BackColor=[Drawing.Color]::FromArgb(208,241,92);$button.ForeColor=[Drawing.Color]::FromArgb(11,16,24)
            $button.Add_Click({param($sender,$eventArgs) Start-SetupAction ([string]$sender.Tag)})
            $script:ActionButtons.Add($button);$panel.Controls.Add($button)
        }
        $layout.Controls.Add($panel,0,(4+$i))
    }
    $script:StatusLabel=[Windows.Forms.Label]::new();$script:StatusLabel.Text='Ready. Enable USB debugging and approve this PC on the connected device.'
    $script:StatusLabel.Dock='Fill';$script:StatusLabel.AutoEllipsis=$true;$layout.Controls.Add($script:StatusLabel,0,6)
    $script:OutputBox=[Windows.Forms.RichTextBox]::new();$script:OutputBox.Dock='Fill';$script:OutputBox.ReadOnly=$true
    $script:OutputBox.BackColor=[Drawing.Color]::FromArgb(18,25,35);$script:OutputBox.ForeColor=[Drawing.Color]::FromArgb(225,232,240)
    $script:OutputBox.Font=[Drawing.Font]::new('Consolas',9);$script:OutputBox.WordWrap=$false;$layout.Controls.Add($script:OutputBox,0,7)
    $footer=[Windows.Forms.Label]::new();$footer.Dock='Fill';$footer.Text='Use the original signing PC. No uninstall, data clearing, factory reset, account removal, or hidden-API policy changes.'
    $footer.ForeColor=[Drawing.Color]::FromArgb(170,184,199);$footer.Padding=[Windows.Forms.Padding]::new(0,10,0,0);$layout.Controls.Add($footer,0,8)
    $script:ActiveJob=$null
    $script:PollTimer=[Windows.Forms.Timer]::new();$script:PollTimer.Interval=600
    $script:PollTimer.Add_Tick({Read-SetupProgress})
    $script:Form.Add_FormClosing({
        param($sender,$eventArgs)
        if($null -ne $script:ActiveJob){
            $eventArgs.Cancel=$true
            [void][Windows.Forms.MessageBox]::Show($script:Form,'An operation is still running. Wait for its result before closing.','Operation in progress')
        }
    })
    return $script:Form
}
function Set-SetupBusy([bool]$Busy){
    foreach($b in $script:ActionButtons){$b.Enabled=-not $Busy}
    $script:RootBox.Enabled=-not $Busy;$script:BrowseButton.Enabled=-not $Busy
    $script:RefreshButton.Enabled=-not $Busy;$script:DeviceBox.Enabled=-not $Busy
}
function Start-SetupAction([string]$Name){
    if($null -ne $script:ActiveJob){return}
    $serial=''
    if($null -ne $script:DeviceBox.SelectedItem){$serial=[string]$script:DeviceBox.SelectedItem.Serial}
    if($Name -in @('DeviceInfo','Install','SetOwner','SetupNew','OpenKiosk') -and -not $serial){
        $script:StatusLabel.Text='Select a device first. Click Find devices and choose its serial number.';return
    }
    try{
        $directory=Join-Path $env:LOCALAPPDATA 'McSween\KioskSetup\Logs'
        [void][IO.Directory]::CreateDirectory($directory)
        $stem=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N')
        $log=Join-Path $directory ($stem+'.log');$result=Join-Path $directory ($stem+'.json')
        [IO.File]::WriteAllText($log,'',$script:Utf8)
        $arguments=@('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',$script:SetupScript,'-Worker','-Action',$Name,
            '-ProjectPath',$script:RootBox.Text,'-DeviceSerial',$serial,'-LogPath',$log,'-ResultPath',$result)
        $info=[Diagnostics.ProcessStartInfo]::new()
        $info.FileName=Join-Path $PSHOME 'powershell.exe'
        $info.Arguments=($arguments|ForEach-Object{ConvertTo-ProcessArgument ([string]$_)}) -join ' '
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true
        $process=[Diagnostics.Process]::new();$process.StartInfo=$info
        $script:OutputBox.Clear()
        $script:OutputBox.AppendText("Action: $Name | Device: $serial"+[Environment]::NewLine+"Log: $log"+[Environment]::NewLine)
        $script:StatusLabel.Text="Running $Name. Keep the selected device connected."
        Set-SetupBusy $true
        if(-not $process.Start()){throw 'The operation could not start.'}
        $script:ActiveJob=@{Process=$process;Log=$log;Result=$result;Seen=0;Action=$Name;Serial=$serial}
        $script:PollTimer.Start()
    }catch{
        $script:StatusLabel.Text=$_.Exception.Message;Set-SetupBusy $false
    }
}
function Read-SetupProgress{
    if($null -eq $script:ActiveJob){return}
    $job=$script:ActiveJob
    try{
        $stream=[IO.File]::Open($job.Log,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
        $reader=[IO.StreamReader]::new($stream,$script:Utf8)
        try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()}
        if($text.Length -gt $job.Seen){
            $script:OutputBox.AppendText($text.Substring($job.Seen));$job.Seen=$text.Length
            $script:OutputBox.SelectionStart=$script:OutputBox.TextLength;$script:OutputBox.ScrollToCaret()
        }
    }catch{}
    if(-not $job.Process.HasExited){return}
    $script:PollTimer.Stop()
    try{
        if(-not(Test-Path -LiteralPath $job.Result)){throw 'The operation closed without a result. Check the log, fix the reported issue, and retry.'}
        $result=Get-Content -LiteralPath $job.Result -Raw|ConvertFrom-Json
        $script:StatusLabel.Text=[string]$result.Message
        $script:StatusLabel.ForeColor=if($result.Success){[Drawing.Color]::FromArgb(208,241,92)}else{[Drawing.Color]::FromArgb(255,160,145)}
        if($result.Success -and $job.Action -eq 'FindDevices'){
            $script:DeviceBox.Items.Clear()
            $items=@($result.Data.Devices)
            foreach($device in $items){[void]$script:DeviceBox.Items.Add($device)}
            $authorized=@($items|Where-Object{$_.State -eq 'device'})
            # Never silently select one device out of several attached devices.
            if($items.Count -eq 1 -and $authorized.Count -eq 1){$script:DeviceBox.SelectedIndex=0}
        }
    }catch{$script:StatusLabel.Text=$_.Exception.Message}
    finally{
        $job.Process.Dispose();$script:ActiveJob=$null;Set-SetupBusy $false
    }
}

function Assert-TestEqual($Expected,$Actual,[string]$Name){
    if($Expected -cne $Actual){throw "FAILED: $Name. Expected [$Expected], got [$Actual]."}
}
function Assert-TestThrows([scriptblock]$Test,[string]$Name){
    $thrown=$false
    try{& $Test|Out-Null}catch{$thrown=$true}
    if(-not $thrown){throw "FAILED: $Name did not stop."}
}
function Invoke-SetupSelfTest{
    $tokens=$null;$parseErrors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($script:SetupScript,[ref]$tokens,[ref]$parseErrors)
    if($parseErrors.Count -gt 0){throw ($parseErrors|Out-String)}
    $devices=@(ConvertFrom-AdbDevices @(
        'List of devices attached',
        'usb-one device product:test model:Test_Tablet transport_id:1',
        'phone-two unauthorized transport_id:2',
        'phone-three offline'
    ))
    Assert-TestEqual 3 $devices.Count 'device list count'
    Assert-TestEqual 'Test Tablet' $devices[0].Model 'device model'
    Assert-SelectedDevice 'usb-one' $devices
    Assert-TestThrows {Assert-SelectedDevice '' $devices} 'empty selection'
    Assert-TestThrows {Assert-SelectedDevice 'missing' $devices} 'disconnected device'
    Assert-TestThrows {Assert-SelectedDevice 'phone-two' $devices} 'unauthorized device'
    Assert-TestThrows {Assert-SelectedDevice 'phone-three' $devices} 'offline device'
    Assert-TestEqual 'com.transittrack.app' (Get-OwnerPackage @('Device Owner:','  admin=ComponentInfo{com.transittrack.app/com.transittrack.app.TransitDeviceAdminReceiver}','  User ID: 0')) 'device owner'
    Assert-TestEqual '' (Get-OwnerPackage @('Active admins:','  ComponentInfo{com.transittrack.app/com.transittrack.app.TransitDeviceAdminReceiver}','Profile Owner (User 10):','  admin=ComponentInfo{other.app/.Admin}')) 'admin/profile owner is not device owner'
    Assert-TestEqual '' (Get-OwnerPackage @('Device Owner: null','Active admins:','  ComponentInfo{com.transittrack.app/.TransitDeviceAdminReceiver}')) 'null owner is not active admin'
    Assert-TestEqual 'other.app' (Get-OwnerPackage @('Device Owner (User 0):','  admin=ComponentInfo{other.app/.Admin}')) 'foreign owner'
    Assert-TestThrows {Assert-NoForeignOwner 'other.app'} 'foreign owner is preserved'
    Assert-NoForeignOwner 'com.transittrack.app'
    Assert-TestThrows {Assert-CommandResult ([pscustomobject]@{ExitCode=1}) 'test command'} 'failed commands stop'
    Assert-TestEqual 'abc' (ConvertTo-ProcessArgument 'abc') 'simple argument'
    Assert-TestEqual '""' (ConvertTo-ProcessArgument '') 'empty argument'
    Assert-TestEqual '"C:\Program Files\tool.ps1"' (ConvertTo-ProcessArgument 'C:\Program Files\tool.ps1') 'spaced path'
    Assert-TestEqual '"a\"b"' (ConvertTo-ProcessArgument 'a"b') 'embedded quote'
    Assert-TestEqual '"C:\Folder with space\\"' (ConvertTo-ProcessArgument 'C:\Folder with space\') 'trailing backslash'
    # Exercise the actual Windows PowerShell -File argument transport used by GUI workers.
    $probeDirectory=Join-Path ([IO.Path]::GetTempPath()) ('McSween setup test '+[guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($probeDirectory)
    $probeProcess=$null
    try{
        $probePath=Join-Path $probeDirectory 'argument probe.ps1'
        $probeOutput=Join-Path $probeDirectory 'result.json'
        $probeSource='param([string]$First,[AllowEmptyString()][string]$Empty,[string]$Last,[string]$OutputFile)'+[Environment]::NewLine+
            '[IO.File]::WriteAllText($OutputFile,(@{First=$First;Empty=$Empty;Last=$Last}|ConvertTo-Json))'
        [IO.File]::WriteAllText($probePath,$probeSource,$script:Utf8)
        $probeArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$probePath,'-First','C:\Folder with space\','-Empty','','-Last','a"b','-OutputFile',$probeOutput)
        $probeInfo=[Diagnostics.ProcessStartInfo]::new()
        $probeInfo.FileName=Join-Path $PSHOME 'powershell.exe'
        $probeInfo.Arguments=($probeArguments|ForEach-Object{ConvertTo-ProcessArgument ([string]$_)}) -join ' '
        $probeInfo.UseShellExecute=$false;$probeInfo.CreateNoWindow=$true
        $probeInfo.RedirectStandardOutput=$true;$probeInfo.RedirectStandardError=$true
        $probeProcess=[Diagnostics.Process]::new();$probeProcess.StartInfo=$probeInfo
        if(-not $probeProcess.Start()){throw 'Argument probe could not start.'}
        if(-not $probeProcess.WaitForExit(20000)){throw 'Argument probe timed out.'}
        if($probeProcess.ExitCode -ne 0){throw ('Argument probe failed: '+$probeProcess.StandardError.ReadToEnd())}
        $probeResult=Get-Content -LiteralPath $probeOutput -Raw|ConvertFrom-Json
        Assert-TestEqual 'C:\Folder with space\' $probeResult.First 'real worker spaced path'
        Assert-TestEqual '' $probeResult.Empty 'real worker empty parameter'
        Assert-TestEqual 'a"b' $probeResult.Last 'real worker embedded quote'
    }finally{
        if($null -ne $probeProcess){
            if(-not $probeProcess.HasExited){$probeProcess.Kill()}
            $probeProcess.Dispose()
        }
        Remove-Item -LiteralPath $probeDirectory -Recurse -Force
    }
    # Construct the real UI without displaying it or launching any device worker.
    $window=New-SetupWindow
    try{
        Assert-TestEqual 9 $script:ActionButtons.Count 'UI action count'
        Assert-TestEqual 'DropDownList' ($script:DeviceBox.DropDownStyle.ToString()) 'explicit device selection'
        Assert-TestEqual $null $script:ActiveJob 'UI construction has no operation side effect'
        Start-SetupAction 'Install'
        Assert-TestEqual $null $script:ActiveJob 'install without selection cannot start a worker'
        if($script:StatusLabel.Text -notlike 'Select a device first*'){throw 'Missing selection was not explained.'}
    }finally{$script:PollTimer.Dispose();$window.Dispose()}
    Write-Output 'PASS: PowerShell syntax, USB selection, owner parsing, stop-on-error, real worker argument transport, and Windows Forms construction.'
}

if($env:OS -ne 'Windows_NT'){throw 'This setup app requires Windows PowerShell 5.1 on Windows.'}
if(-not $ProjectPath){
    $relative=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    if(Test-Path -LiteralPath (Join-Path $relative 'android\app\build.gradle')){$ProjectPath=$relative}
    else{$ProjectPath=Join-Path $env:USERPROFILE 'StudioProjects\transittrack'}
}
if($SelfTest){Invoke-SetupSelfTest;exit 0}
if($Worker){
    if(-not $LogPath -or -not $ResultPath){throw 'Worker log and result paths are required.'}
    $success=$false;$data=$null;$message=''
    try{
        $data=Run-SetupAction $Action $ProjectPath $DeviceSerial
        $message=[string]$data.Summary;$success=$true
        Write-SetupLog ('SUCCESS: '+$message)
    }catch{
        $message=$_.Exception.Message
        Write-SetupLog ('STOPPED: '+$message)
        Write-SetupLog 'Do not uninstall, reset, remove accounts, or change signing keys to bypass this error.'
    }
    $payload=[pscustomobject]@{Success=$success;Message=$message;Data=$data}
    [IO.File]::WriteAllText($ResultPath,($payload|ConvertTo-Json -Depth 8),$script:Utf8)
    if($success){exit 0}else{exit 1}
}
if([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA'){throw 'Launch Start-Kiosk-Setup.cmd, or start this script with powershell.exe -STA.'}
$window=New-SetupWindow
try{[void]$window.ShowDialog()}finally{$script:PollTimer.Dispose();$window.Dispose()}
