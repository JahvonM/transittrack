# Mobile app (iOS / Android) — Capacitor

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

**Sign-in inside the app:** email/password and Sign in with Apple stay inside
the app. Google blocks its sign-in page inside apps' web views, so the Google
button opens Safari/Chrome and the user ends up signed in there, not in the
app. Fix before launch if passengers use Google sign-in (for example, hide
the Google button in the phone app, or hand sign-in to the system browser and
back, as the desktop app does).

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

**iOS remains incomplete.** Capacitor PushNotifications gives an APNs token on
iOS, whereas this backend sends via FCM. Adding a plist alone does not bridge
that difference. An iOS Firebase Messaging bridge, its app configuration,
Push Notifications capability, and APNs configuration in Firebase are needed,
followed by a signed device test. Until then the code reports that native
notification setup is required and does not store an APNs token as an FCM token.

Keep APNs/private service-account credentials on the server or in the native
build provider's secret storage. This change does not create signing keys,
configure developer accounts, or submit either store build.

Reference: https://capacitorjs.com/docs/v6/apis/push-notifications
