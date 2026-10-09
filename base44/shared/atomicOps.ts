// Development-only process-local coordination. These Maps are NOT durable or
// cross-worker atomicity. A tablet burst can reach independent server instances.
// Keep release blocked until the durable adapter and operation recovery protocol
// are deployed and verified; see security-tests/durable-concurrency.md.

// --- Serialized critical section -------------------------------------------
const locks = new Map<string, Promise<unknown>>();

// Runs `fn` after every earlier withLock for the same key has settled, so the
// read/decide/write inside it cannot interleave with a sibling.
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

// --- Single winner ----------------------------------------------------------
const claims = new Map<string, number>();

// True for the first caller only. Used after a read that siblings are also
// allowed to perform, when the write that follows must happen exactly once.
export function claimOnce(key: string, ttlMs = 24 * 3600_000): boolean {
  const now = Date.now();
  const at = claims.get(key);
  if (at !== undefined && now - at < ttlMs) return false;
  claims.set(key, now);
  cap(claims, 20000);
  return true;
}

// Frees a claim so a retry can try again after a failed write.
export function releaseClaim(key: string): void {
  claims.delete(key);
}

// --- One shared result ------------------------------------------------------
const shared = new Map<string, Promise<unknown>>();

// Runs `create` once per key and hands the SAME result to every caller that
// arrives while it is in flight, so a duplicate request gets the record the
// first one made instead of making a second. A null key always creates.
export function createOnce<T>(key: string | null | undefined, create: () => Promise<T>): Promise<T> {
  if (!key) return create();
  const existing = shared.get(key);
  if (existing) return existing as Promise<T>;
  const run = create().catch((error) => { shared.delete(key); throw error; });
  shared.set(key, run);
  cap(shared, 5000);
  return run;
}

// --- Bounded counter over a rolling window ----------------------------------
const budgets = new Map<string, { start: number; count: number }>();

// True while the key is under `limit` in the window. The check and the
// increment happen together, so a burst cannot all pass a "have we sent 5?" test.
export function takeBudget(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = budgets.get(key);
  if (!current || now - current.start >= windowMs) { budgets.set(key, { start: now, count: 1 }); return true; }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

// --- Newest-wins ordering for timestamped samples ---------------------------
const newest = new Map<string, number>();

// Records a sample's timestamp the moment its request starts, before any read,
// so two requests that read the same prior position still agree on which of
// their samples is newer.
export function registerStamp(key: string, atMs: number): void {
  const seen = newest.get(key);
  if (seen === undefined || atMs > seen) newest.set(key, atMs);
  cap(newest, 5000);
}

// False when a newer sample has already been registered, so an older position
// can never overwrite a newer one.
export function isNewestStamp(key: string, atMs: number): boolean {
  const seen = newest.get(key);
  return seen === undefined || atMs >= seen;
}

// --- Attempt budget backed by the database ----------------------------------
// Attempt rows persist, but count/read/create remains racy across instances.
// The local lock only serializes callers inside this module instance.
export function reserveAttempt(
  base44: any, key: string, limit: number, windowMs: number,
): Promise<boolean> {
  return withLock('attempt:' + key, async () => {
    const rows = await base44.asServiceRole.entities.VerificationAttempt.filter({ scope: key }, '-created_date', Math.max(limit, 50));
    const recent = rows.filter((row: any) => Date.parse(row.attempted_at) > Date.now() - windowMs);
    if (recent.length >= limit) return false;
    await base44.asServiceRole.entities.VerificationAttempt.create({ scope: key, attempted_at: new Date().toISOString() });
    return true;
  });
}

function cap(map: Map<string, unknown>, max: number): void {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}