import { ACCOUNT_SITE } from './accountEmails.ts';

// Sign-up day setup links. The office adds someone with their email address;
// the setup email carries a personal link that joins them to that company
// once they sign in with that same email address. It works like the
// company's join code, but only for that one address, so a forwarded email
// can't join anyone else. The company code itself is never emailed.
//
// The key is 256 random bits, kept only as a SHA-256 hash in VerificationGrant
// (purpose 'signup_invite', subject 'email:<address>'). It travels after # so
// it never reaches a server log. A new link for the same person and company
// ends the older ones; a link lasts INVITE_DAYS.

export const INVITE_PURPOSE = 'signup_invite';
export const INVITE_DAYS = 14;
export const inviteSubject = (email: string) => 'email:' + String(email || '').trim().toLowerCase();
export const inviteUrl = (token: string) => `${ACCOUNT_SITE}/join#invite=${token}`;
export const INVITE_TOKEN = /^[a-f0-9]{64}$/;

export async function inviteTokenHash(token: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, '0')).join('');
}

// A fresh link for this email address at this company; older ones stop working.
export async function issueSignupInvite(db: any, companyId: string, email: string, now = Date.now()) {
  const subject = inviteSubject(email);
  const older = await db.VerificationGrant.filter({ purpose: INVITE_PURPOSE, subject }, '-created_date', 50).catch(() => []);
  for (const row of older) {
    if (row.company_id === companyId && Date.parse(row.expires_at) > now) await db.VerificationGrant.update(row.id, { expires_at: new Date(now).toISOString() });
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
  const expires_at = new Date(now + INVITE_DAYS * 86400_000).toISOString();
  await db.VerificationGrant.create({ token_hash: await inviteTokenHash(token), purpose: INVITE_PURPOSE, subject, company_id: companyId, expires_at });
  return { url: inviteUrl(token), expires_at };
}

// What a link is for, checked against the signed-in person's email address.
// Returns { companyId } or { problem: 'invalid' | 'expired' | 'other_email' }.
export async function readSignupInvite(db: any, token: unknown, signedInEmail: unknown, now = Date.now()) {
  const key = String(token || '').trim().toLowerCase();
  if (!INVITE_TOKEN.test(key)) return { problem: 'invalid' };
  const rows = await db.VerificationGrant.filter({ token_hash: await inviteTokenHash(key) }, '-created_date', 1).catch(() => []);
  const row = rows[0];
  if (!row || row.purpose !== INVITE_PURPOSE || !row.company_id) return { problem: 'invalid' };
  if (!(Date.parse(row.expires_at) > now)) return { problem: 'expired' };
  if (row.subject !== inviteSubject(String(signedInEmail || ''))) return { problem: 'other_email' };
  return { companyId: row.company_id };
}
