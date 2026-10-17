# Local dual-camera preview test

Purpose: check the operator's legacy Android tablet before implementing dashcam
recording. The uploaded camera dump reports rear video up to 1920×1080, front
up to 1280×720, no conflicting devices and legacy HAL1/API1 camera support.
These declarations do not establish simultaneous capture/recording reliability.

This test exists only in Android's debug source set. No release activity or web,
backend, remote-control, scheduled or boot trigger is added. No camera permission
is bypassed. Opening the screen does not capture: the operator presses Start.
It shows both previews at 640×480, reuses NV21 preview buffers, and counts callback
frames without inspecting or retaining image content. There is no recorder,
microphone, file output or network upload.

Pass requires at least ten seconds with both previews producing at least thirty
frames each, both fresh at completion, and no observed stall after the two-second
warm-up. Camera-open handles alone, one active camera, early-only frames, errors
and interruption do not pass. A twenty-second UI watchdog covers setup plus
measurement. Camera operations run off the UI thread. Cancellation is checked
after blocking legacy camera-open returns; an indefinitely blocked vendor HAL
cannot be forcibly interrupted by application Java code. Cameras release on
completion, Stop, surface loss or leaving the activity. The report remains visible.

A passing preview test is NOT proof of two simultaneous hardware encoders,
recording stability, storage endurance or usable all-day temperatures.

## Operator steps (Windows, parked tablet)

1. Close Admin live viewing. Preserve pairing, signing identity, package and saved
   work. Do not uninstall/reset.
2. Pull the latest repository code in C:\Users\Gameo\StudioProjects\transittrack.
3. Run the normal cap:android workflow, then install the debug build over the
   existing app with Android Studio Run.
4. With the tablet connected by USB, run in PowerShell:

   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adb shell am start -n com.transittrack.app/.DualCameraTestActivity

5. Press Start 10-second test on the tablet. If Android asks for camera permission,
   allow it and press Start again if needed. Both views should be visible.
6. After completion photograph the result and front/rear frame counts.
7. Press Stop and return to kiosk. Verify normal NFC/GPS and Admin live viewing.

If am start reports the activity does not exist, the new debug build has not been
installed. If it reports camera unavailable/busy, close other camera sessions
before interpreting the outcome. This test is not included in release builds.
No dashcam recording, storage retention, video download or recording UI is
implemented by this change.
