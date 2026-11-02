// "Your password was changed" after a reset with an email link. The reset
// happens on the sign-in service, which the app can't see, so the reset page
// notes the time on this browser and the next sign-in here asks the server
// for the confirmation email (accountEmails → password_changed). The server
// writes to the signed-in account's own address only.
const KEY = "tt_password_reset_at";
const DAY_MS = 86_400_000;

export function rememberPasswordReset(now = Date.now()) {
  try { localStorage.setItem(KEY, new Date(now).toISOString()); } catch { /* no confirmation email then */ }
}

// Asks once; a failed request is kept for the next time the app opens.
export async function confirmPasswordReset(invoke, now = Date.now()) {
  let at = "";
  try { at = localStorage.getItem(KEY) || ""; localStorage.removeItem(KEY); } catch { return false; }
  const t = Date.parse(at);
  if (!at || !Number.isFinite(t) || now - t > DAY_MS) return false;
  try { await invoke({ action: "password_changed", changed_at: at }); return true; }
  catch { try { localStorage.setItem(KEY, at); } catch { /* give up */ } return false; }
}
