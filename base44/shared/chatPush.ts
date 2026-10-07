// Who gets a push when someone posts in a bus's chat.
//
// A passenger rides one specific bus: the CompanyMembership row an admin or
// company manager assigned them (scope 'passenger', vehicle_id) — the same
// record the rest of the app uses to say which bus a passenger is on. A device
// token is registration metadata, never recipient authorization, so the
// membership row decides who is notified, not the token's stored role.
export async function passengerPushTokens(base44, vehicleId, { excludeEmails = [] } = {}) {
  if (!vehicleId) return [];
  const db = base44.asServiceRole.entities;

  const memberships = await db.CompanyMembership.filter(
    { vehicle_id: vehicleId, scope: 'passenger', active: true }, '-updated_date', 500,
  );
  const userIds = [...new Set(memberships.map((row) => row.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const users = await db.User.filter({ id: { $in: userIds } });
  const skip = new Set(excludeEmails.filter(Boolean).map((email) => String(email).toLowerCase()));
  const emails = [...new Set(
    users.map((user) => user.email).filter((email) => email && !skip.has(String(email).toLowerCase())),
  )];
  if (!emails.length) return [];

  const tokenRows = await db.PushToken.filter({ email: { $in: emails } }, '-created_date', 500);
  return [...new Set(tokenRows.map((row) => row.token).filter((token) => typeof token === 'string' && token))];
}