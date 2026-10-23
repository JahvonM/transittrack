# Android kiosk: Cloudflare and Supabase

Version 1.5 / build 6 opens https://app.mcsweenstransport.com and calls the existing Supabase driverSession, tabletControl, tabletSupport and tabletRecordings handlers directly. The device token, driver grant, binding checks, timeouts, redirect refusal and response size limits remain in place. No server secret is embedded. The Edge Functions deployment already uses --no-verify-jwt; device handlers authenticate the credentials in the JSON request.

APK downloads are restricted to HTTPS app.mcsweenstransport.com/native-releases/*.apk. Signature, version and SHA-256 checks remain required. NATIVE_RELEASE remains null: no APK has been approved for remote installation. Old tablets cannot use their old URL allowlist to download a new-domain release; update those tablets through the original signing environment.

## Before installation

1. Leave the existing tablet app connected to the Internet on its old host until pending boarding, job/signature and GPS uploads finish. Resolve or export review items before changing origin. End the shift and stop live viewing/recording before updating. Do not clear queues or app data.
2. Keep Base44 running: old installed apps and Windows still use it.
3. Build with tools/kiosk/Prepare-Tablet-Test.ps1 (uses build:supabase, JDK 17/21 and the existing signing setup). This builds a debug test APK and does not install it.
4. Update in place with the same package and signing key. Stop on signature mismatch; do not uninstall. Recordings in native app storage remain, but web localStorage is origin-specific. The new website cannot read the old host's pairing, settings, caches or offline queues. Pair through Admin again if asked, with the existing intended bus/company, then refresh the passenger directory. This is not an automatic browser-storage migration.
5. Verify PIN sign-in, GPS with screen off then resume, NFC/QR boarding and offline replay, tablet command acknowledgement, approved live viewing, local dashcam playback and admin recording access. Check all requests reach Supabase and no queued work is lost.

Physical device validation is still required. Windows migration and retirement of Base44 are separate remaining steps.
