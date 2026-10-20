# Functions on Supabase

These are the app's server functions, running on Supabase Edge Functions
(step 6 of the move from Base44).

- `base44/functions/<name>/entry.ts` is still the code to edit. Run
  `node tools/supabase/build-functions.mjs` to refresh the copies here; a test
  fails when they are out of step.
- `_shared/base44-compat.ts` is written by hand: it gives the functions the
  same Base44 calls (signed-in person, tables, files, email) on Supabase.
- `.github/workflows/supabase-functions.yml` deploys every function when this
  folder changes on main (needs the `SUPABASE_ACCESS_TOKEN` repository secret).
- `copyToSupabase` stays on Base44 only.

Settings the functions read (Supabase -> Edge Functions -> Secrets), copied
from Base44's secrets: `FIREBASE_SERVICE_ACCOUNT`, `TT_DURABLE_WRITES_ENABLED`,
`TT_SUPPORT_ENABLED`, `TT_SUPPORT_TRANSPORT`, `TT_SUPPORT_STUN_URL`,
`TT_SUPPORT_TURN_URL`, `TT_SUPPORT_TURN_SECRET`. Later: `RESEND_API_KEY` for
email (step 7). The rate-limit store
(`TT_ATOMIC_*`) needs nothing: it is this same project.
