# TransitTrack browser regression tests

TransitTrack is pre-production. The default browser test command is mock-only:

```bash
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

playwright.config.js discovers only company-isolation.spec.js and
tablet-context.spec.js, saved-work.spec.js, message-notifications.spec.js and server-codes.spec.js.
All intercept API calls and exercise the compiled
frontend without live entity reads/writes, notification delivery or account changes.

The thirteen checks cover centralized mechanic vehicles, approved company context,
tablet context projection/cache cleanup, backend PIN unlock UI, saved-work export,
admin archive/removal, fresh role checks, GPS preservation on driver unpairing
and acknowledged text/photo message IDs in mechanic/company/staff notification calls,
server company-code issuance and twelve-digit boarding keypad input. They do not
prove live backend RLS or real authentication sessions. Those boundaries have
separate unit tests using in-memory SDK adapters.

```bash
npm test
npm run test:security:release
```

The first command verifies implemented behavior; the second enforces stricter
production requirements and currently has 21 passing and 17 failing checks (38 total after Step 8) and exits nonzero.
See security-tests/README.md for root causes, test limits and the review ledger.

Legacy live specs and ad-hoc scripts in this directory are excluded from default
discovery. Do not run them: some use old ID/PIN contracts or seed/change hosted
development data. Before any live re-test, migrate those contracts and obtain
separate authorization for verified test accounts and record mutations. Do not
reuse real credentials in committed fixtures. No live re-test was performed in
Step 7. Test traces/reports are ignored so they are not auto-committed.
