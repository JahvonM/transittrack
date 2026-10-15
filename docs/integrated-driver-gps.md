# Integrated Android driver GPS

The driver tablet can now opt into reading a supported USB GPS receiver directly in TransitTrack. The original helper source remains unchanged and installed tablets stay on the existing source until this option is switched on.

## Implementation

- Reuses the helper's PL2303/VFAN, u-blox and CDC-ACM USB transport, initialization sequence and baud search (4800/9600/38400/115200).
- Uses direct Capacitor position events rather than installing an Android mock-location provider. No mock-location ADB grant is needed for the integrated reader.
- NMEA GGA supplies satellites/HDOP/altitude; checksummed RMC supplies valid coordinates, speed in metres per second and heading.
- The existing driver tracking and navigation consumers select one source at a time. Upload throttling, offline queues, credentials, company/vehicle assignment and backend stop alerts are unchanged.
- Explicit USB mode reports a disconnected receiver instead of silently switching to potentially stale Android/mock-provider coordinates.
- The source selection survives restarts. Reconnect scans run while the app is foregrounded. Backgrounding releases USB; returning restarts it. This is not background GPS, boot autostart or device-owner kiosk lockdown.
- USB permission denial switches integrated mode off, avoiding repeated denial prompts. The settings switch can retry.
- Existing screen-awake support remains in use.

## Install and test on the real driver tablet

1. Pull the latest repository on the Windows PC.
2. Run npm run build, then npx cap sync android.
3. In Android Studio run the app on the tablet, updating the existing installation.
4. Publish the frontend changes in Base44: this build still loads the hosted app URL.
5. Stop the separate helper before enabling direct USB GPS. Keep it installed for rollback. Do not change/revoke tablet credentials.
6. In driver More > Tablet & reader > USB GPS receiver, enable Use GPS directly in TransitTrack.
7. Connect the receiver and allow the Android USB permission prompt.
8. Outdoors with a clear sky view, wait for Fix (N sats); confirm the map position and normal location sharing.
9. Unplug/replug the receiver: status must show lost/looking, then recover without a page reload. Confirm NFC devices are not selected as GPS.
10. Background/return, rotate and restart the app; check resume and saved selection. If USB access is denied, the app must remain open and allow another attempt from settings.
11. On a short safe test trip, compare the displayed position and server trip/history with the helper's known-good behaviour. No field test has been performed by the coding agent.

Rollback: turn the integrated switch off first, then restart the helper. Never run both readers against the same USB receiver.

## Validation

- Java parser tests cover Grenada coordinates, GGA quality, speed conversion, checksum rejection, invalid fixes/ranges and missing motion fields.
- JavaScript tests cover the existing source by default, direct USB mode, switching, late callbacks, cleanup, old Android builds and sample validation.
- Existing GPS snapshot and backup-GPS tests verify backend trip and stop-alert behaviour is preserved.
- Hardware, firmware-specific serial compatibility and USB permissions require the physical tablet test above.
