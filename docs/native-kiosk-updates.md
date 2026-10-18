# Combined kiosk native update delivery

> Current release status: [kiosk-release-status.md](kiosk-release-status.md) (18 October 2026). Earlier checkpoint results below are historical.

Status: implemented, release catalog intentionally empty. No APK was built, signed, installed or published in this stage. Package identity remains `com.transittrack.app`; versionCode 1/versionName 1.0 are unchanged. Do not use the separate helper APK as a combined-app release.

## Admin and device flow
- Admin → Kiosk tablets → Tablet controls → Installed kiosk app reports actual Android package version/code, separately from helper capability and web build. Reports are telemetry, not attestation.
- Check native update reads a server-owned, reviewed release catalog. No approved artifact currently exists. Neither Admin nor WebView can supply an executable URL or replace release metadata through this endpoint.
- Admin requests a specific catalog release. Strong paired-device credentials are mandatory. The native executor obtains instructions directly from the fixed HTTPS verification endpoint; the WebView forwards only the command ID and existing pairing key.
- Requires Android 7/API24+ and existing device ownership. No enrollment is performed. Backend requires a parked assigned vehicle, tracking off and no open shift; native/page checks require a visible idle screen, three minutes without input and no saved/review/archive uploads.
- Downloads only bounded HTTPS files under the compiled app-domain release path, without redirects or URL credentials. Verifies exact bytes/SHA256, package, strictly newer version and exact existing signer set. Debuggable APKs, helper packages, missing certificates, different/rotated keys and downgrades are rejected.
- Stages PackageInstaller session, rechecks current server authorization/release and local work safety, then commits. A native progress dialog blocks new kiosk input during installation.
- Android prompts are never opened/accepted automatically. A pending-user-action result abandons the attempt.
- Receipts distinguish requested from confirmed. Installed version plus matching signer set on a later app start/health check confirms completion. Failure callback is fixed text; an unresolved attempt after ten minutes becomes unknown/interrupted, not success. Server receipts accept a final result after UPDATE_REQUESTED, never overwrite a terminal result.
- Credentials/signing keys are never persisted by the updater. Session ID, target version, public signer fingerprints and fixed status are persisted privately. Same package, no uninstall/reset/data clearing, existing web origin unchanged.

## Before activation / final one-time installation
1. Run the current security release suite and verify hosted durable-operation migrations/configuration. The old five-failure report is superseded: all 188 isolated security tests passed on 18 October 2026. Passing mocks does not confirm hosted activation.
2. Confirm the currently installed combined app package and public signing certificate. Obtain the existing signing configuration through the owner's secure build environment; do not generate replacement keys or commit private signing material.
3. Build a non-debuggable combined kiosk APK with a strictly increasing versionCode using that existing signing identity. This first combined installation is still a single final handover; existing installed builds do not gain a native updater merely from a web update.
4. Host the immutable APK at the allowed HTTPS app-domain /native-releases/<release-id>.apk path; verify direct 200 response, exact bytes/hash and no redirects. This distribution artifact/route is not provisioned yet.
5. Populate NATIVE_RELEASE in base44/shared/nativeRelease.ts only after review of those exact bytes. Catalog is currently null, so requests cannot trigger installation.
6. Verify the native fixed verification endpoint is reachable from the physical tablet. The earlier sandbox probe received a gateway 403; physical connectivity remains unverified.
7. On a development tablet, test same-key upgrade preserving pairing, PIN flow, preferences, queues and data. Test wrong package/key/hash/version, expired/revoked command, network loss, low storage, process interruption, busy/queued-work refusal and installer denial. Never uninstall to bypass a signature mismatch.
8. Verify managed Android 10 OEM behavior, automatic restart/resume (not promised), callback delivery, progress dialog and post-install version receipt. If the app does not resume itself, open it manually; status stays requested/unknown until confirmed.
9. Keep existing helper/FreeKiosk until this physical acceptance passes. Passenger app must exclude these kiosk plugins and REQUEST_INSTALL_PACKAGES.

## Automated validation
- Native policy tests: allowed origin/path, exact hash/length, same signing identity/package, newer version and non-debuggable requirement.
- Isolated backend tests: admin-only release lookup, empty-catalog rejection, server-pinned configured release, recent native health requirement, activity and requester rechecks, withdrawal, requested/final receipt lifecycle.
- Browser tests intercept all API requests: installed version, no-release state, deliberate admin update request, existing control and pairing/launch regressions.
- JVM and mocked tests do not prove Android PackageInstaller, OEM device ownership, TLS reachability or actual data preservation. Those remain physical acceptance work.
