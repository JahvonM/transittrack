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
