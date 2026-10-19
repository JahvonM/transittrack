# One combined kiosk test — Android 1.3 / build 4

Use one development tablet, parked, with the existing test driver, bus and NFC card. The previous driver appearance is restored. Cloud video storage is deferred; clips stay on the tablet and Admin plays a requested clip while the tablet is online.

## Prepare once on Windows

1. Publish the current web version in the Base44 dashboard. The kiosk still loads the existing hosted app URL; an APK update alone does not publish that web version.
2. Open PowerShell and run:

```powershell
cd C:\Users\Gameo\StudioProjects\transittrack
git pull --ff-only
powershell -NoProfile -File .\tools\kiosk\Prepare-Tablet-Test.ps1
```

If git reports local changes or conflicts, stop and preserve those changes; do not reset or discard them. If Windows blocks the script, open it in your editor and run its commands in PowerShell instead of changing machine-wide execution policy.

The script installs locked dependencies, builds the web app, syncs Android, compiles native code and runs native tests, then opens Android Studio. It does not install, publish, clear app data or create keys. Use the existing Android Studio Run/signing configuration to update the tablet **in place once**. If Android rejects its signature, stop and use the original signing environment; do not uninstall or create a new key. Do not accept Android Studio's uninstall-to-resolve prompt.

3. Open the kiosk and check Admin → Kiosk tablets → Tablet controls reports **1.3 / build 4** after a heartbeat. Keep the existing helper and FreeKiosk installed until acceptance is complete; only one app should own a USB reader at a time.

## Work through the test in this order

Record PASS / FAIL and the exact message for each row. Existing test records will be created by normal shifts, boardings and recording actions. No passenger or production-wide test is needed.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open the updated app; unlock the paired driver with the existing PIN. | Pairing, assigned bus/company, preferences and existing saved work remain; the rejected mint theme is absent. |
| 2 | Driver → More → Tablet settings → Startup & recovery. Leave **Keep screen on** on and unplug the charger for longer than the normal Android timeout. | Screen stays awake while the kiosk is visible. |
| 3 | Turn **Keep screen on** off, wait for the normal Android timeout, wake the tablet, then close/reopen the app. | Android may sleep normally; the switch stays off after reopening. It does not itself force immediate sleep. Turn it back on for boarding. Rear-camera recording has its own awake requirement. |
| 4 | Start a test shift and location sharing. Use the existing GPS source (USB or internal). Wait for a real GPS fix, then change tabs and rotate the tablet. | One location source continues; correct bus/company and trip direction remain; no duplicate watchers. Test location outdoors if needed. |
| 5 | Enable **GPS with screen off** deliberately; hide the app and turn the screen off for 2–3 minutes. Watch Admin Live fleet. | Tracking notification appears; live GPS timestamp advances when valid fixes are available. Lack of movement is not an error while parked. Verify timestamp, not moving the icon artificially. |
| 6 | Disconnect/reconnect USB GPS, then repeat after sleep/wake. | Reconnect status is visible and fixes resume with the existing USB permission. Android may require choosing the app/default. No silent internal-GPS substitution. |
| 7 | Disconnect Internet for a few minutes, reopen driver settings and note saved GPS counts; restore Internet. | Saved points remain assigned to this bus; pending count eventually falls after confirmed upload. Rejected/old points remain for review/export rather than blocking fresh points. |
| 8 | Stop sharing. Reopen the driver screen, then reboot once with sharing/background GPS enabled and an unexpired driver session. | Stopping sharing stops native GPS. On this Android 10 tablet restart recovery attempts to resume the verified session; no camera starts. Reopen the app if this OEM suppresses startup and report that result. |
| 9 | Select To work / To home, Change stop and a stop on the map; open navigation, then pan the map. | Selected stop/direction are correct; Change stop stays reachable; map recenters after about five seconds. Route assignment is unchanged. |
| 10 | End the test shift and switch to Boarding. Tap the known NFC card once; repeat using its existing keypad code/QR. | Exactly one correct passenger/action result per deliberate check-in; welcome/bye returns to the scan screen. A camera/QR lookup must not repeat continuously. |
| 11 | Disconnect/reconnect NFC and repeat after tablet sleep/wake. Enter settings with its existing settings PIN. | Reader resumes and reports the tap. Startup & recovery contains the same persisted screen switch; settings remain PIN gated. |
| 12 | With the saved passenger list available, disconnect Internet, record one test boarding, reopen the app, then reconnect. | Boarding remains saved before upload and syncs once with correct passenger/company/bus; no lost or duplicate work. Do not clear queues. |
| 13 | Open rear dashcam, record a short clip, stop it, then play and seek the saved clip locally. | Rear camera only; completed clip plays, can seek and retains its date/time. Existing clips remain. |
| 14 | In Admin, open Saved recordings, connect, select today's completed clip, play/seek and disconnect. | Only the selected clip transfers and plays after verification; disconnect releases the session. If it ends, use Reconnect. No cloud archive is expected. |
| 15 | With dashcam stopped, test Admin live screen and rear-camera viewing separately; stop each session. | Stream connects; visible viewing/Stop indicators remain; no microphone/recording is started by live viewing. Test a fresh rear recording afterwards to check camera release. |
| 16 | Review Admin health: installed version, recent GPS/background report, reader, storage, power and network. Exercise Wi-Fi/hotspot controls only if this tablet reports the required capability. | Status distinguishes unavailable permissions from a successful command; unsupported Android controls give an explanation. Never change Wi-Fi while testing offline uploads or live viewing. |

## Before closing the test

- Stop test sharing/recording/viewing and end the test shift. Keep any unsynced/review items; export where available.
- Report only failed row numbers, the exact error and whether the tablet was online/charging. Add the installed 1.3/build 4 confirmation.
- Low-battery park/resume and native upgrade-rejection policies have automated coverage. Real full-storage and low-battery experiments, a signed rollout artifact and fleet rollout remain outside this parked test.
- Android force-stop, whole-process hangs and OEM battery restrictions cannot be guaranteed away. A successful parked test is not proof of every Android variant or fleet-wide reliability.

## Scope boundaries

This pass finishes the combined test candidate. It does not package the separate passenger app, provision remote native APK hosting/catalog entries, enroll tablets as device owner, replace signing credentials, store videos in the cloud or migrate the running backend away from Base44. Those remain separate release/deployment work; unsupported Wi-Fi/hotspot privileges cannot be fabricated by the app.
