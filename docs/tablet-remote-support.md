# TransitTrack tablet remote support — first implementation

## Saved now
- Native TabletSupport capability reporting: Android API, front/back camera availability, camera permission and Device Owner status. It deliberately reports remoteViewingReady=false.
- Private Supabase session and audit tables, prepared as a migration, NOT applied to a hosted project.
- Server-side session policy and tests: admin request, paired active tablet, ten-minute expiry, device-bound acknowledgements, permission stage, valid transitions and revoked/expired session rejection.

The policy is a library, not a deployed endpoint. Identity inputs MUST come from live server authentication and database lookups. This is not a complete remote-viewing implementation.

## Existing setup found
The repository already contains Supabase entity schema/copy work. Android Capacitor still loads the Base44 URL. USB card reader/GPS code remains in kiosk-helper. FreeKiosk device-management integration has not been imported or replaced. No camera/screen stream has been activated.

## Next implementation steps
1. Connect an authenticated server endpoint to the private tables. Verify the admin role live for each request; authenticate tablets using enrolled credentials, never device ID alone. Use atomic transitions and expire prior sessions in the transaction creating a session.
2. Add authorization-bound WebRTC signaling, with viewer identity and device assignment checked server-side on every access. TURN credentials must be short-lived. Supabase handles session/signaling coordination; media does not belong in normal entity reads or audit logs.
3. Add native MediaProjection screen capture with Android's permission flow, a visible foreground session, secure-screen handling and teardown on expiry/revocation/disconnection. No permission-dialog bypass.
4. Add front/back camera streaming with runtime permission and availability checks. Leave audio disabled unless separately requested.
5. Add Admin -> Kiosk tablets -> Remote support: camera/screen selection, live status, session expiry and End session. No recording by default.
6. Test native build and permission denial, network loss, camera occupied by QR scanning, local/remote stop, app lifecycle, rotation and expiry on one Android 10 tablet.
7. Integrate reader/GPS helper modules through native bridges; then adapt selected FreeKiosk Device Owner components with required MIT notices and dependency review.

## Build limitation
This sandbox currently has neither javac nor an Android SDK. Native source is not compiled or device-tested. Build using Android Studio/the configured Android CI toolchain, without generating or replacing existing signing keys. Capability discovery must be tested before claiming remote capture is available.

## Safety of current changes
No capture methods or network listeners are exposed by the native plugin. No live database migration, tablet reassignment, factory reset, helper removal, recording, credential rotation or signing-key generation was performed.
