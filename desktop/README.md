# TransitTrack Desktop (Windows preview)

Admin and Mechanic workspaces using the existing TransitTrack website and backend.
Sign in with your existing email and password. Your role and backend permissions still apply.
Admin opens /admin; Mechanic opens /mechanic. Menus do not grant additional access.

## Install
Run TransitTrack-Desktop-Setup-0.2.0.exe on Windows 10/11 x64.
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
- Email/password sign-in only. Google/OAuth desktop sign-in has not been integrated or verified.
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

The site URL is fixed in policy.cjs to https://eager-transit-track-go.base44.app.
