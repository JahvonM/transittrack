# Mobile apps (iOS / Android) — Capacitor

> **Three native apps come from this repo:**
> - **McSween Kiosk** (`android/`, kiosk flavor): the managed bus tablet. Build: `:app:assembleKioskDebug`.
> - **McSween Driver** (`android/` store flavor + `driver-app/ios`): the Google Play / App Store app for a driver's own phone. See [docs/store-app.md](docs/store-app.md).
> - The passenger phone app (`ios/`, and the sections below).

This project is wrapped with [Capacitor](https://capacitorjs.com), which turns the
existing web app into real native iOS and Android projects (`ios/` and `android/`).
Whenever the web app changes, rebuild and re-sync those native shells:

```bash
npm run build
npx cap sync
```

## Building for each store

**Android** — can be built entirely on Linux/Windows/Mac:
1. Install [Android Studio](https://developer.android.com/studio).
2. `npx cap open android` (or open the `android/` folder directly in Android Studio).
3. Set your own `applicationId` if you don't want `com.transittrack.app`
   (Build > Edit Configuration, or `android/app/build.gradle`).
4. Build > Generate Signed Bundle/APK, upload the `.aab` to
   [Google Play Console](https://play.google.com/console) ($25 one-time fee).

**iOS — requires a Mac with Xcode** (Apple doesn't allow building/signing anywhere else).
If you don't have a Mac, a cloud Mac build service like
[Codemagic](https://codemagic.io) or [EAS Build](https://expo.dev/eas) can do this step for you.
1. `npx cap open ios` (or open `ios/App/App.xcworkspace` in Xcode — note `.xcworkspace`, not `.xcodeproj`, once CocoaPods has run).
2. Run `pod install` inside `ios/App` the first time (requires [CocoaPods](https://cocoapods.org)).
3. Set your Bundle Identifier and Signing Team in Xcode's project settings.
4. You'll need an [Apple Developer account](https://developer.apple.com/programs/) ($99/year).
5. Product > Archive, then submit through App Store Connect.

## How the phone app loads TransitTrack

`capacitor.config.json` sets `server.url` to the live site
(`https://eager-transit-track-go.base44.app`). The phone app opens the live
site inside its own window, so:

- sign-in, server calls and cookies work exactly as on the website (a bundled
  copy would run from `capacitor://localhost`, where the app's relative `/api`
  calls and the sign-in return address don't work);
- every Publish reaches the phone app straight away; a new store build is only
  needed when native parts change (plugins, permissions, icons).

If the site moves to another address (a custom domain), change `server.url`
and `allowNavigation` and ship a new store build.

**Sign-in inside the app:** email/password signs in inside the app. Google
blocks its sign-in page inside apps' web views, so in the phone app
"Continue with Google" and "Continue with Apple" open the phone's browser
(`@capacitor/browser`: a Safari view on iPhone, a Chrome tab on Android) at
`/phone-signin`, and the browser hands the session back through the link
`com.transittrack.app://signin`, the same way TransitTrack Desktop does with
its loopback listener. Details and the safety checks are in
`src/lib/phoneSignIn.js`:

- the app makes a random state and key; the key travels only in the `#` part
  of the browser link, so no server ever sees it;
- the browser page asks the person to tap "Open TransitTrack app", then seals
  the session with that key (AES-GCM, bound to the state);
- the app accepts only its own state, once, within 10 minutes.

The link name is registered in `Info.plist` (`CFBundleURLTypes`) and in the
Android manifest (intent filter on `MainActivity`). If you change the app ID,
keep `PHONE_SIGNIN_SCHEME` in step with both. A stronger option later:
Universal Links / App Links on the site's own address (needs the Apple Team
ID and the Android signing certificate).

## Board by Bluetooth

`@capacitor-community/bluetooth-le` lets the phone app send the passenger's
boarding code to the bus tablet (TransitTrack Helper 1.13+), on iPhone and
Android. The web code (`src/lib/bluetoothBoarding.js`) uses it only when the
installed app includes the plugin; older installs and browsers fall back to
Web Bluetooth (Chrome on Android) or the "show your QR" note.

- iOS: `NSBluetoothAlwaysUsageDescription` in `Info.plist`.
- Android: the plugin adds its permissions; the app manifest marks
  `BLUETOOTH_SCAN` as `neverForLocation` so Android 12+ only asks for
  "Nearby devices".
- After pulling: `npm install`, `npx cap sync`, then `pod install` in
  `ios/App` on the Mac/Codemagic.

## App identity

- `appId` is currently `com.transittrack.app` (in `capacitor.config.json`) — this is
  a placeholder. Change it to whatever reverse-domain ID you want to publish under
  *before* your first store submission; it can't be changed after you publish.
- Icons/splash screens were generated from the app's existing logo
  (`assets/icon.png`). To regenerate after changing the logo:
  ```bash
  npx capacitor-assets generate
  ```

## Location permissions

Only foreground location is requested so far (`NSLocationWhenInUseUsageDescription`
on iOS, `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` on Android) — matching how
the web app already behaves. If drivers need location tracking to keep working
with the screen off or the app minimized, that requires *background* location
permission on both platforms, which invites significantly stricter store review
(Google requires an in-app disclosure + written justification; Apple scrutinizes
it closely too). Decide that deliberately before adding it — see the comments
next to the relevant permission blocks in `android/app/src/main/AndroidManifest.xml`
and `ios/App/App/Info.plist`.

## Push notifications

The website/PWA and the Trusted Web Activity in `driver-android/` use existing
Firebase web push. A Capacitor Android build now uses
`src/lib/nativePush.js`: it checks permission, installs token listeners before
registering, cleans them up, and saves the FCM token through the existing
authorized backend. Registration failures do not show “Notifications on”.

For the Capacitor Android build:

1. Register the Android package used by that build in the same Firebase project
   as the current push sender.
2. Supply its `google-services.json` at `android/app/google-services.json` during
   the native build, then rebuild/sync. It is not present in this checkout.
3. On a real device, enable notifications and verify delivery with the app
   open, in the background, and closed. Browser mocks do not verify delivery.

**iPhone.** The code side is in place; it goes through Firebase like
Android and the website, so the server needs no Apple keys:

- `ios/App/App/AppDelegate.swift` starts Firebase and swaps Apple's APNs
  token for this phone's Firebase token before the app sees it (Capacitor's
  "Push Notifications with Firebase" guide). Firebase starts only when
  `ios/App/App/firebase/GoogleService-Info.plist` is in the build; without it
  the app still runs and says notifications need setup.
- `ios/App/Podfile` adds `FirebaseMessaging ~> 11.15` (the last line that
  supports iOS 13, the app's minimum).
- `ios/App/App/App.entitlements` turns on the Push Notifications capability.
- `src/lib/nativePush.js` never saves a raw APNs token (64 hex characters),
  so a build without the swap can't claim notifications work.
- The server adds `apns.payload.aps.sound = default` (iPhone alerts are
  silent without it) and `data.link`, which the phone app opens when the
  alert is tapped (Android too).

Still to do (needs the Apple Developer account and the Firebase console):

1. Apple Developer → Certificates, IDs & Profiles → Keys → **+** → tick
   **Apple Push Notifications service (APNs)** → download the `.p8` file
   (only downloadable once). Note its **Key ID** and your **Team ID**.
2. Firebase console, project `transit-track-1e9e4` → Project settings →
   **Add app** → iOS → bundle ID (the final one, `com.transittrack.app`
   for now) → download `GoogleService-Info.plist` → put it in
   `ios/App/App/firebase/`. It isn't a secret and can be committed.
3. Firebase → Project settings → **Cloud Messaging** → Apple app
   configuration → upload the `.p8` with its Key ID and Team ID.
4. Build on a Mac/Codemagic (`npm install`, `npx cap sync ios`,
   `pod install`), install on a real iPhone (the simulator can't receive
   pushes), sign in as an admin, turn notifications on, then Admin →
   Notifications → **Test alert to me**. Check it arrives with the app open, in the background, and
   closed, and that tapping it opens the right page.

Keep APNs/private service-account credentials on the server or in the native
build provider's secret storage. This change does not create signing keys,
configure developer accounts, or submit either store build.

Reference: https://capacitorjs.com/docs/v6/apis/push-notifications
