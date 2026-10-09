# TransitTrack Desktop (Windows preview)

Admin and Mechanic workspaces using the existing TransitTrack website and backend.
Sign in with your existing email and password, or with Google/Apple through your web browser
(see "Google and Apple sign-in" below). Your role and backend permissions still apply.
Admin opens /admin; Mechanic opens /mechanic. Menus do not grant additional access.

## Install
Run TransitTrack-Desktop-Setup-0.2.2.exe on Windows 10/11 x64.
The installer creates desktop and Start menu shortcuts. It installs for the current user.
This preview installer is unsigned. Windows may show an unknown-publisher warning.
Only install the file you obtained from the trusted project owner.

## Build and test
Install Node.js 22 or later. From this folder:
```
npm ci
npm test
npm run build:win
```
The installer is written to release/. Development launch: npm start.
Windows CI can build the same installer from the repository's Desktop Windows workflow.
The preview has application metadata and the TransitTrack icon. Sign production
builds with an owner-controlled certificate before release.

## Current scope and limitations
- Remote website updates appear when the app loads; desktop-shell upgrades require a new installer.
- Internet is needed for live tracking and writes. The local connection screen provides retry.
- Existing web saved-work behavior is retained; no new offline guarantees are introduced.
- Email/password sign-in works inside the window. Google, Apple, Microsoft and SSO sign-in finish in the
  person's own web browser (providers block sign-in inside app windows); see below.
- Print dialogs, file selection and downloads use Electron/Chromium's default handling.
- Devices → Tablet & NFC setup includes USB discovery, health checks, Helper update installs, tablet configuration, and Windows NFC start/status/card/beep tests.
- Official Windows ADB is bundled with its NOTICE. Enable USB debugging and approve the connection on the tablet. Manufacturer USB drivers may be needed.
- Select the signed setup BAT downloaded from Admin → Kiosk Tablets. The embedded APK is extracted and its declared hash checked; the BAT is never executed. Android enforces signing-key compatibility on update installation.
- Existing-tablet mode preserves the start URL, pairing and reader/GPS settings. Installs use adb install -r. No reset, uninstall or data-clear command is provided.
- New-tablet mode requires no accounts/device owner. Check pairing and driver hotspot settings on the tablet. Failed operations report partial completion.
- The NFC helper runs hidden while the desktop app is open and uses the existing Windows Smart Card integration on local port 8765. Use a supported reader and drivers. Card issuing still uses Admin → Card issuing → Connect reader.
- Windows policies may block PowerShell/Add-Type; the panel reports failure and does not change policy.
- Actual Windows installation, tablet setup and NFC hardware tests remain required.
- Electron web push delivery is not guaranteed; the app does not add a native push service.
- No signing credentials, backend secrets, device credentials or database keys are packaged.
- Security policy tests run in Node; installation and actual account login still need Windows testing.
- This is a desktop preview, not approval for production launch. Existing release security blockers remain.

## Google and Apple sign-in
Choosing "Continue with Google" (or Apple) in the desktop window does not load the provider inside the app.
Instead `browser-signin.cjs`:
1. starts a one-time listener on `127.0.0.1` (random port) with a random 256-bit `state`;
2. opens `https://eager-transit-track-go.base44.app/desktop-signin?port=…&state=…&provider=google`
   in the default browser, where the person signs in normally;
3. after they choose "Open TransitTrack Desktop" on that page, it POSTs the session to
   `http://127.0.0.1:<port>/callback` (`src/pages/DesktopSignIn.jsx`, `src/lib/desktopSignIn.js`);
4. the listener checks the Host, Origin and `state`, then closes; the desktop window loads the app
   with that session (the same `access_token` hand-off the website's own sign-in uses).
The listener closes after success, cancel or 10 minutes. If the browser asks to let the site connect
to apps on this device, choose Allow. The /desktop-signin page must be published on the website.

The site URL is fixed in policy.cjs to https://eager-transit-track-go.base44.app.
