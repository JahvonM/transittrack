# Background driver GPS — Android kiosk 1.2 / build 3

Implemented, with automated native/storage/policy and browser checks. Actual screen-off, receiver, power and reboot acceptance is still required on the owner's Android 10 tablets. No signed APK was published and no existing tablet was reset or enrolled.

## Operator flow

Driver PIN unlock → More → driver/tablet settings → GPS with screen off → Keep sharing in the background. This is off by default and asks for Android location permission only when deliberately enabled. It starts when this bus is sharing with a valid driver grant. The existing USB source switch chooses USB or tablet GPS; USB does not silently fall back to another source when disconnected.

An ongoing Android foreground-service notification identifies active location sharing and opens the app. Stop background GPS in that notification disables the background preference and session; ordinary foreground sharing remains a separate driver control. Android notification visibility is subject to the OS notification setting. Stopping sharing from the driver screen stops the native session. Unpairing waits for native stop/session removal and explains a failure instead of leaving tracking running unnoticed. Switching into boarding mode also ends native driver tracking.

The card-reader lifecycle remains tied to the ready boarding page. It reconnects on resume and after USB interruption; a sleeping or closed boarding screen does not silently consume cards or fabricate completed check-ins. Home/USB defaults and keep-awake remain the existing opt-in setup.

## Ownership and upload

- The service owns one location source independently of the WebView. GPS plugin and service share a serialized USB executor, preventing overlapping old/new serial-reader loops during transfers.
- While the driver page is responsive, its existing live-update pipeline keeps trail, next-stop and notification behavior. A local five-second pulse indicates that uploader is alive. If it becomes hidden or stops responding, native live updates take over.
- A bounded page/native upload gate prevents ordinary same-tablet live/history overlap; a dead page's gate expires after 20 seconds. This is not a database transaction or a claim of deployment-wide exactly-once behavior for delayed/concurrent hosted calls.
- Every accepted upload sample is committed to SQLite before publication as a durable position. Disk writes and HTTPS calls run away from the UI thread. Samples outside coordinate/speed/accuracy/freshness limits are refused.
- Live updates use the existing server location pipeline. Native history uses existing upload_track handling; old history does not generate current driving events or stop alerts.
- Native history is separate from existing web queues. Existing saved check-ins, inspections, GPS rows and recordings are untouched. New native points carry an immutable original device/company/bus assignment and stable queue ID.

## Authorization and persistence

Native setup independently posts to a compiled fixed HTTPS driverSession endpoint. No WebView-supplied URL is accepted, TLS verification remains enabled and redirects are refused. The backend requires strong current device enrollment, the current driver PIN grant and explicit matching assignment; legacy device-ID-only authorization is insufficient.

The encrypted lease uses AES-GCM with a per-installation Android Keystore encryption key, independent of APK signing. Lease and SQLite files are in no-backup private storage. Secrets never enter intents, notification text, GPS rows, diagnostic messages or exports. The lease cannot extend beyond the server grant or twenty hours. Expiry/clock rollback stops collection; successful requests recheck revocation, assignment, PIN version and server sharing state. Offline revocation cannot be learned immediately: collection can continue only within the already verified lease, and server writes always require current authorization.

SQLite acknowledgements remove only exact acknowledged IDs in a transaction. Rejected/expired/old-assignment batches are held for review and later pending work continues. The queue stops accepting new samples at 10,000 retained rows or under 128 MiB free space rather than deleting existing records. Upload failures back off and honor bounded Retry-After values. Low-battery GPS parks at 5% unplugged and resumes on charging/8%; its bounded CPU wake lock is released while parked or stopped.

Driver settings show waiting/review counts and offer a JSON export without clearing originals. Export independently verifies current driver/device/assignment authorization, then uses a maximum sixty-second native authorization cache keyed to that exact credential set. Stopping/unpairing invalidates pending exports. Export queries are restricted to the current binding. Records belonging to an old assignment remain retained and require a separate administrator recovery process; they are not disclosed to a newly assigned company's driver.

Admin receives separately timestamped native GPS health, not a refreshed copy of stale web/helper telemetry. The additive native_tracking_health JSONB migration keeps the Supabase schema aligned; it does not move the operational backend away from Base44 or create cloud video storage.

## Recovery limits

START_STICKY requests recovery after an OS process kill. On Android 8–10, boot/package-replaced recovery attempts to restart an opted-in, unexpired lease. On Android 11+, the boot receiver waits for app opening; a foreground driver page can restore the same unexpired lease even offline. Android force-stop, revoked permissions, manufacturer battery restrictions and an unresponsive whole application process cannot be bypassed or guaranteed away by this service. No camera or screen-viewing session is started by recovery.

Native reboot/update gates refuse while the driver location service is active. Saved SQLite rows survive a normal same-key app update; do not uninstall or change signing identity. The native release catalog stays empty until a reviewed signed artifact and physical upgrade test are available.

## Physical acceptance

On a development tablet while parked: verify permission denial and opt-in; test USB and internal GPS separately; hide the app and switch the screen off; confirm live fleet updates and notification; disconnect/reconnect the receiver; test airplane mode/reconnect and saved-point export; stop sharing and verify the service stops; test process kill/reboot and expired/revoked grants; test low battery/charger recovery and same-key upgrade. Confirm boarding-reader recovery separately after wake. Keep the existing helper and FreeKiosk until required hardware checks pass.
