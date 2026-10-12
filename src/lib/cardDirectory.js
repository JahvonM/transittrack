import { withRateLimitRetry } from "@/lib/scopedEntities";

// Share only an unfinished read; never retain a completed passenger directory.
const pendingReads = new WeakMap();
export function loadCardDirectory(client, action = "people") {
  if (!pendingReads.has(client)) pendingReads.set(client, new Map());
  const reads = pendingReads.get(client);
  if (reads.has(action)) return reads.get(action);
  const pending = withRateLimitRetry(
    () => client.functions.invoke("nfcCards", { action }),
    { attempts: 4, baseMs: 1500 },
  ).then(response => response.data).finally(() => reads.delete(action));
  reads.set(action, pending);
  return pending;
}
