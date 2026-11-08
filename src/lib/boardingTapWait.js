import { AUTO_TAP_WAIT_MS } from "../../base44/shared/boardingEvents.ts";

// After a double tap on a reader that records by itself: how long until the
// next tap counts as getting off (or on). "" once the wait is over.
export function boardingTapWait(status, at, now = Date.now()) {
  const tappedAt = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(tappedAt)) return "";
  const seconds = Math.ceil((AUTO_TAP_WAIT_MS - (Number(now) - tappedAt)) / 1000);
  if (seconds <= 0) return "";
  return `Wait ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s, then tap again to ${status === "boarded" ? "get off" : "get on"}.`;
}
