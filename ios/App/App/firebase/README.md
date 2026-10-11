# Firebase file for iPhone notifications

Put `GoogleService-Info.plist` in this folder (download it from the Firebase
console, project `transit-track-1e9e4`, after adding the iOS app with the
app's bundle ID). The file only identifies the Firebase project; it is not a
secret, so it can be committed.

Without it the app still builds and runs; it just reports that notifications
need setup instead of registering. See `MOBILE.md` → Push notifications.
