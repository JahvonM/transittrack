// Usernames are identifiers, never credentials. Passwords are handled by Supabase Auth.
export const normalizeDriverUsername = (value) => String(value ?? '').trim().toLowerCase();
export const validDriverUsername = (value) => /^[a-z][a-z0-9._-]{3,31}$/.test(normalizeDriverUsername(value));
export const internalDriverEmail = (username) => `driver.${normalizeDriverUsername(username)}@login.mcsweenstransport.com`;

// What the sign-in box was given: an email, or a driver username (which signs
// in with its hidden address). In driver mode only a username. Null when it is
// neither.
export function signInTarget(input, { driverMode = false } = {}) {
  const value = String(input ?? '').trim();
  if (!driverMode && value.includes('@')) return { email: value, driver: false };
  return validDriverUsername(value) ? { email: internalDriverEmail(value), driver: true } : null;
}

// The one address the app uses to recognise a driver on buses, shifts,
// messages and backup GPS (same as driverKey in base44/shared/driverPhone.ts):
// the sign-in address of a username account, otherwise the driver's own email.
export const driverKey = (driver) => driver?.username
  ? internalDriverEmail(driver.username)
  : String(driver?.email ?? '').trim().toLowerCase();

// The buses assigned to this driver: by driver record, or by key on older buses.
export function driverOwnsBus(vehicle, driver) {
  if (!vehicle || !driver?.id || vehicle.company_id !== driver.company_id) return false;
  if (vehicle.driver_id) return vehicle.driver_id === driver.id;
  const own = String(vehicle.driver_email ?? '').trim().toLowerCase();
  return !!own && (own === driverKey(driver) || own === String(driver.email ?? '').trim().toLowerCase());
}

// Driver phone passwords: 12 to 72 characters (Supabase's limit is 72 bytes),
// with uppercase, lowercase and a number. The server checks the same rule.
export const DRIVER_PASSWORD_RULE = 'Use 12 to 72 characters, with uppercase, lowercase and a number.';
export const okDriverPassword = (value) => typeof value === 'string' && value.length >= 12
  && new TextEncoder().encode(value).length <= 72 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);

// Always use the stable Driver record ID for bus assignments.
export function isAssignedDriver(vehicle, driver) {
  if (!vehicle || !driver?.id || !driver?.company_id) return false;
  return vehicle.company_id === driver.company_id && vehicle.driver_id === driver.id;
}
