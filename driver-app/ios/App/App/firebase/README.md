# Firebase file for McSween Driver notifications

Put `GoogleService-Info.plist` in this folder: in the Firebase console
(project `transit-track-1e9e4`) add an iOS app with the bundle ID
`com.mcsweenstransport.driver` and download its file. It only identifies the
Firebase project; it is not a secret, so it can be committed.

Without it the app still builds and runs; job alerts just say notifications
need setup.
