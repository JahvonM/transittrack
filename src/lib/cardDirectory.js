import { withRateLimitRetry } from "@/lib/scopedEntities";

// Share only an unfinished read; never retain a completed passenger directory.
const pendingReads = new WeakMap();
export function loadCardDirectory(client) {
  if (pendingReads.has(client)) return pendingReads.get(client);
  const pending = withRateLimitRetry(
    () => client.functions.invoke("nfcCards", { action: "people" }),
    { attempts: 4, baseMs: 1500 },
  ).then(response => response.data).finally(() => pendingReads.delete(client));
  pendingReads.set(client, pending);
  return pending;
}
