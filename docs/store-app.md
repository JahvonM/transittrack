# McSween Driver: the store app for a driver's own phone

McSween Driver is on Google Play and the App Store for drivers who use their
own phone instead of a bus's driver tablet. It has the same driver screens
(shift, route, passengers, jobs, chat, inspections) and none of the kiosk
parts: no lock, no hidden settings corner, no hotspot, no card reader, no
dashcam. GPS comes from the phone.

The bus tablets stay exactly as they are. They run McSween Kiosk, installed
from Admin → Kiosk tablets → Set up a device.

| | McSween Kiosk (bus tablet) | McSween Driver (own phone) |
|---|---|---|
| Comes from | Admin → Set up a device (USB) | Google Play, App Store |
| App id | `com.transittrack.app` | `com.mcsweenstransport.driver` |
| Tied to | one bus | one driver |
| Bus | fixed in Admin | the driver picks it before each shift |
| Built from | `android/` (kiosk flavor) | `android/` (store flavor), `driver-app/ios` |

## How it works

1. **Admin → Kiosk tablets → Add a driver's own phone.** Pick the company and
   the driver. You get a code. It works once, for 7 days.
2. The driver installs **McSween Driver** and types the code. The phone is now
   that driver's.
3. Before each shift the app asks **Which bus are you driving?** It lists the
   company's buses in service. A bus with another driver on shift is shown
   but can't be picked.
4. The driver enters that bus's PIN, as on the tablet, and gets the usual
   driver screens. Sharing the bus's position uses the phone's GPS.
5. After the shift: Settings → This phone → **Change bus** (only when no
   shift is open).

In Admin the phone shows as "Driver's own phone · Ana Joseph · Driving Bus 3"
(or "Not on a bus"). Revoke or Remove works as for tablets.

Rules the server keeps (base44/functions/driverSession, tested in
`src/lib/__tests__/driverOwnDevice.test.js`):

- the phone can only pick its own company's buses that are in service;
- not a bus another device has an open shift on (`BUS_BUSY`);
- not a new bus while its own shift is open (`SHIFT_OPEN`);
- the bus PIN is still needed after every bus change; the old PIN, driver
  grant and background GPS session stop working;
- shifts are saved in the driver's name (and `driver_id`).

## GPS with the screen off

- **Android:** the same visible location service the tablets use, started from
  the open app. Android shows a "Bus location sharing is active"
  notification. No "all the time" location permission.
- **iPhone:** `driver-app/ios/App/App/DriverBackgroundPlugin.swift`, the same
  rules as the Android service: it starts only after the server confirms the
  pairing, PIN and bus, saves each point on the phone before upload, and
  stops when the server says the PIN, bus or pairing changed. It uses
  "While Using" location with iOS's location background mode, so iOS keeps
  it going with the screen off and shows the blue location pill. "Always" is
  never asked for.

The driver turns it on in Settings → GPS → **Keep sharing in the background**.

## Building

GitHub Actions → **Store app** (`.github/workflows/store-app.yml`). It runs by
itself on pull requests that touch `android/` or `driver-app/` (unsigned
builds, plus a check that the Android store app has no kiosk parts). Run it by
hand for the files you upload:

- **Android:** a signed `.aab`, under the run's Artifacts as
  `mcsween-driver-android`, when the Play upload key secrets are set.
- **iPhone:** tick **Send the iPhone build to TestFlight**. It's signed in the
  cloud with your App Store Connect key and uploaded; it shows in TestFlight
  after Apple processes it (10 to 30 minutes).

Secrets go into GitHub → Settings → Secrets and variables → Actions → New
repository secret. Type them there yourself; they never go in the code or a chat.

### One-time setup: Android

1. **Make an upload key** on your Windows PC (Java is already there for the
   kiosk scripts). In PowerShell:

   ```powershell
   keytool -genkeypair -v -keystore mcsween-driver-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Choose a password when asked. Keep the `.jks` file and the password safe
   (a password manager). Google can reset a lost upload key, but it takes days.

2. **Add four secrets:**
   - `STORE_KEYSTORE_BASE64`: in PowerShell, run
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("mcsween-driver-upload.jks")) | Set-Clipboard`
     and paste.
   - `STORE_KEYSTORE_PASSWORD`: the password.
   - `STORE_KEY_ALIAS`: `upload`
   - `STORE_KEY_PASSWORD`: the same password (keytool uses the same one unless you chose another).

3. **Play Console → Create app:** name *McSween Driver*, app, free. Package
   name comes from the first upload: `com.mcsweenstransport.driver`.
4. Run the workflow, download the `.aab`, and upload it under
   **Testing → Closed testing**. Keep Play App Signing on (the default).
5. A personal developer account needs **12 testers opted in for 14 days** in
   closed testing before Production unlocks. Your drivers are the testers:
   add their Google accounts to the test list and send them the opt-in link.
6. **App content** (Play Console asks for each):
   - Privacy policy: `https://app.mcsweenstransport.com/privacy`
   - App access: "All functionality is behind a code"; give the review code
     and bus PIN (see Review notes below).
   - Data safety: **Location (precise)** collected, for App functionality,
     not shared with third parties for ads, can't be turned off while sharing.
     **Name** (the driver's name from the office) and **Photos / audio** only
     when the driver adds them. Data is encrypted in transit. No account to
     delete: the office removes the phone in Admin.
   - **Foreground service permissions:** location. Description: "Shares the
     bus's position with the transport office and passengers while the driver
     shares it during a shift, with a visible notification. The driver starts
     and stops it." Play asks for a short video: record the phone starting a
     shift, turning on sharing, locking the screen and the notification.
   - Target audience: 18 and over. Ads: none.

### One-time setup: iPhone

1. **App Store Connect → Apps → + → New App:** iOS, name *McSween Driver*,
   bundle ID `com.mcsweenstransport.driver` (if it isn't in the list, the
   first workflow run registers it; then create the app), SKU `mcsween-driver`.
2. **Users and Access → Integrations → App Store Connect API → +:** name
   *GitHub*, access **Admin** (needed to create signing certificates in the
   cloud). Download the `.p8` file once.
3. **Add four secrets:**
   - `APPSTORE_KEY_ID`: the key's ID.
   - `APPSTORE_ISSUER_ID`: the Issuer ID above the keys list.
   - `APPSTORE_KEY_P8`: open the `.p8` file in Notepad and paste all of it.
   - `APPLE_TEAM_ID`: developer.apple.com → Account → Membership → Team ID.
4. Run the workflow with **Send the iPhone build to TestFlight** ticked.
5. **Ask for unlisted distribution** before you submit:
   <https://developer.apple.com/support/unlisted-app-distribution/>. Apple
   often turns down apps that only one company's staff can use when they are
   listed publicly (guideline 3.2). Unlisted apps are still on the App Store,
   reviewed the same way, but only found through the link you send drivers.
6. On the app's page: privacy policy URL as above; **App Privacy**: Location
   (precise), used for app functionality, linked to the driver, not used for
   tracking; Photos/Audio only when added by the driver.
7. Add the build from TestFlight to the version and submit.

### Notifications (optional, for job alerts)

Both apps send notifications through Firebase (project `transit-track-1e9e4`):

- Android: in the Firebase console add Android apps for both
  `com.mcsweenstransport.driver` and `com.transittrack.app`, then download
  `google-services.json` (one file lists both) into `android/app/`. With only
  one of them in the file, the other app's build stops with "No matching
  client found".
- iPhone: add an iOS app with bundle ID `com.mcsweenstransport.driver`, put its
  `GoogleService-Info.plist` in `driver-app/ios/App/App/firebase/`, and upload
  an APNs key in Firebase → Project settings → Cloud Messaging.

Without these the app works; job alerts just say notifications need setup.

## Store listing text

**Name:** McSween Driver

**Short description (Play, 80 characters):**
Driver app for McSween Transport: shifts, routes and live bus location.

**Subtitle (App Store, 30 characters):** Shifts, routes, live bus GPS

**Description:**

> McSween Driver is the driver app for McSween Transport's bus drivers who use
> their own phone.
>
> Your transport office gives you a code. Type it once and the phone is linked
> to you. Before each shift, pick the bus you're driving and enter its PIN.
>
> - Start and end your shift
> - See your route, stops and who to pick up
> - Share the bus's live position with the office and your passengers, also
>   with the screen off
> - Get new jobs and messages from the office
> - Do your bus inspections and report problems
>
> Location is shared only while you share the bus during a shift. It stops
> when you stop sharing, end the shift or change bus.
>
> You need a code from McSween Transport to use this app.

**Category:** Business (App Store), Business (Play). **Keywords (App Store):**
driver,bus,shift,route,transport,dispatch,gps

## Review notes (for both stores)

Make a code just before you submit: Admin → Kiosk tablets → **Add a driver's
own phone**, with a driver named *App Review* in a test company with a test
bus. Codes last 7 days. If review takes longer, make a new one and reply in
the review thread.

> This app is for McSween Transport's drivers; it needs a code from the
> office. Code: `XXXXXXXXXXXX` (works once). After entering it, tap
> **Bus 1** and enter the bus PIN `1234`. Tap **Start shift**, then
> **Start tracking** to share the bus's live position. Location is "While Using" only; it
> continues with the screen off and shows the system indicator.

## Before the first submission

- [ ] Privacy policy: the contact and business address in
      `src/pages/PrivacyPolicy.jsx` still say "awaiting confirmation". Both
      stores need a real contact.
- [ ] App icon: the store app uses the McSween Kiosk/McSween icon for now.
- [ ] Screenshots: Play needs phone screenshots; the App Store needs 6.9" and
      6.5" iPhone ones (and iPad if iPad stays on).
- [ ] Try it on a real phone from TestFlight / the closed test: pair, pick a
      bus, PIN, shift, sharing with the screen locked for 10 minutes, change bus.
