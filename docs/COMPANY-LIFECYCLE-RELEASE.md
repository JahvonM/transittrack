# Company deletion and orphan recovery

## Implementation

`deleteCompanySafely` requires an authenticated administrator and calls the
Supabase-only `companyLifecycle` compatibility extension. It executes
`tt_company_lifecycle` as one PostgreSQL transaction. There is no sequential
Base44 fallback. Direct company deletion is blocked in entityAccess and by a
PostgreSQL trigger. Browser database roles cannot execute the RPC.

The transaction retains drivers, vehicles and routes, clears their company
assignments and operational credentials, disables routes/tracking, revokes
memberships, company/device/verification grants and NFC access, unpairs devices,
ends tablet support/recording sessions and open shifts, clears departing users'
company credentials, and records an audit event. Trips, inspections, invoices,
messages and other historical records retain their original company ids.
Global administrator/mechanic access remains intact. Custom view assignments
are removed from affected non-admin/non-mechanic staff because these roles grant
global historical access rather than company-scoped access.

Admin → Companies → Find records from removed companies performs a read-only
inventory. Recovery is explicitly confirmed per missing company. Inventory
failure produces no recovery list; recovery rechecks that the company is absent.
Inactive historical memberships/cards are not repeatedly offered for recovery.
Unassigned drivers, vehicles and routes can be reassigned to existing companies
or individually deleted by administrators. Existing edit dialogs require a
company for vehicles/routes; choosing a new company reassigns retained assets.

Assignment triggers prevent new company references to deleted companies.
Cleanup takes short-lived write locks across company-bearing tables to avoid
concurrent inserts escaping revocation; lock acquisition times out after five
seconds and the entire transaction rolls back. Run cleanup during a quiet
operating window. Previously downloaded/offline tablet data cannot be remotely
erased by server credential revocation; old credentials cannot regain server
access, and tablets must be re-paired before reuse.

## Tests

- Unit/handler regression: `npm test`.
- Security release requirements: `npm run test:security:release`.
- Lint/build/browser checks: `npm run lint`, `npm run build`, `npm run test:e2e`.
- Database acceptance: `.github/workflows/company-lifecycle.yml` creates a fresh
  PostgreSQL 16 database and runs `tools/company-lifecycle-check.mjs`. Covers
  authorization, direct-delete protection, forced rollback, revocation,
  historical retention, repeat requests, orphan recovery, reassignment and an
  independent concurrent writer. Only accepts a localhost `tt_company_test` URL.
- Local SQL validation uses PGlite; it does not replace PostgreSQL concurrency
  CI or hosted acceptance. No production data is used in these tests.

## Release gates (must be verified before merge)

1. Exact PR head: all CI checks pass, including PostgreSQL acceptance.
2. Hosted Supabase schema: verify migration history and all expected tables/
   columns. Confirm a restorable database backup and record its timestamp and
   restore procedure. These are not verifiable through GitHub alone.
3. Apply/verify migrations `20261024000100` and `20261024000200` through the
   established Supabase GitHub migration process. They install schema/functions/
   guards only; they do not invoke cleanup or delete business data.
4. Verify the service-only RPC in a staging project using synthetic fixtures.
5. Merge only after these gates. Main automatically deploys Supabase functions.
   Verify the deployment job actually deployed (a missing token produces a
   skipped deployment notice). Publish the synced UI through Base44's established
   dashboard workflow; do not bypass it with a CLI deployment.
6. Production smoke checks require authorized test accounts/devices for admin,
   driver, passenger and kiosk flows. Do not delete a real company or invoke
   orphan recovery in production without the owner's explicit approval.

## Rollback

Before any cleanup, reverting application code leaves all business data intact.
Keep the database direct-delete guard and nullable company columns even when
rolling application code back; old direct deletion should fail closed. Disable
the RPC if needed with `REVOKE EXECUTE ON FUNCTION
public.tt_company_lifecycle(text,text,text) FROM service_role` and deploy a UI
without the deletion control. Restore execution only after verification.

A completed cleanup intentionally revokes credentials and detaches assignments;
reverting code does not reverse those data changes. Restore selectively from a
verified backup only with explicit approval and a plan to preserve subsequent
writes. Reissue credentials/re-pair devices instead of resurrecting revoked
secrets. Retained assets can be reassigned normally.

## Outstanding deployment evidence

Hosted migration state, backup availability, staging acceptance, UI publishing
and authenticated production smoke checks have not yet been verified. Keep the
PR as draft until that evidence is available. Email planning/implementation is
scheduled after this release, with no DNS changes or live accounts authorized.
