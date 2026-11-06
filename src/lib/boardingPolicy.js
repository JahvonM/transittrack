import { neighbours, suggestedStatus, tapTime } from "../../base44/shared/boardingEvents.ts";

export const AUTO_TAP_COOLDOWN_MS = 5 * 60_000;
export function automaticNfcAdvice(events, now) {
  const last = neighbours(events, now).before;
  return {
    status: suggestedStatus(events, now, "both"),
    repeat: last && now - tapTime(last) < AUTO_TAP_COOLDOWN_MS ? last : null,
  };
}
