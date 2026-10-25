// Who may use the driver phone app, and which phones hear about a bus.
//
// The phone app is for Driver records an administrator gave a username
// account (driverAccounts); driverPhone checks the account link on every
// request. Switching the account off removes access at once, including
// notifications to phones that were already signed up.
export const normEmail = (value) => String(value || '').trim().toLowerCase();

// The one address the app uses to recognise a driver on buses, shifts,
// messages and backup GPS: the sign-in address of a username account,
// otherwise the driver's own email (older records).
export const driverKey = (driver) => driver?.username
  ? `driver.${String(driver.username).trim().toLowerCase()}@login.mcsweenstransport.com`
  : normEmail(driver?.email);

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
  const emails = phoneEmails(driver);
  return rows.filter((v) => v.company_id === driver.company_id && (
    // An explicit driver ID always wins: never reassign a bus by a stale email.
    v.driver_id ? v.driver_id === driver.id : emails.has(normEmail(v.driver_email))
  ));
}

function phoneEmails(driver) {
  return new Set([normEmail(driver?.email), driverKey(driver)].filter(Boolean));
}

// Phones signed up by the driver currently assigned to this bus. Checked
// against the Driver record on every send, never trusted from the token row.
export async function driverPhoneTokens(base44, vehicle) {
  if (!vehicle?.company_id) return [];
  let driver = null;
  if (vehicle.driver_id) {
    const record = await base44.asServiceRole.entities.Driver.get(vehicle.driver_id).catch(() => null);
    if (record?.company_id === vehicle.company_id && record.phone_app_access) driver = record;
  } else if (normEmail(vehicle.driver_email)) {
    const legacy = await findPhoneDriver(base44, vehicle.driver_email);
    if (legacy.driver?.company_id === vehicle.company_id) driver = legacy.driver;
  }
  if (!driver || !driver.phone_app_access || !driver.company_id) return [];
  const emails = phoneEmails(driver);
  const rows = await base44.asServiceRole.entities.PushToken.filter({ role: 'driver_phone', company_id: vehicle.company_id }, '-created_date', 500);
  return [...new Set(rows
    .filter((row) => emails.has(normEmail(row.email)) && typeof row.token === 'string' && row.token)
    .map((row) => row.token))];
}

// Phones of one driver record, for telling them about their own requests.
// Nothing is sent once the phone app is switched off for them.
export async function phoneTokensForDriver(base44, driver) {
  if (!driver?.phone_app_access || !phoneEmails(driver).size || !driver.company_id) return [];
  const rows = await base44.asServiceRole.entities.PushToken.filter({ role: 'driver_phone', company_id: driver.company_id }, '-created_date', 500);
  const emails = phoneEmails(driver);
  return [...new Set(rows
    .filter((row) => emails.has(normEmail(row.email)) && typeof row.token === 'string' && row.token)
    .map((row) => row.token))];
}
