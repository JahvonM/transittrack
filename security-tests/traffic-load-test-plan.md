# TransitTrack controlled traffic test plan

Status: Monitoring implemented. No live stress test performed; capacity is unverified.
Run synthetic workloads against an isolated, published clone with test accounts and
test tablet records. Never use the operational app or its tablet credentials.

## Baseline and limits

Before generating traffic, obtain the Base44 plan's current limits from its
dashboard/support: function invocation limits, storage read/write limits,
concurrency, execution time, payload size, and what scope each limit applies to.
Do not assume a published request limit equals usable application capacity.
Record the app commit, Base44 plan, test region, dataset sizes, and endpoint limits.
Use Admin > Fleet health > Request health during normal use to identify failing
functions and distinguish HTTP 429, authentication failures and network failures.
The panel is a rolling device snapshot, not centralized server telemetry. Supplement
it with backend logs and the load generator's monotonic timings.

## Workloads

Use distinct synthetic identities/credentials per virtual passenger or tablet.
Read-only stages first:
- Passenger: authenticate, approved company context, startup, Home/Journey changes,
  live refresh, foreground/background and reopen.
- Admin: combined overview startup, cached section navigation, forced refresh,
  Fleet health and live fleet.
- Driver tablet: full startup/unlock, light heartbeats, periodic full refresh.
- Boarding tablet: heartbeat and saved-directory refresh.

Boarding, GPS uploads, shifts, PIN attempts and inspection/photo retries are
separate mutation tests in the isolated clone. Use fabricated people, cards,
positions and inspection records. Test idempotency and concurrency, not real routes.

## Staged run

1. One user/device of each role for 5 minutes: verify correctness and baseline.
2. 5 concurrent passengers and 2 driver/boarding pairs for 10 minutes.
3. 10 passengers and 5 pairs for 10 minutes.
4. 25 passengers and 10 pairs for 15 minutes.
5. 50 passengers and 20 pairs for 15 minutes, only if earlier stages meet criteria.
6. Sustained 60-minute soak at the highest passing stage.
7. Isolated restart storm: stagger then deliberately synchronize reopen events.

These are proposed test stages, not supported capacity claims. Set an explicit
request budget before each stage and advance one stage at a time. Keep 1 admin
active throughout. Stop the generator immediately on breached criteria.

## Record and stop criteria

For every endpoint record request volume, concurrency, HTTP status, partial-list
failures, retries, and p50/p95/p99 latency. Record storage operations and function
timeouts from platform logs if available. Track client queued work and sync age.
Export only aggregate counts/timings; never export tokens, PINs, card UIDs, body
payloads, passenger details or pairing codes.

Proposed acceptance targets (verify against operational needs):
- No unexpected authentication/authorization errors or leaked credentials.
- No lost boarding/inspection/GPS work or duplicate mutation records.
- Startup p95 below 3 seconds; boarding acknowledgement p95 below 2 seconds.
- No sustained 429s; unexpected 5xx below 0.5% over a stage.
- Pause if busy or 5xx replies exceed 1% in a minute, p95 exceeds 5 seconds for
  two minutes, sync backlog grows continuously, or correctness checks fail.
- Security or data-integrity failure stops the entire run immediately.
Keep platform Retry-After instructions enabled. Never disable attempt limits to
make a benchmark pass.

## Decision after results

Select capacity only from measured passing stages; document headroom for normal
growth and restart bursts. If reads dominate, add delta delivery and server-side
cache invalidation. If writes/jobs dominate, queue background work. If platform
limits remain the bottleneck, evaluate a separate GPS/boarding service before
changing hosting. Repeat the same workload after any infrastructure change.

## Checks already available

Run: node node_modules/vitest/vitest.mjs run src/lib/requestMetrics.test.js
Run: node node_modules/vitest/vitest.mjs run src/lib/tabletPolling.test.js

Existing mocked polling and browser tests do not measure live Base44 capacity.
