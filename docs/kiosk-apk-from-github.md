# Tablet app file (.apk) from GitHub

GitHub can make the McSween Kiosk tablet app file, so updates don't need a build on the office PC.
The workflow is `.github/workflows/kiosk-apk.yml` (Actions → **Kiosk APK**).

## Why it needs the office PC's key

Android only installs an update when the new file is signed with the same key as the app already on the device.
The bus tablets got their app from builds on the office PC, which signs with that PC's Android debug key:
`C:\Users\Gameo\.android\debug.keystore`. GitHub signs with a copy of that key, so its files install as normal updates.

A file signed with any other key is refused. Admin then says the file is signed with a different key.
Never uninstall the app to get past that: uninstalling wipes the device's pairing and kiosk lock.

The T10 validator is the exception. Its app came from separate test builds with a different key, so neither the PC
file nor the GitHub file installs over it.

## One-time setup (done by the owner, never by an assistant)

1. On the office PC, open PowerShell (or Android Studio → Terminal) and run:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\debug.keystore")) | Set-Clipboard
   ```

   This copies the key, as text, to the clipboard. It prints nothing.
2. On GitHub, open the transittrack repository → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
3. Name: `KIOSK_SIGNING_KEYSTORE_BASE64`. Secret: paste. Click **Add secret**.
4. Clear the clipboard: `Set-Clipboard -Value ' '`.

GitHub never shows the secret again, and pull requests can't use it.
Keep a backup of `debug.keystore` somewhere safe as well. Without that key, the tablets can't take updates
without being set up again.

## Getting a file

- It builds by itself when tablet code (`android/`) changes on main. Run it by hand with
  Actions → Kiosk APK → **Run workflow**.
- Open the finished run → **Artifacts** → download. It unzips to
  `McSween-Kiosk-<version>-build-<code>-<date>-<commit>.apk` plus its SHA-256 checksum.
- The build checks that the file is signed with the PC key, and stops with an error if not.
  Files are kept for 30 days.

Install it the usual way: Admin → **Kiosk tablets** → **Set up a device** → choose the file →
**Update the app and open it**.
