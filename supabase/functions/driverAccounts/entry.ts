import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { secrets } from '../_shared/base44-compat.ts';
import { reserveAttempt } from '../_shared/atomicOps.ts';

// Only trusted admins can provision, reset or disable driver credentials.
// Supabase Auth holds passwords. Driver records hold identity and access flags only.
// Login's synthetic identifier is deterministic, so there is no public username lookup.
const USERNAME = /^[a-z][a-z0-9._-]{3,31}$/;
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
const internalEmail = (username) => `driver.${username}@login.mcsweenstransport.com`;
const norm = (value) => String(value || '').trim().toLowerCase();
const okPassword = (value) => typeof value === 'string' && value.length >= 12 && value.length <= 128
  && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
const reply = (message, status = 400, code = '') => Response.json({ error: message, code }, { status });

function temporaryPassword() {
  const result = [];
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  // Rejection sampling avoids modulo bias (alphabet length is < 256).
  for (let i = 0; i < random.length && result.length < 20; i++) {
    if (random[i] < 256 - (256 % PASSWORD_CHARS.length)) result.push(PASSWORD_CHARS[random[i] % PASSWORD_CHARS.length]);
  }
  if (result.length < 20) return temporaryPassword();
  // Generated passwords should satisfy the same strength rules as user-selected ones.
  const value = result.join('');
  return okPassword(value) ? value : temporaryPassword();
}

function endpoint() {
  const url = String(secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  let key = '';
  try { key = JSON.parse(secrets.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* use older key */ }
  key ||= secrets.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !key) throw new Error('Supabase admin API unavailable');
  return { url, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' } };
}

async function authRequest(path, method, body) {
  const { url, headers } = endpoint();
  const response = await fetch(url + path, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data.code || data.error_code || '');
    const message = response.status === 422 && /exists|registered|duplicate/i.test(code + data.msg + data.message)
      ? 'Username is unavailable' : 'Supabase authentication request failed';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}

async function linkedDriver(db, authId) {
  if (!authId) return null;
  const rows = await db.Driver.filter({ auth_user_id: authId }, '-updated_date', 2);
  if (rows.length !== 1) return null;
  return rows[0];
}

async function linkedAppUser(db, authId) {
  const rows = await db.User.filter({ auth_user_id: authId }, '-updated_date', 2);
  if (rows.length !== 1) throw new Error('Driver login profile is unavailable');
  return rows[0];
}

async function audit(db, actor, driver, summary) {
  try {
    await db.AuditLog.create({ actor_email: actor.email || '', actor_role: actor.role, action: 'update',
      entity: 'Driver', record_id: driver.id, summary, status: 'SUCCESS' });
  } catch { /* The request never logs credentials, even when audit storage is unavailable. */ }
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return reply('POST required', 405);
    const client = createClientFromRequest(req);
    const actor = await client.auth.me().catch(() => null);
    if (!actor?.auth_user_id) return reply('Sign in required', 401);
    const body = await req.json().catch(() => ({}));
    const db = client.asServiceRole.entities;
    const action = String(body.action || '');

    if (action === 'status') {
      const driver = await linkedDriver(db, actor.auth_user_id);
      return Response.json({
        is_driver: !!driver && driver.phone_app_access === true && !!driver.company_id,
        must_change_password: !!driver?.must_change_password,
      });
    }

    if (action === 'change_password') {
      const driver = await linkedDriver(db, actor.auth_user_id);
      if (!driver || !driver.phone_app_access || !driver.company_id) return reply('Driver account is not active', 403);
      if (!await reserveAttempt(client, 'driver-password:' + actor.auth_user_id, 8, 60 * 60_000)) return reply('Try again later', 429);
      const current = body.current_password;
      const password = body.new_password;
      if (!okPassword(password) || password === current) return reply('Choose a different password of at least 12 characters, including uppercase, lowercase and a number');
      if (typeof current !== 'string' || !current) return reply('Enter your temporary or current password');
      // Verify the current password before changing it, even if a browser session was stolen.
      const login = await authRequest('/auth/v1/token?grant_type=password', 'POST', {
        email: internalEmail(driver.username), password: current,
      }).catch(() => null);
      if (login?.user?.id !== actor.auth_user_id) return reply('Current password is incorrect', 403);
      await authRequest('/auth/v1/admin/users/' + encodeURIComponent(actor.auth_user_id), 'PUT', { password });
      await db.Driver.update(driver.id, { must_change_password: false });
      await audit(db, actor, driver, 'Driver changed their own password');
      return Response.json({ ok: true });
    }

    if (actor.role !== 'admin') return reply('Admin required', 403);
    if (!['provision', 'reset', 'deactivate', 'reactivate'].includes(action)) return reply('Unknown account action');
    if (!await reserveAttempt(client, 'driver-admin:' + actor.id, 24, 60 * 60_000)) return reply('Too many account changes. Try again later', 429);
    const id = typeof body.driver_id === 'string' ? body.driver_id : '';
    if (!id || id.length > 200) return reply('Driver ID is required');
    const driver = await db.Driver.get(id).catch(() => null);
    if (!driver) return reply('Driver not found', 404);

    if (action === 'provision') {
      if (!driver.company_id) return reply('Assign the driver to a company before creating a phone account');
      if (driver.auth_user_id) return reply('This driver already has an account', 409);
      const username = norm(body.username);
      if (!USERNAME.test(username)) return reply('Username must have 4–32 letters, digits, dots, dashes or underscores, starting with a letter');
      const claimed = await db.Driver.filter({ username }, '-updated_date', 2);
      if (claimed.some(row => row.id !== driver.id)) return reply('Username is unavailable', 409);
      const password = temporaryPassword();
      let account = null;
      try {
        account = await authRequest('/auth/v1/admin/users', 'POST', {
          email: internalEmail(username), password, email_confirm: true,
          user_metadata: { full_name: driver.full_name || 'Driver' },
        });
        const newAuthId = account?.id || account?.user?.id;
        if (!newAuthId) throw new Error('Authentication account was not created');
        const person = await linkedAppUser(db, newAuthId);
        await db.User.update(person.id, {
          role: 'driver', company_id: driver.company_id,
          full_name: driver.full_name || person.full_name || 'Driver', disabled: false,
        });
        await db.Driver.update(driver.id, {
          username, auth_user_id: newAuthId, must_change_password: true, phone_app_access: true,
        });
        const saved = await db.Driver.get(driver.id);
        if (saved?.auth_user_id !== newAuthId || saved?.username !== username || saved?.must_change_password !== true || saved?.phone_app_access !== true) {
          throw new Error('Driver account fields were not stored; apply the database migration first');
        }
      } catch (error) {
        // Do not leave an active orphan account if linking fails.
        const newAuthId = account?.id || account?.user?.id;
        if (newAuthId) {
          // If the Driver update succeeded but its verification failed, clear the
          // unusable mapping before removing its sign-in identity.
          const current = await db.Driver.get(driver.id).catch(() => null);
          if (current?.auth_user_id === newAuthId) {
            await db.Driver.update(driver.id, {
              username: null, auth_user_id: null, must_change_password: false, phone_app_access: false,
            }).catch(() => {});
          }
          await authRequest('/auth/v1/admin/users/' + encodeURIComponent(newAuthId), 'DELETE').catch(() => {});
        }
        if (error?.message === 'Username is unavailable') return reply('Username is unavailable', 409);
        throw error;
      }
      await audit(db, actor, driver, 'Created driver phone username account');
      // The temporary password is returned once over the authenticated admin request; never stored.
      return Response.json({ ok: true, username, temporary_password: password, must_change_password: true });
    }

    if (!driver.auth_user_id) return reply('Create a driver phone account first', 409);
    const accountUser = await linkedAppUser(db, driver.auth_user_id);
    if (action === 'reset') {
      const password = temporaryPassword();
      // Block every driver-phone action BEFORE rotating the password.
      await db.Driver.update(driver.id, { must_change_password: true });
      const locked = await db.Driver.get(driver.id);
      if (locked?.must_change_password !== true) return reply('Database password-change flag unavailable. Migration required.', 503);
      await authRequest('/auth/v1/admin/users/' + encodeURIComponent(driver.auth_user_id), 'PUT', { password });
      await audit(db, actor, driver, 'Reset driver phone password');
      return Response.json({ ok: true, username: driver.username, temporary_password: password });
    }

    if (action === 'deactivate') {
      // Invalidate backend authorization immediately even if the ban call fails.
      await db.Driver.update(driver.id, { phone_app_access: false });
      await db.User.update(accountUser.id, { disabled: true });
      await authRequest('/auth/v1/admin/users/' + encodeURIComponent(driver.auth_user_id), 'PUT', { ban_duration: '876000h' });
      await audit(db, actor, driver, 'Deactivated driver phone account');
      return Response.json({ ok: true });
    }

    // Unban first. Phone endpoints remain inaccessible until both database flags are restored.
    await authRequest('/auth/v1/admin/users/' + encodeURIComponent(driver.auth_user_id), 'PUT', { ban_duration: 'none' });
    await db.User.update(accountUser.id, { disabled: false, role: 'driver', company_id: driver.company_id });
    await db.Driver.update(driver.id, { phone_app_access: true });
    await audit(db, actor, driver, 'Reactivated driver phone account');
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[driverAccounts] account management failed', error?.status || 500);
    return reply('Could not complete driver account operation. No credentials were saved in driver records.', 503);
  }
}
