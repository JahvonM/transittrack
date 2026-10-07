// Who may use the driver phone app, and which phones hear about a bus.
//
// A signed-in person counts as a driver only when an administrator has put
// their email on a Driver record and switched "Can use the phone app" on.
// The role people pick for themselves at sign-up is never trusted for this.
// Turning the switch off or clearing the email removes access at once,
// including notifications to phones that were already signed up.
export const normEmail = (value) => String(value || '').trim().toLowerCase();

export async function findPhoneDriver(base44, email) {
  const key = normEmail(email);
  if (!key) return { driver: null, reason: 'not_registered' };
  const rows = (await base44.asServiceRole.entities.Driver.filter({ phone_app_access: true }, '-updated_date', 2000))
    .filter((d) => d.company_id && normEmail(d.email) === key);
  if (!rows.length) return { driver: null, reason: 'not_registered' };
  // One email on two companies' driver lists: refuse rather than guess.
  if (new Set(rows.map((d) => d.company_id)).size > 1) return { driver: null, reason: 'ambiguous' };
  return { driver: rows[0], reason: '' };
}

// The buses an administrator has assigned to this driver.
export async function driverVehicles(base44, driver) {
  const rows = await base44.asServiceRole.entities.Vehicle.filter({ company_id: driver.company_id }, 'name', 500);
  return rows.filter((v) => v.company_id === driver.company_id && normEmail(v.driver_email) === normEmail(driver.email));
}

// Phones signed up by the driver currently assigned to this bus. Checked
// against the Driver record on every send, never trusted from the token row.
export async function driverPhoneTokens(base44, vehicle) {
  if (!vehicle?.company_id || !normEmail(vehicle.driver_email)) return [];
  const { driver } = await findPhoneDriver(base44, vehicle.driver_email);
  if (!driver || driver.company_id !== vehicle.company_id) return [];
  const rows = await base44.asServiceRole.entities.PushToken.filter({ role: 'driver_phone', company_id: vehicle.company_id }, '-created_date', 500);
  return [...new Set(rows
    .filter((row) => normEmail(row.email) === normEmail(driver.email) && typeof row.token === 'string' && row.token)
    .map((row) => row.token))];
}
