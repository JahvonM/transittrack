# McSween Kiosk Setup for Windows

Launch tools/kiosk/Start-Kiosk-Setup.cmd by double-clicking it in File Explorer.
It opens a Windows PowerShell 5.1 desktop window. No administrator elevation is required.
The launcher applies execution-policy bypass only to its own PowerShell process.
The window stays responsive while a separate PowerShell worker performs each operation.
Logs are saved under %LOCALAPPDATA%\McSween\KioskSetup\Logs; they are not uploaded anywhere.

## Android Studio

Keep Android Studio and its SDK/platform tools installed on the same PC used for previous APK builds.
The setup app reuses Prepare-Tablet-Test.ps1 and Install-Tablet-Test.ps1, including the existing JDK discovery, test/build checks, APK checksum checks, and signing environment.
Routine builds run with -NoOpen, so Android Studio does not need to be opened manually.
The optional Open Android Studio button opens this checkout's Android project.
Use Check PC to find missing Git, Node/npm, ADB, or JDK 17/21 prerequisites.
The tool does not install prerequisites, create signing keys, or change Gradle configuration.

## Existing device update

1. Select the transittrack project folder.
2. Check PC. On a clean main checkout, Update main performs a fast-forward-only pull from JahvonM/transittrack.
3. Build APK once. Wait for success. The existing build script puts the checked APK in Downloads.
4. Enable USB debugging on the device, connect its data cable, and approve this PC.
5. Find devices. Select the intended serial number. When several devices are attached, selection is always manual.
6. Check device, then Install / Update APK.
7. Confirm the expected installed version and retained pairing on the device.

Do not uninstall to bypass a signature mismatch. Use the original signing PC/environment.
Updates preserve existing device ownership; do not request ownership again when the device is already managed by this app.
Update main stops if the checkout has local changes, is on a different branch, or has an unexpected origin.
The setup tool does not switch branches, stash changes, merge, reset, or push code.
During PR review, Build APK can use the review checkout without using Update main.

## New dedicated kiosk

After building the APK and selecting the authorized device, choose Set up new device.
This installs the checked APK, requests McSween Kiosk ownership, then opens the kiosk.
Set device owner is also available separately when the APK is already installed.
The owner request is exactly dpm set-device-owner com.transittrack.app/.TransitDeviceAdminReceiver, scoped to the selected serial.
An existing McSween device owner is preserved. A detected foreign owner stops setup.
If Android rejects ownership because of accounts, another owner, or provisioning requirements, the tool stops and keeps the error in the log.
If installation succeeded before ownership failed, it explicitly reports that partial result.
There is no uninstall, account removal, data clearing, factory reset, ownership transfer, or global hidden-API policy change.

Complete these steps on the Android device:
- Pair it for the intended driver, sign-in, or boarding role.
- Tap the native gear, set/enter the exit code, and confirm Device management: ready.
- Connect the boarding/sign-in devices to the saved driver hotspot and enable auto-connect if available.
- Choose Start kiosk mode.
- Test the code, Home/Overview/Back/notification restrictions, restart, and real connectivity.

Full kiosk locking requires Android 8/API 26 or newer. Android remains responsible for ownership eligibility.
This setup utility does not add the proposed preferred-hotspot retry service or guarantee reconnection on every firmware.
It does not publish the website/backend or automatically activate permanent kiosk lock.

## Tests

Run on Windows:

    powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\kiosk\McSween-Kiosk-Setup.ps1 -SelfTest

The Windows workflow checks PowerShell syntax, USB device selection including offline/unauthorized cases, separation of device owner from active admins/profile owners, rejection of another owner, stop-on-error behavior, Windows argument quoting, and construction of the real Forms window.
SelfTest never runs ADB, installs an APK, builds the app, or changes a device.
Physical USB installation and Android ownership still need testing on the target devices.
