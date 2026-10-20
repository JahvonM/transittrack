# Switching the live app from Base44 to Supabase (step 7)

One switch moves everything: `LIVE_BACKEND` in `base44/shared/liveBackend.ts`.

- `'base44'`: everything runs on Base44, as before.
- `'supabase'`: the app Base44 hosts (app.mcsweenstransport.com and
  eager-transit-track-go.base44.app) talks to Supabase. That is the page the
  website, the installed tablet and phone apps and the Windows desktop app all
  open, so they all move together on one publish. No DNS change.

What else happens on Base44 while the switch says `'supabase'`:

- The functions the installed tablet app calls directly (background GPS,
  tablet controls, screen view, recordings, and boarding/heartbeat until a
  tablet reloads) pass each call on to the same function on Supabase
  (`base44/shared/forwardToSupabase.ts`). Tablets need no reinstall.
- Base44's scheduled jobs (inspection and maintenance reminders, travel-time
  learning, weekly report) stand down. The same jobs run on Supabase's own
  schedule (pg_cron), so nobody gets an email twice.
- In the desktop app, "Continue with Google/Apple" still signs in through the
  person's browser (`desktopProviderUrl` in `src/api/backend.supabase.js`).

## Before the switch (any time)

1. Google sign-in on in Supabase (Authentication → Sign In / Providers).
2. Supabase → Edge Functions → Secrets has `FIREBASE_SERVICE_ACCOUNT`,
   `TT_SUPPORT_ENABLED`, `TT_SUPPORT_TRANSPORT`, `TT_SUPPORT_TURN_URL`,
   `TT_SUPPORT_TURN_SECRET` and `RESEND_API_KEY`. Check with the "Supabase
   readiness" workflow (`tools/supabase/readiness.mjs`; bump `RUN` to re-run).
   Its result is in the project's API logs: `tt_ci=readiness`.
3. The admin sets their own password on the new system: new.mcsweenstransport.com
   → Forgot password → sign in. Then someone can definitely get into Admin
   afterwards.

## The switch (about 15 minutes, best when no bus is running)

4. Final copy, on the live app while it is still on Base44:
   Admin → My profile → Copy data to Supabase → **Copy all data**, then
   **Copy files**, then **Set up sign-in accounts**. (This only works before the
   switch: `copyToSupabase` runs on Base44.)
5. Set `LIVE_BACKEND` to `'supabase'`, run `node tools/supabase/build-functions.mjs`,
   the tests, then checkpoint and publish on Base44.
6. Turn on Supabase's email jobs:
   ```sql
   select cron.alter_job(jobid, active := true) from cron.job
    where jobname in ('tt-maintenance-alerts', 'tt-inspection-alerts', 'tt-weekly-report');
   ```
7. Check: sign in on app.mcsweenstransport.com; a bus moves on the map; a
   boarding check-in goes through; a push notification arrives; the desktop
   app signs in; Admin → Kiosk tablets → screen view opens. Supabase's function
   logs show the calls; Base44's show only passed-on calls.

## What people notice

- Everyone signs in again, once. Passwords don't carry over from Base44: the
  first time, use **Forgot password** (or Continue with Google).
- Tablets: nothing to do. They pick up the new version next time they reload;
  until then their calls are passed on.

## Going back

Set `LIVE_BACKEND` back to `'base44'` and publish (or redeploy the checkpoint
from before the switch), and turn the three Supabase email jobs off again
(`active := false`). Anything saved while on Supabase stays in Supabase only.

## After

- Step 8: new name and logo in the native apps, then rebuild them to talk to
  Supabase directly, and re-pair the tablets (this also retires the two older
  tablets' legacy sign-in).
- Step 9: once things have run quietly for a while, retire Base44.
