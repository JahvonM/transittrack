// The tablet's own calendar day, not UTC.
//
// These tablets run in the Caribbean, several hours behind UTC, so a UTC day
// key flips in the middle of an evening shift. Using it for the "PIN entered
// today" marker meant every driver was thrown back to the PIN screen at 8pm
// local, mid-route.
const KEY = "tt_driver_unlock_date";

export function localDayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function rememberUnlockDay() {
  // A tablet whose storage is full must not lose an unlocked session over it.
  try { localStorage.setItem(KEY, localDayKey()); } catch { /* ignore */ }
}

// True only when this tablet was actually unlocked earlier today. A tablet that
// has never been unlocked is not "unlocked" — it still has to ask for the PIN.
export function unlockDayMarked() {
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  return stored !== null && stored === localDayKey();
}

export function forgetUnlockDay() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}