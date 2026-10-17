# Rear-only dashcam pilot

Records only the rear camera, without audio, into app-private no-backup storage. No recording is uploaded or exposed through admin live viewing. Existing pairing, driver PIN, NFC, GPS and offline data are preserved.

## Controls

After the native update and publishing the frontend, use driver More > Rear dashcam. Start and stop locally. A foreground notification and driver REC indicator show capture; the notification also offers Stop and Save incident. Save incident protects the current and previous clips. Local controls provide Play, Export and explicit Delete. Playing/exporting protects the clip from loop deletion; delete it when no longer needed.

Optional automatic recording with a newly accepted driver shift defaults off. Enable it only after the device pilot passes. It does not start at boot or resume after process termination; recording errors do not undo a shift.

## Storage and camera limits

640x480, 15fps H.264 MP4, two-minute clips, 1 GiB loop budget. Maintain 512 MiB disk reserve plus space for the next clip. Only old unprotected clips in the recorder's directory are removed. Protected or incomplete clips are retained; if they fill storage, recording stops. Crash partial files are recovered as protected incomplete clips, which may not be playable.

There are short capture gaps between clips (500ms plus camera setup); this is not seamless recording. Sustained capture, heat, orientation, low disk behavior and background operation still require a physical tablet test. Stop recording before using QR or live camera viewing: this tablet failed dual-camera capture. Screen sharing has a separate path. Never claim a saved clip is good merely because a session was started.

## Install and pilot

1. In Windows PowerShell: `cd C:\Users\Gameo\StudioProjects\transittrack`, then `git pull --ff-only`.
2. Open this project's android directory in Android Studio. Connect the same tablet and press Run to update the installed app. Do not uninstall or clear its data.
3. Publish the frontend in Base44 for the new driver menu and shift hooks.
4. On a debug installation, local controls can also be opened before publishing with `adb shell am start -n com.transittrack.app/.RearDashcamActivity`. This activity is not exported in release builds.
5. Start manually, record 20 seconds, Stop, and Play. Verify actual rear-camera video, orientation, duration and no sound.
6. Then test a clip boundary, protection/export, NFC/GPS during capture, and live camera only after stopping. Test sustained recording before using automatic shift recording.

## Validation

The initial native implementation compiled debug Java/Kotlin, processed the release manifest and passed 70 JVM tests. Later small edits added orientation/callback guards and tightened camera lease cleanup; the remote sandbox reset removed the temporary Android toolchain before the final native rerun could be confirmed. Android Studio must compile the final revision before installation.

Final frontend build exited successfully. Four focused JS test files passed 29 tests, covering the bridge, shift acceptance/offline durability, recording policy and existing remediation behavior. Physical recording has not yet been verified on the user's tablet. No APK was signed, installed or published by this change.

### Startup diagnostic update

Startup failures now display a stage/category code directly on the local recording screen and emit the same code under Android log tag TT-RearDashcam. Exception messages, clip paths and video data are not logged. This is diagnostic instrumentation, not a confirmed hardware fix. The five recording-boundary checks pass; native compilation of this update remains required in Android Studio.
