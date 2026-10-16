# Tablet screen and camera viewing

## Current implementation (16 October 2026)
Admin → Kiosk Tablets → Tablet controls → Screen & camera includes View screen, View front camera and View back camera. The integrated Android kiosk app receives requests through its existing heartbeat, independently verifies them over HTTPS, and asks someone at the tablet to approve. Screen viewing additionally uses Android's own MediaProjection consent. USB auto-approval explicitly excludes screen/camera prompts.

Video is sent through LiveKit, not Base44 entities, and is not recorded by this implementation. Audio and remote input are disabled. A red native Stop button remains visible during capture. Each session expires within ten minutes and stops locally on backgrounding during capture, native destruction, stream disconnect, authorization failure or Stop. Native authorization pulses run every five seconds only during a pending/live session. HTTPS connect/read timeouts and the fixed monotonic deadline bound failure handling; this is not an instantaneous revocation guarantee.

Camera requests temporarily release the app's QR scanner; NFC/keypad remain available. QR scanning resumes after the session finishes. Camera ownership and Android permission/lifecycle behavior still require testing on the actual tablets.

## Authorization and storage
- Admin role is checked server-side. Company managers, mechanics, drivers and passengers cannot request or view.
- Native device ID alone is insufficient: the current strong paired credential and assignment must match.
- The requester's current role, device status and assignment are rechecked on authorization pulses.
- One current device request pointer and one native pending/live session. Concurrent server requests can invalidate one another; this is not a database atomic uniqueness guarantee.
- Terminal ended_at cannot be cleared by subsequent state updates. A stale concurrent active state cannot reauthorize a terminated session.
- Room grants last 30 seconds for joining. Publisher can publish only the selected video source, cannot subscribe or send data. Viewer cannot publish or send data. Token expiry alone does not disconnect an existing connection: room deletion, native pulses and the local deadline perform termination.
- Session metadata is stored in the server-only TabletSupportSession entity. No media or stream tokens are stored there. Gateway access is not exposed.
- Session/access events use AuditLog. Authorization fails closed if the access audit write fails; termination continues even if its audit write fails.
- Backend configuration secrets stay server-side. Tokens are ephemeral in memory; native publisher tokens never cross the WebView bridge.
- Media uses LiveKit's WebRTC transport security. End-to-end encryption beyond the streaming provider is not implemented.

## Configuration still required
Use a LiveKit Cloud project owned by TransitTrack. This implementation restricts the endpoint to wss://<project>.livekit.cloud. Self-hosted endpoints need a reviewed configuration change.

Set these backend secrets in the app dashboard, not in source or chat:
- TT_LIVEKIT_URL: the project's wss endpoint
- TT_LIVEKIT_API_KEY: server API key
- TT_LIVEKIT_API_SECRET: server API secret
- TT_SUPPORT_ENABLED: true only when ready for the physical acceptance test

Without complete configuration, Admin reports that streaming is not configured and no session is created. No service account, paid plan or secrets were created/configured during this work.

## Final combined handover (pending)
Keep one installation at the end, preserving package com.transittrack.app and the existing signing identity, pairing, PINs and saved queues. No signed APK was generated, no tablet commands were executed, and the web frontend was not published in this stage. Backend resource files auto-sync in the Base44 development sandbox.

Before release:
1. Verify native HTTPS calls reach tabletSupport on the deployed app. The existing native-command transport previously encountered a platform gateway 403; successful compilation/mocks do not establish reachability.
2. Configure the streaming project, build/sign with the existing signing identity and install the combined update once. Do not uninstall/reset.
3. Check heartbeat reports support_available, then request screen, front camera and rear camera separately while parked.
4. Decline and cancel Android permission; ensure no capture. Allow and verify visible Stop, correct camera, no audio, QR camera handoff and restoration.
5. Test Admin Stop, native Stop, closing the Admin panel, loss of data/Wi-Fi, lock/background, ten-minute expiry, admin demotion, device credential revocation and reassignment.
6. Verify screen/camera stop physically, not just a UI label. Reconnect must require a new session/approval.
7. Check two simultaneous admin requests, late permission results after cancellation, camera unavailable/in use, and preservation of GPS/NFC/queued work.
8. iPad remote capture and the separate passenger binary are not implemented by this Android kiosk feature.

## Validation
- Android Java/Kotlin compilation and 42 JVM tests pass, including new protection against USB auto-approval of capture prompts.
- 28 focused backend support tests pass, including real SDK token verification with synthetic keys and mocked database/streaming boundaries.
- Seven mocked Chromium admin-control scenarios pass, including unavailable service, request/approval waiting, stop and close cleanup. A separate mocked native handoff/QR camera reservation scenario also passes.
- All 32 existing boarding browser scenarios passed in the combined regression run before the outer 60-second command limit interrupted its later admin tests; the remaining three admin cases were rerun and passed.
- Relevant native health/network/update unit tests pass (28).
- The release security suite passed 145/146 in a parallel run; its existing cross-worker timing test timed out under compilation load and passed individually. No live hardware or hosted video stream was tested.
