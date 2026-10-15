// Privileged commands never travel as executable instructions through the WebView.
export const CONTROL_TTL = 120_000;
export const LOCK_LEASE = 600_000;
export const controlId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export const CONTROL_RESULTS: Record<string, { state: string; message: string; actions?: string[] }> = {
  LOCKED: { state: 'applied', message: 'Android confirmed the temporary kiosk lock.', actions: ['lock_test'] },
  RELEASED: { state: 'applied', message: 'Android confirmed release of this app’s temporary lock.', actions: ['release'] },
  NO_LOCK: { state: 'applied', message: 'This app has no temporary lock to release.', actions: ['release'] },
  REBOOT_REQUESTED: { state: 'requested', message: 'Android restart requested. Wait for a fresh tablet check-in.', actions: ['reboot'] },
  DEVICE_OWNER_REQUIRED: { state: 'blocked', message: 'Android managed-device ownership is required.' },
  TABLET_BUSY: { state: 'blocked', message: 'Tablet is in use, tracking, or has saved work. Finish and sync before retrying.', actions: ['reboot'] },
  UNSUPPORTED: { state: 'blocked', message: 'This Android version does not support the action.' },
  ALREADY_LOCKED: { state: 'blocked', message: 'Another kiosk lock is already active. This test did not take it over.', actions: ['lock_test'] },
  INTERRUPTED: { state: 'unknown', message: 'Execution was interrupted. Inspect tablet status before sending another request.' },
  CONTROL_COOLDOWN: { state: 'blocked', message: 'Wait two minutes before another restart request.', actions: ['reboot'] },
  RECOVERY_UNAVAILABLE: { state: 'blocked', message: 'Android cannot guarantee a native expiry alarm. Lock test was not started.', actions: ['lock_test'] },
  APP_NOT_VISIBLE: { state: 'blocked', message: 'Open the kiosk app on the tablet before retrying.' },
  EXPIRED: { state: 'blocked', message: 'Command expired before Android execution.' },
  ANDROID_ERROR: { state: 'failed', message: 'Android could not complete the action.' },
  STORAGE_ERROR: { state: 'blocked', message: 'Tablet could not save its command receipt. No new action was started.' },
};
export function currentControl(device: Record<string, any>, now = Date.now()) {
  const c = device?.control_command;
  if (!c || !controlId(c.id) || !['lock_test', 'release', 'reboot'].includes(c.action)) return null;
  const issued = Date.parse(c.requested_at), expires = Date.parse(c.expires_at);
  if (!Number.isFinite(issued) || issued > now + 5_000 || expires <= now || expires - issued !== CONTROL_TTL) return null;
  if (c.company_id !== device.company_id || c.vehicle_id !== (device.vehicle_id || '') || c.kiosk_type !== device.kiosk_type) return null;
  if (c.action === 'lock_test' && Date.parse(c.lock_until) !== issued + LOCK_LEASE) return null;
  return c;
}
export function controlNotice(device: Record<string, any>, now = Date.now()) {
  const c = currentControl(device, now);
  return c && device.control_status?.state === 'waiting' ? { id: c.id } : null;
}
export function newControl(device: Record<string, any>, action: unknown, adminId: string, now = Date.now()) {
  if (!['lock_test', 'release', 'reboot'].includes(action as string)) throw new Error('Choose a supported tablet action.');
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const command = { id, action, requested_by: adminId, requested_at: new Date(now).toISOString(),
    expires_at: new Date(now + CONTROL_TTL).toISOString(), company_id: device.company_id,
    vehicle_id: device.vehicle_id || '', kiosk_type: device.kiosk_type,
    ...(action === 'lock_test' ? { lock_until: new Date(now + LOCK_LEASE).toISOString() } : {}) };
  return { command, status: { id, action, state: 'waiting', requested_at: command.requested_at,
    expires_at: command.expires_at, ...(action === 'lock_test' ? { lock_until: command.lock_until } : {}) } };
}
export async function strictControlDevice(db: any, device: Record<string, any>, token: unknown, now = Date.now()) {
  if (!device || device.status !== 'active' || device.paired !== true || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const credential = (await db.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1))[0];
  if (!credential || !(Date.parse(credential.expires_at) > now) || credential.company_id !== device.company_id ||
    credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return false;
  const digest = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))), b => b.toString(16).padStart(2, '0')).join('');
  const same = (a: unknown, b: string) => {
    if (typeof a !== 'string' || a.length !== b.length) return false;
    let diff = 0; for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  return same(credential.pairing_code_hash, await digest(device.pairing_code || '')) && same(credential.token_hash, await digest(token));
}
export function controlCompletion(command: Record<string, any>, code: unknown, now = Date.now()) {
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(CONTROL_RESULTS, code)) return null;
  const result = CONTROL_RESULTS[code];
  if (result.actions && !result.actions.includes(command.action)) return null;
  return { id: command.id, action: command.action, requested_at: command.requested_at,
    ...(command.lock_until ? { lock_until: command.lock_until } : {}),
    ...result, actions: undefined, result_code: code, completed_at: new Date(now).toISOString() };
}
