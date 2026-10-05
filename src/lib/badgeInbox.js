// Scanner taps exist in memory only. No card UID is written to browser storage.
const MAX_AGE = 30000;
export function badgeInbox(target = window) {
  const seen = new Set();
  return event => {
    const pending = Array.isArray(target.__ttBadgeInbox) ? target.__ttBadgeInbox : [];
    target.__ttBadgeInbox = [];
    if (event) pending.push({ uid: event.detail, id: event.ttTapId, at: event.ttTapAt });
    const taps = [];
    for (const tap of pending) {
      if (!tap || (tap.at && (Date.now() - tap.at > MAX_AGE || tap.at > Date.now() + 5000))) continue;
      if (tap.id && seen.has(tap.id)) continue;
      const uid = String(tap.uid || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
      if (!uid) continue;
      if (tap.id) {
        seen.add(tap.id);
        if (seen.size > 64) seen.delete(seen.values().next().value);
      }
      taps.push(uid);
    }
    return taps;
  };
}
