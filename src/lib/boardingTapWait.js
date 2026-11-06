import { AUTO_TAP_COOLDOWN_MS } from "./boardingPolicy";

export function boardingTapWait(status, at, now = Date.now()) {
  const tappedAt = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(tappedAt)) return "";
  const seconds = Math.ceil((AUTO_TAP_COOLDOWN_MS - (Number(now) - tappedAt)) / 1000);
  if (seconds <= 0) return "";
  return `Wait ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2,"0")}s, then tap again to ${status === "boarded" ? "sign out" : "board"}.`;
}
