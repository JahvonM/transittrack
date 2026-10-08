# TransitTrack Driver for Android

An Android app for the company phones that opens the driver phone app
(`/driver-phone`) full screen in Chrome. It is a Trusted Web Activity: the
same live website, so "Continue with Google", notifications and every update
work exactly as on the website. There is nothing to rebuild when the website
changes.

Why not the Capacitor project in `../android`: it runs the app inside its own
built-in browser view, where Google refuses "Continue with Google", and its
calls to the server would go to the phone itself instead of TransitTrack. It
stays untouched.

## What you need

- A computer with Node.js 18 or newer.
- Your own signing key. This folder never contains or creates one. Use a key
  you already keep for company apps, or create one on your computer when the
  build asks (keep that file and its passwords safe: every future update must
  be signed with the same key).
- No Firebase file is needed: notifications come through Chrome, the same way
  they reach the website today.

## Build the app (about 15 minutes the first time)

1. Install the builder: `npm install -g @bubblewrap/cli`
2. In this folder, open `twa-manifest.json` and set `signingKey.path` (full
   path to your keystore file) and `signingKey.alias`.
3. Run `bubblewrap build`. The first time it offers to download Java and the
   Android tools it needs: answer yes. It asks for your keystore and key
   passwords.
4. It produces `app-release-signed.apk`. Install it on the company phones the
   same way as the kiosk helper.

## Hide the address bar (one-time)

Until the website confirms it trusts your app, Chrome shows a thin address
bar at the top. To remove it:

1. Run `keytool -list -v -keystore YOUR_KEYSTORE -alias YOUR_ALIAS` and copy
   the `SHA256:` line (a public fingerprint, safe to share; it is not your key
   or password).
2. Send that line to Claude. It adds `public/.well-known/assetlinks.json` to
   the website and publishes it with your approval.

## On each phone

1. Make sure Chrome is installed and up to date.
2. Open **Driver**, tap **Continue with Google** and sign in with the
   driver's Gmail (it must be on their driver record in Admin, with
   **Can use the phone app** switched on).
3. In the app, go to **Me** and tap **Turn on notifications**.
4. For backup GPS: allow location **While using the app**, and keep the app
   open and the phone charging when dispatch switches backup GPS on.

## Updating

Website changes reach the app straight away. Only rebuild if the app name,
icon or start page changes: raise `appVersionCode` by 1, run
`bubblewrap build` again with the same key, and reinstall.
