// THE switch for the move from Base44 to Supabase (step 7).
//
//   'base44'    everything runs on Base44, as before.
//   'supabase'  the app that Base44 hosts (eager-transit-track-go.base44.app
//               and app.mcsweenstransport.com, which the tablets, the phone
//               app and the desktop app all open) talks to Supabase instead,
//               and the Base44 functions the installed tablet app posts to
//               pass those calls on to Supabase (forwardToSupabase.ts).
//
// vite.config.js reads LIVE_BACKEND from this file for the Base44 build, so
// changing it here and publishing switches the whole app. Going back is the
// same: set 'base44' (or redeploy the checkpoint before the switch).
// The steps around the switch are in docs/SWITCH-TO-SUPABASE.md.
export type Backend = 'base44' | 'supabase';

export const LIVE_BACKEND: Backend = 'supabase';

// Where this copy of the code runs. tools/supabase/build-functions.mjs writes
// 'supabase' into the copy under supabase/functions/_shared, so the Supabase
// functions never pass calls on to themselves.
export const RUNS_ON: Backend = 'base44';
