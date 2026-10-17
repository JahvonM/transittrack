# Admin playback of tablet recordings

## What is implemented

Admin > Kiosk tablets > Tablet controls > Saved recordings > Browse recordings. Choose a date or all dates, load older videos, select Play and watch with browser video controls. Save a copy explicitly downloads the verified video. Dates are based on each clip's tablet clock and displayed in the administrator's local timezone. The library belongs to the physical tablet and includes its retained recordings; a reassigned bus label does not relabel old clips.

The kiosk must be open, visible and online. A visible native ADMIN RECORDINGS ACCESS / STOP button lets the tablet end the session. Sessions expire after ten minutes; initial connection times out in admin after two minutes. Closing the admin controls, losing the connection, pausing the kiosk, expiry or failing authorization ends access. Changes of admin role, company/vehicle/type assignment, pairing or credential validity are rechecked over the fixed native HTTPS endpoint. No new camera, microphone or screen permission is requested for saved-file access.

## Storage and transport

Videos remain in the tablet's app-private, backup-excluded recorder directory. This feature does not upload videos to Base44 or Supabase, create public URLs, or require a new streaming service. The existing operator-configured STUN/TURN relay is reused for a DTLS WebRTC data channel; signaling/session authorization stays in Base44. TURN bandwidth applies when traffic is relayed.

The admin browser receives the whole selected clip before playback, up to 32 MiB, in ordered 16 KiB chunks with sender backpressure. Completion requires the announced length and a matching SHA-256 hash. Incomplete downloads are discarded. One request is allowed at a time and transfers time out after three minutes; retries start from the beginning. The browser holds one selected clip in memory, not in persistent app storage. Its blob URL is revoked on replacement or disconnect. An explicit download remains under the admin's control after saving.

Only completed recorder filenames are readable. Partial clips, traversal, unrelated files and arbitrary paths are refused. Interrupted/finalized clips are labeled as possibly unplayable. Selecting a video protects it before reading, keeping normal loop cleanup from deleting it. The recorder, local player and remote transfer share the same synchronized clip store. Protection persists: delete unwanted protected clips locally to avoid filling the 1 GiB budget. No remote delete or record-start command is introduced. Recording, NFC and GPS continue while saved clips are read; actual concurrent use needs the device pilot below.

## Authorization boundary

`tabletRecordings` authorizes current platform admins for browser operations and the current strict device token for native operations. It binds every session to its requesting admin, tablet enrollment, company, bus, kiosk type and current request pointer. Another admin cannot attach to the same session. A lost initial response can reuse an untouched request; reconnecting a negotiated session ends it and creates a new one. Server auditing is required before authorizing the viewer. An audit failure fails closed.

`TabletRecordingSession` denies direct entity access using the same server-only RLS convention as existing support sessions; it is not exposed in the entity gateway. SDP is restricted to one DTLS/SCTP application section: no audio/video tracks. Live viewing retains its existing separate video-only validator and peer. Only short-lived ICE credentials are sent to the peers. Master relay secrets are unchanged and remain server-side. Session status omits SDP and credentials; terminal sessions clear stored SDP.

Native authorization pulses run every three seconds and fail closed, with a short local authorization lease during transfers. Admin status checks run every five seconds only while a session is open. No new background clip polling or automatic full-library transfer is added to ordinary passenger/driver traffic. Only a recordings-capable native build reports `recordings_available`; older tablets show an update instruction.

## Install and pilot

1. Windows PowerShell: `cd C:\Users\Gameo\StudioProjects\transittrack` then `git pull --ff-only`.
2. Open the project's android directory in Android Studio. Connect the existing tablet and press Run. Do not uninstall or clear data. This update adds native transfer code; a webpage refresh alone cannot install it.
3. Publish the frontend in Base44. Backend function/entity sources auto-sync through the existing Base44 sandbox workflow. No server/relay configuration changes or additional secrets are needed.
4. Reopen the kiosk and allow a fresh health/heartbeat report (normally about one minute). Refresh the admin tablet list.
5. Record and stop a short rear-camera video. In admin follow the Saved recordings path above. Keep the kiosk open. The browser waits for the next heartbeat and connection setup.
6. Choose the clip, check progress, play/pause/seek and Save a copy. Verify the copy is actual rear-camera video with the correct orientation and no audio.
7. Test the tablet Stop button, admin Disconnect, closing the controls, network loss and retry. No incomplete copy should become playable. Offline tablets must show connection failure rather than claiming success.
8. Test browsing/downloading a completed clip while a new clip is recording, NFC boarding and GPS tracking. Verify new recordings still rotate and continue. Then test expiry, admin demotion and re-pair/assignment revocation using dedicated test resources before production.

Physical tablet-to-admin transfer and native Android video playback cannot be verified from the remote sandbox. This remains a pilot until the above test succeeds on the user's hardware/network. No signed release APK or production publish was performed by the agent.

## Validation performed

- Android debug Kotlin/Java compilation, release manifest processing and 70 JVM tests passed. Release recorder Activity/Service remain unexported.
- 70 isolated security tests passed across recording policy/function, existing support policy and streaming validation, including both driver and boarding heartbeat capability/notice delivery. Tests use mocked stores; they do not create live records or change roles/devices.
- 42 focused JS tests passed for bounded recording reception and existing dashcam/shift/support behavior, including partial data, length/digest mismatch, wrong request IDs, oversize messages, disconnect, timeout and close-during-hash.
- Four Chromium recording UI tests passed with mocked transport/API: deliberate request, date filtering, verified-only playback/copy, blob cleanup, partial rejection and old-tablet gating. Existing tablet controls checks passed after correcting two outdated expected labels to the already-existing Android permission wording.
- Focused lint and production frontend build passed. The tests do not claim a real remote WebRTC transfer or real MP4 decoding; the physical pilot remains required.

Anonymous deployment check: POST request to the deployed recordings endpoint returned HTTP 401 with Sign in required. No live sessions, clip reads, role edits or device mutations were used for verification.
