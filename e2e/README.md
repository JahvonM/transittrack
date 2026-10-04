# TransitTrack browser regression tests

TransitTrack is pre-production. The default browser test command is mock-only:

```bash
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

playwright.config.js discovers only company-isolation.spec.js and
tablet-context.spec.js. Both intercept all API calls and exercise the compiled
frontend without live entity reads/writes, notification delivery or account changes.

The four checks cover centralized mechanic vehicles, approved company context,
tablet context projection/cache cleanup and backend PIN unlock UI. They do not
prove live backend RLS or real authentication sessions. Those boundaries have
separate unit tests using in-memory SDK adapters.

```bash
npm test
npm run test:security:release
```

The first command verifies implemented behavior; the second enforces stricter
production requirements and currently exits nonzero for 33 known failing checks.
See security-tests/README.md for root causes, test limits and the review ledger.

Legacy live specs and ad-hoc scripts in this directory are excluded from default
discovery. Do not run them: some use old ID/PIN contracts or seed/change hosted
development data. Before any live re-test, migrate those contracts and obtain
separate authorization for verified test accounts and record mutations. Do not
reuse real credentials in committed fixtures. No live re-test was performed in
Step 7. Test traces/reports are ignored so they are not auto-committed.
