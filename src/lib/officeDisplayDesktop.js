import { base44 } from "@/api/base44Client";

// McSween Transport Desktop (Windows): office display windows on monitors
// connected to this computer. Their access lasts two hours and is renewed
// here every 20 minutes while an administrator is signed in to the main
// window. Signing out, losing administrator access or closing a display
// window ends that window's access on the server too.

export const RENEW_MS = 20 * 60_000;
export const desktopDisplays = () => (typeof window !== "undefined" ? window.transittrackDesktop?.displays || null : null);
const statusOf = (e) => e?.status || e?.response?.status || 0;
export const call = (action, extra = {}) => base44.functions.invoke("officeDisplay", { action, ...extra });

// Signing out of the desktop app: close its display windows and end their
// access. Best effort; access would also lapse within two hours.
export function closeDesktopDisplaysOnSignOut(user) {
  const bridge = desktopDisplays();
  if (!bridge) return;
  if (user?.role === "admin") void call("window_close_all").catch(() => {});
  void Promise.resolve(bridge.closeAll?.()).catch(() => {});
}

// One renewal pass. Windows whose access can't be renewed are closed: the
// server already stopped serving them.
export async function renewOpenDisplays(bridge, invoke = call) {
  const open = await Promise.resolve(bridge.list()).catch(() => []);
  for (const w of open || []) {
    try { await invoke("window_renew", { display_id: w.id }); }
    catch (e) { if ([401, 403, 404, 409].includes(statusOf(e))) await Promise.resolve(bridge.close(w.id)).catch(() => {}); }
  }
}
