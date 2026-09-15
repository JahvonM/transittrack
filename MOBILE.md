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

Web push (Firebase Cloud Messaging via the browser) is already wired up for the
PWA — see `src/lib/firebase.js`. Inside the native shells, that same web-push
approach does **not** work on iOS (WKWebView doesn't support it), so native push
still needs to be wired in separately:

1. In the Firebase console (same project as the web app), add an **Android app**
   (package name must match `appId` above) and download `google-services.json` →
   place it at `android/app/google-services.json`.
2. Add an **iOS app** (bundle ID must match `appId`) and download
   `GoogleService-Info.plist` → place it at `ios/App/App/GoogleService-Info.plist`.
3. With both files in place, native push (via `@capacitor/push-notifications`,
   already installed) can register real device tokens through the same
   `PushToken` entity and `register_push_token`/`sendPushToTokens` backend
   plumbing the web push already uses — ask Claude to wire this up once you
   have those two files.
