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

rem ===== Credentials are entered locally for this tablet; never embed them here. =====
set PIN=
set APIKEY=
set SITE=https://eager-transit-track-go.base44.app
set HOTSPOT_PREFIX=TT-BUS
set HELPER=com.transittrack.kioskhelper
set FK=com.freekiosk/.MainActivity
rem Boarding tablets: brightness 0-255 (screen timeout is set to never)
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
if not defined PRESET_TYPE goto ask_type
set TYPE=%PRESET_TYPE%
echo  This file was made for:  %PRESET_NAME%
echo.
echo    [1]  SET UP this tablet - new tablet
echo    [2]  UPDATE this tablet - already set up, install a trusted helper and settings
echo.
set MODE=
set /p MODE=  Type 1 or 2 and press Enter: 
if "%MODE%"=="2" goto update_run
if "%MODE%"=="1" goto chosen_type
goto start

:ask_type
echo  What do you want to do?
echo.
echo    [1]  Set up a new DRIVER tablet        - driver app, USB GPS, shares its hotspot
echo    [2]  Set up a new BUS BOARDING tablet  - card reader, joins the bus hotspot
echo    [3]  UPDATE a tablet that is already set up
echo.
set TYPE=
set /p TYPE=  Type 1, 2 or 3 and press Enter: 
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
set /p APIKEY=  FreeKiosk REST API key for this tablet - letters and numbers only: 
powershell -NoProfile -Command "if ($env:APIKEY -notmatch '^[A-Za-z0-9]{16,128}$') { exit 1 }"
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
rem Use a trusted, privately supplied APK; no legacy public helper download.
set "HELPER_APK=%~dp0TransitTrack-Kiosk-Helper.apk"
if not exist "%HELPER_APK%" goto helper_failed
echo  Installing the locally supplied TransitTrack Helper...
adb install -r "%HELPER_APK%"
if errorlevel 1 goto helper_failed
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
echo  [X] Place a trusted TransitTrack-Kiosk-Helper.apk beside this setup file.
echo      Installation may also fail if its signing key differs from the installed app.
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
adb shell settings put global policy_control immersive.full=com.freekiosk
if not defined WV_APK goto wv_set_done
echo %WV_APK%| find /i "canary" >nul
if not errorlevel 1 adb shell cmd webviewupdate set-webview-implementation com.google.android.webview.canary
:wv_set_done
if "%TYPE%"=="1" goto perms_driver
goto perms_boarding

:perms_driver
adb shell appops set %HELPER% android:mock_location allow
adb shell appops set %HELPER% WRITE_SETTINGS allow
adb shell settings put global hidden_api_policy 1
goto perms_done

:perms_boarding
adb shell pm grant %HELPER% android.permission.ACCESS_FINE_LOCATION
adb shell settings put secure location_mode 3
adb shell settings put system screen_off_timeout 2147483647
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
adb shell am start -n %HELPER%/.MainActivity --es api_key "%APIKEY%" --es reader false --es gps true --es hotspot true
:helper_set
timeout /t 5 /nobreak >nul
echo  [OK] Done.

rem ---------- Step 6: hotspot name - driver only ----------
echo.
echo  --- Step 6 of 7: Bus hotspot ---
if "%TYPE%"=="2" goto hotspot_skip
adb shell am start -n com.android.settings/.TetherSettings > "%TEMP%\tt-tether.txt" 2>&1
findstr /i "Error" "%TEMP%\tt-tether.txt" >nul
if not errorlevel 1 adb shell am start -a android.settings.SETTINGS >nul 2>&1
echo.
echo  ON THE TABLET - you can also use scrcpy on this computer:
echo    1. Open  Wi-Fi hotspot  - in Settings: Network and internet, Hotspot and tethering
echo    2. Hotspot name:      %SSID%
echo    3. Hotspot password:  %HPASS%
echo    4. Security:          WPA2-Personal
echo    5. Make sure Mobile data is ON - a SIM card must be in the tablet
echo.
echo  You do NOT need to switch the hotspot on - the helper does that by itself.
echo.
pause
goto step7
:hotspot_skip
echo  This tablet will join %SSID% by itself whenever the bus is running.

rem ---------- Step 7: lock ----------
:step7
echo.
echo  --- Step 7 of 7: Locking the tablet ---
adb shell am start -n %FK% --es pin "%PIN%" --ez kiosk_enabled true --es auto_launch "true" --es auto_relaunch "true" --es test_mode "false"
timeout /t 5 /nobreak >nul

set LOG=%USERPROFILE%\Documents\TransitTrack-tablets.csv
if not exist "%LOG%" >"%LOG%" echo Date,Time,Type,Bus,Code,Hotspot,Serial
>>"%LOG%" echo %DATE%,%TIME%,%KIND%,%BUS%,,%SSID%,%SERIAL%

cls
echo.
echo  ==========================================================
echo    SETUP FINISHED - %KIND% tablet for bus %BUS%
echo  ==========================================================
echo    Link:      %URL%
echo    Hotspot:   %SSID%
echo    Serial:    %SERIAL%
echo    Logged in: Documents\TransitTrack-tablets.csv
echo  ==========================================================
echo.
echo  The tablet restarts when you press a key. After it restarts:
echo.
if "%TYPE%"=="1" goto finish_driver
echo    1. Unplug this computer. Plug in the ACR122U reader through the
echo       OTG charging cable, with the charger connected.
echo    2. Any USB popup closes by itself. The reader light turns RED.
echo    3. Tap an issued card: beep and GREEN. Unknown card: 3 beeps and RED.
echo    4. When the driver tablet's hotspot is on, this tablet joins %SSID%.
goto finish_common
:finish_driver
echo    1. Unplug this computer. Plug in the VFAN GPS through the
echo       OTG charging cable, with the charger connected.
echo    2. Any USB popup closes by itself. Put it near a window for a GPS fix.
echo    3. About a minute after start-up, %SSID% appears as a Wi-Fi network.
:finish_common
echo    -  Screen stays on while powered. Unplug power: off after about 5 seconds.
echo    -  Admin - Kiosk Tablets shows battery, reader / GPS and hotspot.
echo.
echo  Problem? Plug in this computer and run:  adb logcat -d -s TTHelper
echo.
pause
adb reboot
echo  Restarting. You can set up the next tablet now.
pause
exit /b 0

rem =================================================================
rem   UPDATE MODE - tablet already set up: latest helper + settings
rem =================================================================
:update_ask
echo.
echo  Which tablet are you updating?
echo    [1]  Driver tablet
echo    [2]  Bus boarding tablet
set TYPE=
set /p TYPE=  Type 1 or 2 and press Enter: 
if "%TYPE%"=="1" goto update_run
if "%TYPE%"=="2" goto update_run
goto update_ask

:update_run
if "%TYPE%"=="1" set KIND=Driver
if "%TYPE%"=="2" set KIND=Bus boarding
set "HELPER_APK=%~dp0TransitTrack-Kiosk-Helper.apk"
if not exist "%HELPER_APK%" goto upd_failed
echo.
echo  Use the trusted Helper APK supplied for this release, with the existing signing key.
echo  Saved Work must be synced or exported before proceeding.
echo  This update keeps existing pairing, Helper settings and FreeKiosk data.
:upd_pin
set PIN=
set /p PIN=  EXISTING FreeKiosk exit PIN for this tablet: 
powershell -NoProfile -Command "if ($env:PIN -notmatch '^[0-9]{4,12}$') { exit 1 }"
if errorlevel 1 goto upd_pin

:upd_check_device
set STATE=
for /f %%s in ('adb -d get-state 2^>nul') do set STATE=%%s
if "%STATE%"=="device" goto upd_device_ok
echo.
echo  [X] Connect exactly ONE USB tablet, wake it, and approve USB debugging.
pause
goto upd_check_device
:upd_device_ok
set SERIAL=
for /f %%s in ('adb -d get-serialno 2^>nul') do set SERIAL=%%s
powershell -NoProfile -Command "if ($env:SERIAL -notmatch '^[A-Za-z0-9._:-]+$' -or $env:SERIAL -eq 'unknown') { exit 1 }"
if errorlevel 1 goto upd_failed
echo  Target tablet: %SERIAL%
echo  Check this is the intended %KIND% tablet before continuing.
choice /c YN /n /m "  Continue with this tablet? [Y/N]: "
if errorlevel 2 exit /b 1

echo.
echo  --- Update 1 of 3: Trusted TransitTrack Helper ---
call :upd_adb install -r "%HELPER_APK%"
if errorlevel 1 goto upd_failed
rem Preserve older helper apps; removing them needs separate migration verification.

echo.
echo  --- Update 2 of 3: Settings ---
call :upd_adb shell pm grant %HELPER% android.permission.WRITE_SECURE_SETTINGS
if errorlevel 1 goto upd_failed
call :upd_adb shell dumpsys deviceidle whitelist +%HELPER%
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put global stay_on_while_plugged_in 7
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put system sound_effects_enabled 0
if errorlevel 1 goto upd_failed
if "%TYPE%"=="1" goto upd_driver
call :upd_adb shell pm grant %HELPER% android.permission.ACCESS_FINE_LOCATION
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put secure location_mode 3
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put system screen_off_timeout 2147483647
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put system screen_brightness_mode 0
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put system screen_brightness %KIOSK_BRIGHTNESS%
if errorlevel 1 goto upd_failed
goto upd_settings_done
:upd_driver
call :upd_adb shell appops set %HELPER% android:mock_location allow
if errorlevel 1 goto upd_failed
call :upd_adb shell appops set %HELPER% WRITE_SETTINGS allow
if errorlevel 1 goto upd_failed
call :upd_adb shell settings put global hidden_api_policy 1
if errorlevel 1 goto upd_failed
:upd_settings_done
rem Android activity launch success is NOT proof of FreeKiosk configuration acceptance.
call :upd_adb shell am start -n %FK% --es pin "%PIN%" --es managed_apps '[{\"packageName\":\"com.transittrack.kioskhelper\",\"showOnHomeScreen\":false},{\"packageName\":\"com.android.systemui\",\"showOnHomeScreen\":false}]'
if errorlevel 1 goto upd_failed
set PIN=
timeout /t 8 /nobreak >nul
echo  On the tablet, verify FreeKiosk accepted the settings with no PIN error.
echo  Check managed apps includes TransitTrack Helper and Android System UI.
choice /c YN /n /m "  Settings verified on the tablet? [Y/N]: "
if errorlevel 2 goto upd_failed

echo.
echo  --- Update 3 of 3: Restart ---
choice /c YN /n /m "  Restart this tablet now? [Y/N]: "
if errorlevel 2 exit /b 1
call :upd_adb reboot
if errorlevel 1 goto upd_failed
echo  Restart requested. Update verification is still pending.
echo  After restart, check Admin - Kiosk Tablets for the expected Helper version,
echo  fresh last-seen time, and correct reader / GPS / hotspot status.
echo  Confirm pairing and Saved Work are intact before updating another tablet.
pause
exit /b 0

:upd_failed
set PIN=
echo.
echo  [X] UPDATE STOPPED. No successful update has been recorded.
echo      Check the trusted APK, its existing signing key, USB connection and PIN.
echo      Some earlier settings may already have applied; inspect the tablet.
echo      Existing app data and older helpers have not been deliberately removed.
echo      Do not uninstall FreeKiosk or clear app data to work around this error.
pause
exit /b 1

:upd_adb
adb -s "%SERIAL%" %*
exit /b %errorlevel%
