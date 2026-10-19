# Kiosk power and optional startup recovery

This checkpoint is part of the combined final kiosk update. No tablet installation, Home selection, USB default selection, account/device mutation, permission grant or publication was performed.

## Native screen power

MainActivity applies the persisted Keep screen on preference at creation, resume and regained focus. It defaults on and keeps the visible kiosk activity awake on battery or charger; off clears the activity flag and restores Android’s normal timeout. The switch is in driver settings and PIN-gated boarding settings → Startup & recovery. The native recovery screen follows this choice; the rear-camera recording activity retains its own keep-awake requirement. It is not a CPU wake lock, background tracking service, forced screen wake or guarantee against an empty battery/OS shutdown.

The existing useKeepAwake hook recognizes the TabletRecovery plugin and leaves this activity-owned flag alone. Older native shells still use the Capacitor keep-awake plugin and web/PWA builds retain the existing Wake Lock API behaviour. This prevents a departing tablet screen's cleanup from clearing the newer activity's keep-awake flag.

## Low battery

TabletPowerPolicy parks the integrated USB GPS reader at 0–5% only when unplugged status and battery percentage are known. It resumes on external power, or at 8% and above. The 5/8 hysteresis prevents repeated restarts around the threshold. Unknown/invalid readings do not create a low-battery condition.

UsbGpsPlugin observes sticky battery broadcasts, stops/releases the reader while parked, drops fixes/status callbacks while parked, and resumes only if the user left native GPS enabled and the app is foreground. The enabled preference and device credentials are unchanged. Power transitions add only fixed diagnostic codes. Native NFC, BLE, screen power and saved queues are unaffected.

This is integrated USB GPS protection only. It does not pause the separate helper, tablet/browser GPS or an Android hotspot. Hotspot low-battery policy remains to be integrated with hotspot control.

## Optional Home and USB startup

- MainActivity advertises a standard Android Home handler alongside its existing launcher entry.
- TabletRecovery reports whether this package is the current Home app. A PIN-protected settings button opens Android's Home settings; the user must explicitly select it.
- Selecting TransitTrack Kiosk replaces the current Home app, including FreeKiosk if that was selected. Nothing switches automatically on update. Android normally launches its selected Home after boot/unlock; OEM behaviour must be checked physically.
- This is not device-owner enrollment, managed lock task, boot foreground service, watchdog, direct-boot operation or remote reboot.
- Known ACS (0x072F), Prolific (0x067B) and u-blox (0x1546) USB attachment intents can open MainActivity after the user chooses this app in Android's USB handler dialog. The existing helper's remembered USB association is not revoked. Unsupported vendors/USB transports can still require manual launch.
- The app resumes the remembered driver/boarding screen using the existing launch policy. No re-pairing, storage clearing or queue deletion is part of startup setup.
- Native web content still uses the configured hosted URL. Offline cold-start behaviour and OEM reboot/USB prompts require physical acceptance; this checkpoint does not guarantee an offline cold start.
- Driver and boarding settings show the recovery panel; boarding retains its bus-PIN gate.

## Verification

- Android compileDebugJavaWithJavac and testDebugUnitTest passed, including three new pure power-policy tests (known/unknown readings, hysteresis and power restoration).
- 24 targeted JavaScript tests passed (recovery availability/explicit action/failure, Bluetooth bridge, kiosk launch and driver GPS).
- Six mocked browser scenarios passed: PIN-gated recovery with no automatic Home action, existing NFC success/retry and rejection, Bluetooth success/duplicate confirmation, Bluetooth rejection/expiry and Bluetooth PIN controls.
- Production build, changed-file ESLint and whitespace checks passed. Recovery settings screenshot inspected.
- No signed APK or deployment was produced.

Final hardware acceptance, after the combined installation:
1. Driver and boarding screens remain awake unplugged, including page changes and USB/wake recovery.
2. Low battery parks only integrated USB GPS; card taps still work. Connect power and confirm fresh GPS fixes return.
3. If wanted, select TransitTrack Kiosk in Home settings. Reboot/unlock and check the remembered paired screen. Leave FreeKiosk installed until all parity tests pass.
4. Confirm optional USB handler prompts for each actual receiver and reader, including both attached together.
5. Check offline startup and pending check-ins before relying on automatic restart.
