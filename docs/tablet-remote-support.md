# Direct tablet screen and camera viewing — no LiveKit

Updated 16 October 2026. This supersedes the earlier LiveKit integration.

## What was built
Admin → Kiosk Tablets → Tablet controls → Screen & camera retains screen/front/rear-camera requests. The native Android kiosk independently authenticates the request, asks for local approval, and uses Android MediaProjection consent for screen capture. Video is sent over one-way WebRTC directly between tablet and Admin, optionally through an operator-owned TURN relay. The app backend carries small connection descriptions and authorization checks only; it never receives video frames.

LiveKit client/server dependencies and account requirements have been removed. Android uses the standalone org.webrtc SDK. The browser uses its built-in RTCPeerConnection. No camera or microphone permission is requested from the Admin browser.

This change uses the existing Base44 backend for signaling. It does not claim that TransitTrack's full Supabase migration is complete. Signaling/session permissions can be moved to Supabase with that migration; hosted Supabase still cannot run a TURN relay.

## Access and stopping
- Server checks admin before any admin data access; only the requester may view/answer. Any admin may stop.
- Native verifies current paired device credential and company/vehicle/type assignment over fixed HTTPS.
- Current requester role and device binding are rechecked during pulses. Ten-minute maximum and a native monotonic deadline remain.
- The tablet displays a native Stop control; screen capture has a foreground-service notification with Stop. Stream disconnection, local Stop, backgrounding during capture and expiry release native capture.
- Camera support reserves the QR camera, which resumes after support ends. NFC and keypad remain usable.
- Signaling must contain exactly one video media section with send-only offer and receive-only answer. No audio/data channels are created. No recording feature is included.
- Offer/answer SDP is private server metadata, not returned through the entity gateway, logs or cached tablet context. It includes network addresses and temporary ICE credentials. End/expiry handling clears the two SDP fields. An abandoned session never queried again may retain inaccessible SDP until maintenance; scheduled retention deletion is not implemented.
- A permanent ended_at blocks reauthorization even if a stale concurrent state update arrives. Base44 check/write is not an atomic compare-and-set: simultaneous requests may invalidate one another; no strict uniqueness guarantee is claimed.
- Media is protected by WebRTC DTLS-SRTP. Signaling authorization is trusted. A TURN relay forwards encrypted packets.
- TURN credentials are short-lived per-session HMAC credentials. The master shared secret remains server-side.

## Configuration (not applied)
Enable only for final testing via backend secrets:
- TT_SUPPORT_ENABLED=true
- TT_SUPPORT_TRANSPORT=webrtc

With no STUN/TURN configuration, this is direct/local-network mode. Internet/mobile connections are not guaranteed. No default third-party STUN service is silently selected.

Optional connectivity settings:
- TT_SUPPORT_STUN_URL=stun:relay.YOUR-DOMAIN:3478
- TT_SUPPORT_TURN_URL=turns:relay.YOUR-DOMAIN:5349?transport=tcp
- TT_SUPPORT_TURN_SECRET=<operator-generated random shared secret, at least 32 characters>

The TURN URL and secret must be supplied together. Misconfiguration disables session creation. The shared secret must match coturn's static-auth-secret, with use-auth-secret enabled. TTLs end approximately one minute after the viewing session deadline. Setting only old TT_LIVEKIT_* values cannot activate this transport.

Direct connections can fail across carrier NAT, guest Wi-Fi or firewalls. For reliable remote mobile viewing, deploy a TURN relay on an internet-accessible server. A normal Supabase Cloud project cannot host that process. Relay software has no LiveKit subscription, but the machine, bandwidth, domain and maintenance can still cost money.

## Optional relay preparation
infra/turn/ contains a configuration example and host requirements. It has not been deployed or exposed publicly. No relay server, account, domain, paid service, secret or signing key was provisioned.

## Validation and limits
- The full release security suite passes: 154 tests. Within it, 36 focused backend policy/signaling tests pass. Includes non-admin/wrong-device rejection, terminal state, restricted SDP, synthetic TURN HMAC validation and legacy-transport rejection.
- 43 relevant JS tests pass, including receive-only configuration, cancellation, disconnect cleanup and no-address rejection.
- Android Java/Kotlin compilation and 42 JVM tests pass. These do not exercise real capture hardware.
- Seven mocked Admin browser scenarios pass; the native handoff/QR reservation scenario also passes.
- A real browser-to-browser synthetic video test was attempted. The sandbox produced zero ICE candidates; allowing loopback allowed gathering to finish but still produced no candidates or media. It did not pass. The opt-in e2e/direct-tablet-viewer.spec.js retains the test for a network-capable environment (TT_RUN_WEBRTC_MEDIA=1). Do not interpret mocked tests as proof of working tablet video.
- No real tablet capture, mobile network, TURN allocation or hosted native HTTPS test has been performed.

## Final combined acceptance (pending)
Preserve com.transittrack.app, existing signing identity, pairing/PINs and saved queues. Install once at final handover; do not uninstall/reset. This stage generates no signed APK, deploys no relay and publishes no web frontend. Backend source changes auto-sync through Base44.

1. Verify native HTTPS reaches tabletSupport; the previous transport had a platform gateway 403 which mocks/compilation cannot resolve.
2. Enable WebRTC settings, install the combined update and verify support_transport=webrtc in health.
3. While parked, test screen/front/rear camera separately: approve/decline, native Stop, notification Stop, Admin Stop/close, no audio, QR pause/resume and NFC continuity.
4. Test same-Wi-Fi then mobile-to-office Wi-Fi. If direct fails, configure the relay and repeat. Verify actual received frames, not merely status labels.
5. Test expiry, role demotion, reassignment, revoked device credential, connection loss, permission callbacks after cancellation and simultaneous admin requests.
6. Verify local capture stops and a fresh approval is needed for another session.
7. Native iPad remote capture, passenger-binary separation and remaining full backend migration are separate work.

## Tablet startup diagnostics — 16 October 2026
A real tablet reached local approval and the red connecting control, then the Admin reported a failed session. The exact capture/ICE/signaling failure is not established yet. Do not treat the relay allocation check as proof of working tablet video.

Native capture now reports fixed stage/error codes (including HTTP status and timeouts) through a local toast and the private session. The backend accepts only a strict allowlist of stage/code formats; arbitrary exception text, SDP and credentials are discarded. Admin explains the stage when the updated UI is published. No approval, audio, recording or expiry rules changed.

Validation: 158 release security tests and 11 focused JS tests pass. New native Kotlin changes have not been compiled in this reset sandbox (Android toolchain unavailable); build and device verification remain required on the operator PC. No APK was generated or installed and no frontend was published. Backend/schema source auto-syncs. A repeat attempt with the updated native diagnostic code is required to identify the actual failure.

Operator has separately reported deploying coturn at relay.mcsweenstransport.com, successful TLS/renewal tests, authenticated browser relay candidates, monitoring/alert delivery and an encrypted configuration backup. These are operator-run results; master relay secret and monitoring URL were never retrieved here.

## Fleet owner approval policy update — 16 October 2026
The owner explicitly requested automatic acceptance of camera/screen permission messages. New native builds therefore remove the app-owned Allow/Decline dialog for authenticated admin requests. Native server authorization, assignment binding, current role/device checks, expiry, visible connecting/live Stop control, background stop and no-audio/no-recording restrictions remain.

This does not auto-click or bypass Android dialogs. Camera capture uses a valid runtime permission and asks Android if it is missing. Screen capture still calls createScreenCaptureIntent and requires Android's successful Activity result for each new session. Permission denial ends the session. The QR camera reservation event is emitted before native capture, with a short release interval before camera initialization.

This section supersedes earlier statements that every request requires the app-owned local approval dialog. Android system permission is separate. Existing installed builds retain their prior behavior until updated. Actual tablet video startup failure is still under diagnosis; a diagnostic build and another device attempt are required.

## Native ICE startup recovery — 16 October 2026
The operator's uploaded ADB log shows camera initialization progressing without a camera error, followed by app shutdown at ICE_GATHERING_ERROR. It does not establish the underlying network cause or prove the server was reached.

Native gathering now preserves individual candidate callbacks, merges missing candidates into the single-video offer without duplicating them, and waits up to 20 seconds for usable addresses rather than failing immediately on an empty first COMPLETE. Continuous gathering allows Android network discovery after initial startup. When TURN is configured, the offer waits for a relay candidate. Timeout still fails closed. Capture callbacks now report CAPTURE_ERROR separately from PEER_CONNECT_ERROR.

Five JVM regression cases cover delayed candidates after empty completion, required relay vs host-only, stale local SDP, duplicate/foreign/injected candidate rejection and multi-media rejection. Native debug Java/Kotlin compilation and app JVM tests pass. The 40 focused backend security tests and six frontend diagnostic tests pass. No signed APK generated, tablet installation performed, frontend published, relay setting changed or credential read. Live tablet-to-admin video remains unverified; rebuild/install over the existing app and retest.

## Native relay diagnostics — 17 October 2026 UTC
The operator supplied a current native log: camera capture runs at approximately
15–17 fps, then ICE_GATHERING_TIMEOUT occurs after 20 seconds. The operator
reports the UDP endpoint test also fails. This establishes capture startup and
an ICE readiness timeout, not the network/authentication root cause.

Native code now handles onIceCandidateError and reports only bounded numeric
TURN error codes. The timeout toast and TT-RemoteSupport log include H/S/R
(host/server-reflexive/relay candidate counts), E (latest available relay error),
configured transport (TLS/TCP/UDP/NONE) and current network type
(WIFI/CELL/OTHER/NONE/UNKNOWN). E0 means no usable error callback was observed,
not successful relay access. Authentication challenge codes alone must not be
treated as proof of bad credentials. No raw error text, SDP, URLs, addresses,
usernames, passwords or device credentials are logged or displayed.

This is diagnostic instrumentation, not a proven connection fix. Native update
installation and another controlled attempt remain required. No server settings,
permissions, signing identity, authentication or backend session schema changed.

GNEW/GGATHERING/GCOMPLETE also reports the gathering state, using a fixed native enum. Final Android debug Java/Kotlin compilation passes; 50 JVM tests pass with zero failures/errors, including three diagnostic count/privacy/bounds tests. No APK generated or installed and no frontend published. Backend behavior unchanged.
