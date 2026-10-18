# See AGENTS.md

Follow the instructions in `AGENTS.md`.

## Never delete without asking

Never delete webhooks, cron jobs, auth callbacks, or anything called from outside this codebase without asking the owner first. A search that finds no caller in the code does not make these unused. In this app that means:

- `base44/workflows/*` and the functions they run (`inspectionAlerts`, `maintenanceAlerts`, `learnTravelTimes`, `weeklyReport`).
- `base44/functions/*`: Base44 calls them by name, so code scanners report them all as unused.
- Sign-in hand-offs opened by other apps: `/oauth/consent`, `/desktop-signin`, `/phone-signin`, `/login`, `/reset-password`.
- Pages linked from the app stores: `/privacy`, `/terms`, `/reviewer-sandbox`.
- `public/sw.js` and `public/firebase-messaging-sw.js`: the browser loads them.
- `desktop/`: the desktop app.
- `checkAtomicStore`: an admin setup check that is run by hand.
- `src/components/ui/*` and the packages that come with the Base44 template: the Base44 editor writes code that uses them.
