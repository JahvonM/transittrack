// Usernames are identifiers, never credentials. Passwords are handled by Supabase Auth.
export const normalizeDriverUsername = (value) => String(value ?? '').trim().toLowerCase();
export const validDriverUsername = (value) => /^[a-z][a-z0-9._-]{3,31}$/.test(normalizeDriverUsername(value));

// Always use the stable Driver record ID for bus assignments.
export function isAssignedDriver(vehicle, driver) {
  if (!vehicle || !driver?.id || !driver?.company_id) return false;
  return vehicle.company_id === driver.company_id && vehicle.driver_id === driver.id;
}
