# TransitTrack Desktop (Windows preview)

Admin and Mechanic workspaces using the existing TransitTrack website and backend.
Sign in with your existing email and password. Your role and backend permissions still apply.
Admin opens /admin; Mechanic opens /mechanic. Menus do not grant additional access.

## Install
Run TransitTrack-Desktop-Setup-0.1.0.exe on Windows 10/11 x64.
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
The initial cross-platform build disables executable metadata editing; sign production
builds with an owner-controlled certificate and enable executable editing before release.

## Current scope and limitations
- Remote website updates appear when the app loads; desktop-shell upgrades require a new installer.
- Internet is needed for live tracking and writes. The local connection screen provides retry.
- Existing web saved-work behavior is retained; no new offline guarantees are introduced.
- Email/password sign-in only. Google/OAuth desktop sign-in has not been integrated or verified.
- Print dialogs, file selection and downloads use Electron/Chromium's default handling.
- The existing Windows card-reader helper is a separate tool. Native USB/NFC is not implemented here.
- Electron web push delivery is not guaranteed; the app does not add a native push service.
- No signing credentials, backend secrets, device credentials or database keys are packaged.
- Security policy tests run in Node; installation and actual account login still need Windows testing.
- This is a desktop preview, not approval for production launch. Existing release security blockers remain.

The site URL is fixed in policy.cjs to https://eager-transit-track-go.base44.app.
