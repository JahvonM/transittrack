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
