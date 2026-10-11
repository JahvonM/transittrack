@echo off
setlocal
cd /d "%~dp0"
title TransitTrack tablet setup
color 1F

rem ===== Filled in by the app for one specific tablet (empty = ask) =====
set PRESET_TYPE=
set PRESET_CODE=
set PRESET_BUS=
set PRESET_NAME=
rem The TransitTrack Helper is built into the end of this file by the app.
set HELPER_VERSION=
set HELPER_SHA256=

rem ===== Credentials are entered locally for this tablet; never embed them here. =====
set PIN=
set APIKEY=
set SITE=https://eager-transit-track-go.base44.app
set HOTSPOT_PREFIX=TT-BUS
set HELPER=com.transittrack.kioskhelper
set FK=com.freekiosk/.MainActivity
set "TT_SELF=%~f0"
rem All bus tablets: the screen never times out, on the charger or on battery.
rem Boarding tablets: brightness 0-255
set KIOSK_BRIGHTNESS=70

:start
cls
echo.
echo  ==========================================================
echo    TRANSITTRACK TABLET SETUP
echo  ==========================================================
echo.
echo  Before you start, the NEW tablet needs:
echo    - USB debugging ON
echo    - NO accounts  - Settings, Accounts, remove all
echo    - Wi-Fi with internet
echo    - USB cable plugged into this computer
echo.
echo  The TransitTrack Helper %HELPER_VERSION% is built into this file - nothing else to download.
echo  Needs ADB on this computer:  winget install Google.PlatformTools
echo  Updating a tablet? Sync or export its Saved Work first.
echo.
if not defined PRESET_TYPE goto ask_type
set TYPE=%PRESET_TYPE%
echo  This file was made for:  %PRESET_NAME%
echo.
echo    [1]  SET UP this tablet - new tablet
echo    [2]  UPDATE this tablet - already set up: Helper, settings and card reader key
echo    [3]  CHECK this tablet  - Helper version, screen, battery, card reader key
echo.
set MODE=
set /p MODE=  Type 1, 2 or 3 and press Enter: 
if "%MODE%"=="3" goto check_tablet
if "%MODE%"=="2" goto update_run
if "%MODE%"=="1" goto chosen_type
goto start

:ask_type
echo  What do you want to do?
echo.
echo    [1]  Set up a new DRIVER tablet        - driver app, USB GPS, shares its hotspot
echo    [2]  Set up a new BUS BOARDING tablet  - card reader, joins the bus hotspot
echo    [3]  UPDATE a tablet that is already set up - Helper, settings, card reader key
echo    [4]  CHECK a tablet - Helper version, screen, battery, card reader key
echo.
set TYPE=
set /p TYPE=  Type 1, 2, 3 or 4 and press Enter: 
if "%TYPE%"=="4" goto check_tablet
if "%TYPE%"=="3" goto update_ask
:chosen_type
if "%TYPE%"=="1" goto type_driver
if "%TYPE%"=="2" goto type_boarding
echo.
echo  Please type 1 or 2.
pause
goto start

:type_driver
set KIND=Driver
set PAGE=driver
goto ask_code

:type_boarding
set KIND=Bus boarding
set PAGE=kiosk
goto ask_code

rem ---------- Pairing code ----------
:ask_code
if not defined PRESET_CODE goto ask_code_q
set CODE=%PRESET_CODE%
goto code_done
:ask_code_q
echo.
echo  In your app: Admin - Kiosk Tablets - Register tablet - %KIND% - Copy URL.
echo  Paste the whole link, or just the code at the end of it.
set RAW=
set /p RAW=  Link or code: 
if "%RAW%"=="" goto ask_code_q
set CODE=%RAW%
echo %RAW%| find "code=" >nul
if not errorlevel 1 for /f "tokens=2 delims==" %%a in ("%RAW%") do set CODE=%%a
:code_done
set URL=%SITE%/%PAGE%?code=%CODE%

rem ---------- Bus number and hotspot ----------
:ask_bus
if not defined PRESET_BUS goto ask_bus_q
set BUS=%PRESET_BUS%
goto bus_done
:ask_bus_q
echo.
set BUS=
set /p BUS=  Bus number - used for the hotspot name, e.g. 12: 
if "%BUS%"=="" goto ask_bus_q
:bus_done
set SSID=%HOTSPOT_PREFIX%%BUS%
echo.
echo  Hotspot %SSID% password - letters and numbers only.
echo  Enter the password configured for this bus. There is no default password.
set HPASS=
set /p HPASS=  Password: 
powershell -NoProfile -Command "if ($env:HPASS -notmatch '^[A-Za-z0-9]{8,63}$') { exit 1 }"
if errorlevel 1 goto bus_done

:ask_pin
set /p PIN=  FreeKiosk exit PIN for this tablet: 
powershell -NoProfile -Command "if ($env:PIN -notmatch '^[0-9]{6,12}$') { exit 1 }"
if errorlevel 1 goto ask_pin
:ask_api_key
set /p APIKEY=  FreeKiosk REST API key for this tablet - letters, numbers, - or _: 
powershell -NoProfile -Command "if ($env:APIKEY -notmatch '^[A-Za-z0-9_-]{16,128}$') { exit 1 }"
if errorlevel 1 goto ask_api_key

rem ---------- Find the APK files ----------
set FK_APK=
for %%f in ("%~dp0*freekiosk*.apk" "%~dp0apks\*freekiosk*.apk" "%USERPROFILE%\Downloads\*freekiosk*.apk") do if not defined FK_APK set "FK_APK=%%~f"
set WV_APK=
for %%f in ("%~dp0*webview*.apk" "%~dp0apks\*webview*.apk" "%USERPROFILE%\Downloads\*webview*.apk") do if not defined WV_APK set "WV_APK=%%~f"

cls
echo.
echo  ==========================================================
echo    CHECK BEFORE STARTING
echo  ==========================================================
echo    Tablet type:   %KIND%
echo    Link:          %URL%
echo    Bus hotspot:   %SSID%
echo    Hotspot pass:  %HPASS%
echo    Helper:        %HELPER_VERSION% - built into this file
if defined FK_APK echo    FreeKiosk:     %FK_APK%
if not defined FK_APK echo    FreeKiosk:     will be downloaded from GitHub
if defined WV_APK echo    WebView:       %WV_APK%
if not defined WV_APK echo    WebView:       NOT FOUND - maps may not show. Put the WebView .apk in Downloads.
echo  ==========================================================
echo.
echo  If something is wrong, close this window and start again.
pause

rem ---------- Tablet connected? ----------
:check_device
adb disconnect >nul 2>&1
set STATE=
for /f %%s in ('adb get-state 2^>nul') do set STATE=%%s
if "%STATE%"=="device" goto device_ok
echo.
echo  [X] Tablet not found. Check the cable, wake the tablet, and tap ALLOW
echo      on the "Allow USB debugging?" popup.
echo      No ADB on this computer? Run:  winget install Google.PlatformTools
pause
goto check_device
:device_ok
set SERIAL=unknown
for /f %%s in ('adb get-serialno') do set SERIAL=%%s
echo  [OK] Tablet connected - %SERIAL%

rem ---------- Step 1: apps ----------
echo.
echo  --- Step 1 of 7: Installing apps - a few minutes ---
if defined FK_APK goto fk_install
echo  Downloading FreeKiosk from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $h=@{'User-Agent'='TransitTrack-Setup'}; $r=Invoke-RestMethod -Headers $h 'https://api.github.com/repos/RushB-fr/freekiosk/releases/latest'; $a=$r.assets | Where-Object { $_.name -like '*.apk' } | Sort-Object { if ($_.name -like '*universal*') { 0 } else { 1 } } | Select-Object -First 1; Invoke-WebRequest -Headers $h $a.browser_download_url -OutFile 'FreeKiosk-latest.apk'"
if not exist "%~dp0FreeKiosk-latest.apk" goto fk_failed
set "FK_APK=%~dp0FreeKiosk-latest.apk"
:fk_install
echo  Installing FreeKiosk...
adb install -r "%FK_APK%"
if not defined WV_APK goto wv_skip
echo  Installing WebView - the big one, about a minute...
adb install -r "%WV_APK%"
:wv_skip
rem The signed Helper is built into this file; no public helper download.
call :extract_helper
if errorlevel 1 goto helper_failed
echo  Installing TransitTrack Helper %HELPER_VERSION%...
adb install -r "%HELPER_APK%"
if errorlevel 1 goto helper_failed
call :cleanup_helper
rem Old apps the helper replaces - fine if they are not there
adb uninstall com.termux.boot >nul 2>&1
adb uninstall org.broeuschmeul.android.gps.usb.provider >nul 2>&1
goto step2

:fk_failed
echo  [X] Could not download FreeKiosk. Download the .apk from
echo      github.com/RushB-fr/freekiosk - Releases into your Downloads folder,
echo      then run this again.
pause
exit /b

:helper_failed
call :cleanup_helper
echo  [X] The TransitTrack Helper could not be installed. Download this setup file
echo      again from Admin - Kiosk Tablets. Installing also fails if the tablet has a
echo      Helper signed with a different key.
pause
exit /b

rem ---------- Step 2: device owner ----------
:step2
echo.
echo  --- Step 2 of 7: Giving FreeKiosk full control ---
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver > "%TEMP%\tt-do.txt" 2>&1
findstr /i "Success already" "%TEMP%\tt-do.txt" >nul
if not errorlevel 1 goto do_ok
type "%TEMP%\tt-do.txt"
echo.
echo  [X] This failed. Usually there is still an account on the tablet.
echo      Remove ALL accounts in Settings - Accounts, then run this again.
pause
exit /b
:do_ok
echo  [OK] FreeKiosk has full control.

rem ---------- Step 3: permissions and settings ----------
echo.
echo  --- Step 3 of 7: Permissions and settings ---
adb shell pm grant com.freekiosk android.permission.WRITE_SECURE_SETTINGS
adb shell pm grant com.freekiosk android.permission.CAMERA
adb shell pm grant com.freekiosk android.permission.ACCESS_FINE_LOCATION
adb shell appops set com.freekiosk android:get_usage_stats allow
adb shell pm grant %HELPER% android.permission.WRITE_SECURE_SETTINGS
adb shell dumpsys deviceidle whitelist +%HELPER%
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
adb shell wm fixed-to-user-rotation enabled
adb shell settings put system sound_effects_enabled 0
adb shell settings put global stay_on_while_plugged_in 7
rem Bus tablets: the screen never times out, on the charger or on battery.
adb shell settings put system screen_off_timeout 2147483647
adb shell appops set %HELPER% WRITE_SETTINGS allow
adb shell settings put global low_power 0 >nul 2>&1
adb shell settings put global low_power_trigger_level 0 >nul 2>&1
adb shell settings put global policy_control immersive.full=com.freekiosk
if not defined WV_APK goto wv_set_done
echo %WV_APK%| find /i "canary" >nul
if not errorlevel 1 adb shell cmd webviewupdate set-webview-implementation com.google.android.webview.canary
:wv_set_done
if "%TYPE%"=="1" goto perms_driver
goto perms_boarding

:perms_driver
adb shell appops set %HELPER% android:mock_location allow
adb shell settings put global hidden_api_policy 1
goto perms_done

:perms_boarding
adb shell pm grant %HELPER% android.permission.ACCESS_FINE_LOCATION
adb shell settings put secure location_mode 3
adb shell settings put system screen_brightness_mode 0
adb shell settings put system screen_brightness %KIOSK_BRIGHTNESS%
goto perms_done

:perms_done
echo  [OK] Done.

rem ---------- Step 4: FreeKiosk ----------
echo.
echo  --- Step 4 of 7: Setting up FreeKiosk ---
adb shell am start -n %FK% --es url "%URL%" --es pin "%PIN%" --es rest_api_enabled "true" --es rest_api_port "8080" --es rest_api_key "%APIKEY%" --ez kiosk_enabled false --es auto_launch "false" --es auto_relaunch "false" --es managed_apps '[{\"packageName\":\"com.transittrack.kioskhelper\",\"showOnHomeScreen\":false},{\"packageName\":\"com.android.systemui\",\"showOnHomeScreen\":false}]'
timeout /t 10 /nobreak >nul
echo  [OK] Done.

rem ---------- Step 5: TransitTrack Helper ----------
echo.
echo  --- Step 5 of 7: Setting up TransitTrack Helper ---
if "%TYPE%"=="1" goto helper_driver
adb shell am start -n %HELPER%/.MainActivity --es api_key "%APIKEY%" --es reader true --es gps false --es hotspot false --es ignition false --es join_ssid %SSID% --es join_pass %HPASS%
goto helper_set
:helper_driver
adb shell am start -n %HELPER%/.MainActivity --es api_key "%APIKEY%" --es reader false --es gps true --es hotspot true --es ignition false
:helper_set
timeout /t 5 /nobreak >nul
call :check_key
if "%KEYCODE%"=="200" goto key_ok_setup
call :key_problem
if "%KEYCODE%"=="nocurl" goto key_ok_setup
choice /c RC /n /m "  [R] Retry the check  [C] Continue anyway: "
if errorlevel 2 goto key_ok_setup
goto helper_set
:key_ok_setup
echo  [OK] Done.

rem ---------- Step 6: hotspot name - driver only ----------
echo.
echo  --- Step 6 of 7: Bus hotspot ---
if "%TYPE%"=="2" goto hotspot_skip
call :set_apn
echo.
echo  Mobile data - adding the Flow Internet APN...
set "TTADB=adb"
if defined SERIAL if not "%SERIAL%"=="unknown" set "TTADB=adb -s "%SERIAL%""
call :apn_run add
if "%TT_APN_RES%"=="OK" (echo  [OK] Mobile data APN added and in use: Flow Internet - internet. & exit /b 0)
if "%TT_APN_RES%"=="NOSIM" (echo  [!] No SIM card found - put the Flow SIM in, then run Update again. & exit /b 0)
if "%TT_APN_RES%"=="OTHER" (echo  [!] This SIM is not Flow Grenada - network code %TT_APN_NUM%. APN not added. & exit /b 0)
if "%TT_APN_RES%"=="SAVED" echo  [!] Flow Internet was added but could not be selected.
if not "%TT_APN_RES%"=="SAVED" echo  [!] This tablet would not take the APN from this computer.
%TTADB% shell am start -a android.settings.APN_SETTINGS >nul 2>&1
echo.
echo  ON THE TABLET - Access Point Names should be open. Tap + and enter:
echo    Name:                 Flow Internet
echo    APN:                  internet
echo    Authentication type:  PAP
echo    APN type:             default
echo    MCC and MNC:          leave what the tablet fills in - 352 and 110 for Flow
echo  Then open the menu, tap Save, and tap the circle next to Flow Internet.
echo  If that screen did not open, exit FreeKiosk with its PIN and open
echo  Settings - Network and internet - SIMs - Access Point Names.
pause
exit /b 0

:apn_run
set TT_APN_RES=
set TT_APN_NUM=
set "TT_APN_SH=%TEMP%\tt-apn-%RANDOM%.sh"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='::TT'+'APN '; $l=@(Get-Content -LiteralPath $env:TT_SELF | Where-Object { $_.StartsWith($p) } | ForEach-Object { $_.Substring($p.Length) }); if ($l.Count -eq 0) { exit 2 }; [IO.File]::WriteAllText($env:TT_APN_SH, (($l -join [char]10) + [char]10), (New-Object Text.UTF8Encoding $false))"
if errorlevel 1 (set "TT_APN_RES=FAIL" & exit /b 0)
%TTADB% push "%TT_APN_SH%" /data/local/tmp/tt-apn.sh >nul 2>&1
del "%TT_APN_SH%" >nul 2>&1
set TT_APN_OUT=
for /f "delims=" %%r in ('%TTADB% shell sh /data/local/tmp/tt-apn.sh %1 2^>nul') do set "TT_APN_OUT=%%r"
%TTADB% shell rm -f /data/local/tmp/tt-apn.sh >nul 2>&1
for /f "tokens=1,2" %%a in ("%TT_APN_OUT%") do (set "TT_APN_RES=%%a" & set "TT_APN_NUM=%%b")
if not defined TT_APN_RES set TT_APN_RES=FAIL
exit /b 0

rem -----------------------------------------------------------------
rem  The signed TransitTrack Helper is built into the end of this file as
rem  base64 lines. This unpacks it to a temporary file, checks its SHA-256
rem  and sets HELPER_APK. An older download with the APK beside this file
rem  still works.
rem -----------------------------------------------------------------
:extract_helper
set HELPER_APK=
set "TT_OUT=%TEMP%\TransitTrack-Kiosk-Helper-%RANDOM%.apk"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='::TT'+'APK '; $b=-join (Get-Content -LiteralPath $env:TT_SELF | Where-Object { $_.StartsWith($p) } | ForEach-Object { $_.Substring($p.Length).Trim() }); if (-not $b) { exit 2 }; $d=[Convert]::FromBase64String($b); $h=-join ([Security.Cryptography.SHA256]::Create().ComputeHash($d) | ForEach-Object { $_.ToString('x2') }); if ($env:HELPER_SHA256 -and $h -ne $env:HELPER_SHA256) { exit 3 }; [IO.File]::WriteAllBytes($env:TT_OUT, $d)"
set TT_X=%errorlevel%
if "%TT_X%"=="0" (set "HELPER_APK=%TT_OUT%" & exit /b 0)
if not "%TT_X%"=="2" goto extract_damaged
if exist "%~dp0TransitTrack-Kiosk-Helper.apk" (set "HELPER_APK=%~dp0TransitTrack-Kiosk-Helper.apk" & exit /b 0)
echo  [X] This setup file has no TransitTrack Helper built in. Download it again
echo      from Admin - Kiosk Tablets - Setup file, or Setup tool.
exit /b 1
:extract_damaged
echo  [X] The TransitTrack Helper built into this file is damaged.
echo      Download the setup file again from Admin - Kiosk Tablets.
exit /b 1

:cleanup_helper
if defined TT_OUT if exist "%TT_OUT%" del "%TT_OUT%" >nul 2>&1
exit /b 0

rem -----------------------------------------------------------------
rem  Sends the same request the helper sends with every card tap, using the
rem  key just given to the helper. KEYCODE: 200 = works, 401/403 = FreeKiosk
rem  has a different key (or the PIN was wrong so it kept its old one),
rem  000 = FreeKiosk's REST API is off, nocurl = cannot check on this PC.
rem -----------------------------------------------------------------
:check_key
set KEYCODE=
where curl.exe >nul 2>&1
if errorlevel 1 (set "KEYCODE=nocurl" & exit /b 0)
set "TTADB=adb"
if defined SERIAL if not "%SERIAL%"=="unknown" set "TTADB=adb -s "%SERIAL%""
%TTADB% forward tcp:18080 tcp:8080 >nul 2>&1
curl.exe -s -o nul -m 8 -w "%%{http_code}" -X POST -H "X-Api-Key: %APIKEY%" -H "Content-Type: application/json" -d "{\"code\":\"1\"}" http://127.0.0.1:18080/api/js > "%TEMP%\tt-key.txt" 2>nul
%TTADB% forward --remove tcp:18080 >nul 2>&1
set /p KEYCODE=<"%TEMP%\tt-key.txt"
del "%TEMP%\tt-key.txt" >nul 2>&1
if "%KEYCODE%"=="200" echo  [OK] Card reader can reach the boarding screen - FreeKiosk accepted the key.
exit /b 0

:key_problem
echo.
if "%KEYCODE%"=="nocurl" echo  [!] Could not test the key on this PC - curl.exe is missing. Tap a card after setup to check.
if "%KEYCODE%"=="401" echo  [X] FreeKiosk REJECTED the key. FreeKiosk has a different key, or the PIN was wrong so it kept its old key.
if "%KEYCODE%"=="403" echo  [X] FreeKiosk REJECTED the key. FreeKiosk has a different key, or the PIN was wrong so it kept its old key.
if "%KEYCODE%"=="000" echo  [X] FreeKiosk is not answering on port 8080 - its REST API is off, or FreeKiosk is not open.
if "%KEYCODE%"=="" echo  [X] FreeKiosk did not answer. Check the USB connection and that FreeKiosk is open.
echo      Until this passes, card taps will NOT reach the boarding screen.
exit /b 0
rem ===== Mobile data APN script - copied to the tablet by :apn_run =====
::TTAPN # TransitTrack setup: adds the Flow Grenada mobile data APN, run over USB.
::TTAPN # Adds "Flow Internet" (APN internet) and makes it the one in use, plus
::TTAPN # "Flow Internet prepaid" (APN ppinternet) in the list as the alternative.
::TTAPN # Prints one line: RESULT VALUE .
::TTAPN U=content://telephony/carriers
::TTAPN NUM=""
::TTAPN for n in $(getprop gsm.sim.operator.numeric | tr ',' ' '); do NUM="$n"; break; done
::TTAPN if [ -z "$NUM" ]; then echo "NOSIM - ."; exit 0; fi
::TTAPN if [ "$NUM" != "352110" ]; then echo "OTHER $NUM ."; exit 0; fi
::TTAPN idof() { sed -n 's/.*_id=\([0-9][0-9]*\).*/\1/p' | head -n 1; }
::TTAPN add() {
::TTAPN   content delete --uri $U --where "name='$1' AND numeric='352110'" >/dev/null 2>&1
::TTAPN   content insert --uri $U --bind name:s:"$1" --bind numeric:s:352110 --bind mcc:s:352 --bind mnc:s:110 --bind apn:s:"$2" --bind authtype:i:1 --bind type:s:default --bind carrier_enabled:i:1 >/dev/null 2>&1
::TTAPN }
::TTAPN add "Flow Internet prepaid" ppinternet
::TTAPN add "Flow Internet" internet
::TTAPN ID=$(content query --uri $U --projection _id --where "name='Flow Internet' AND numeric='352110'" 2>/dev/null | idof)
::TTAPN if [ -z "$ID" ]; then echo "FAIL insert ."; exit 0; fi
::TTAPN content insert --uri $U/preferapn --bind apn_id:i:"$ID" >/dev/null 2>&1
::TTAPN P=$(content query --uri $U/preferapn --projection _id 2>/dev/null | idof)
::TTAPN svc data enable >/dev/null 2>&1
::TTAPN if [ "$P" = "$ID" ]; then echo "OK $ID ."; else echo "SAVED $ID ."; fi
