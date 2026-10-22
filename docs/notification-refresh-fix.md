# Notification device refresh — 22 October 2026

The existing `touch_updated_date()` trigger returned NULL for unchanged rows.
PostgREST therefore returned no row for an unchanged PATCH, and the server
compatibility client correctly treated the empty result as a missing record.
Push registration repeatedly updates the same identity, so a saved device
could incorrectly show “Could not save this device” on subsequent attempts.

Migration `20261022164500_return_unchanged_updates.sql` returns NEW for an
unchanged update, preserving its timestamp and normal UPDATE RETURNING
semantics. It was applied to the live Supabase project in a transaction with
a temporary, RLS-enabled test table. Checks passed for unchanged updates,
changed updates, explicit copied timestamps, and genuinely missing records.
No real application rows, permissions, or notification tokens were changed
by the verification. The temporary table was dropped on commit.

`supabase/tests/unchanged_updates.sql` retains the rollback-only regression
check. Notification registration and compatibility tests passed (45 tests),
as did the notice and data-map checks (7 tests), and the production build.

The frontend updates repeated registration notices instead of stacking them,
and contains narrow-screen notices within the viewport. These UI changes,
and the one-finger map fix, still need the Base44 website publication.
The database fix is already active and does not require an app reinstall.
A retry on the affected iPhone is still needed to verify its actual flow.
