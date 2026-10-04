# Atomic storage verification — 2026-10-04 UTC

Reviewed application baseline: a463af0. Verification is read-only for application
code, entities, records and devices. This follow-up adds documentation only.
Decision: the SDK exposes a plausible conditional-write API, but the platform
guarantees needed to clear concurrency release failures remain unverified.

## Evidence

- Installed frontend SDK package: @base44/sdk 0.8.52.
- Backend function imports are pinned to npm:@base44/sdk@0.8.44.
- Inspected the official npm 0.8.44 archive in memory, without installing it or
  changing dependencies. Its entity handler has updateMany(query, data), sending
  PATCH to the entity update-many endpoint with query and data in one request.
- The installed 0.8.52 handler has the same updateMany transport shape.
- Current official SDK docs list query conditions, $set/$inc and other update
  operators, with success, updated and has_more in the result. They describe
  batches of up to 500; they do not explicitly promise atomic predicate evaluation,
  cross-request exclusion, transactions or linearizability.
- The examined 0.8.44 entity handler/types do not expose upsert, transaction or
  compareAndSet methods. The installed 0.8.52 package does expose upsert; its
  existence does not establish concurrent uniqueness and it is not exposed in
  the examined backend version.
- The official entity-schema reference reviewed does not document a custom-field
  unique-index configuration. This is absence of a documented guarantee, not
  proof that no platform-level capability exists.
- Ordinary update(id, data) sends a PUT without a version condition. Current
  application read/check/write code therefore cannot use that SDK call alone
  as a compare-and-set operation.

Sources:
- https://docs.base44.com/developers/references/sdk/docs/type-aliases/entities
- https://github.com/base44/skills/blob/main/skills/base44-cli/references/entities-create.md
- https://registry.npmjs.org/@base44/sdk/-/sdk-0.8.44.tgz
- node_modules/@base44/sdk/dist/modules/entities.js
- node_modules/@base44/sdk/dist/modules/entities.types.d.ts

MongoDB-style syntax does not establish how Base44 implements its endpoint.
In particular, a service could select matching IDs first and update them later.
A single HTTP request and an updated count do not independently establish
an atomic predicate plus write.

## Precise platform questions — prepared, not sent

We are building a pre-production Base44 app with backend SDK 0.8.44. Please
confirm the following guarantees and their applicable SDK/backend versions:

1. If two independent backend executions concurrently issue
   updateMany({id: recordId, consumed: false}, {$set: {consumed: true,
   claim_id: uniqueRequestId}}), is predicate evaluation plus the write atomic
   for that individual record? Must exactly one caller get updated === 1
   and the other updated === 0 when both calls complete successfully?
   Does updated count matched records or actually modified records?
2. For one existing record, does
   updateMany({id: recordId, count: {$lt: limit}},
   {$inc: {count: 1}}) atomically enforce the cap across workers, regions,
   retries and simultaneous requests?
3. What consistency is guaranteed for a subsequent read after an acknowledged
   write? How should a timeout/unknown write outcome be recovered using
   an immutable claim/request ID?
4. Is there a supported unique constraint, insert-if-absent operation or atomic
   upsert for a composite key such as company + device + operation + request ID?
   Does simultaneous upsert create at most one row? How are existing duplicates
   handled, and can a created record ID be chosen by the server application?
5. Are multi-record transactions available? If not, what supported design
   makes a consumed credential, created operation/result rows and saved replay
   acknowledgement recoverable as one logical operation?
6. Does updateMany evaluate the original predicate at write time, or can it
   first collect IDs and later update those records unconditionally?
   Please point to documented behavior or a supported platform contract.

No message or support ticket was submitted by the agent.

## Implementation routes after confirmation

| Operation | Required capability | Additional design work |
|---|---|---|
| Pairing and OTP/boarding consumption | Atomic condition plus write on an existing row | Immutable claim ID, authorization first, retry recovery; a failed post-claim credential write must not strand a device |
| Attempt and email budgets | Atomic bounded increment on a stable existing row | Unique/bootstrap-safe counter identity, clock/window policy, backoff, failure accounting, fail closed on storage errors |
| Code allocation and replay IDs | Concurrent unique insertion or reliable atomic upsert | Tenant/device/purpose binding, collision handling, immutable payload hash |
| Check-in/shift/inspection side effects | Unique request identity plus transactional or recoverable state machine | Persist partial progress, resume rather than duplicate children/photos, safe completed acknowledgement |
| GPS ordering | Atomic timestamp condition plus position write | Same update must set all position fields together; older samples cannot overwrite newer position |

These are proposed designs, not implemented guarantees. Confirming single-record
conditional writes would not by itself solve unique creation or multi-record
operation recovery.

## Verification boundaries

No live records, credential inventories or account data were queried. No live
parallel requests or mutation probes ran. No SDK upgrade, application/schema
changes, token revocations, signing keys or frontend publication occurred.
Public npm package retrieval was used only to inspect the pinned SDK source.

The baseline remains 255 passing unit tests and 13 mocked browser checks.
The last strict run remains 21 passing / 17 failing of 38; no tests were weakened
or marked as passing as a result of this documentation review. Tests/build were
not repeated for this documentation-only change.

Next action: obtain the supported Base44 storage contract, then implement the
relevant primitives with a faithful atomic test adapter and crash/retry scenarios.
If the contract does not provide the required capabilities, select an authorized
server-side transactional store before connecting or provisioning one.
