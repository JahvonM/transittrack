// What a new password must be, everywhere one is chosen: sign-up, reset,
// invitation, change password and new users made by an admin. Supabase Auth
// is told the same minimum (tools/supabase/auth-emails.mjs), so the server
// refuses what the screens would. Existing shorter passwords still sign in;
// the rule applies when a password is set.
export const MIN_PASSWORD_LENGTH = 8;
// Supabase (bcrypt) ignores anything after 72 characters, so it refuses longer ones.
export const MAX_PASSWORD_LENGTH = 72;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

// A short reason the password can't be used, or null when it's fine.
export function passwordProblem(password) {
  const value = String(password ?? "");
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (value.length > MAX_PASSWORD_LENGTH) return `Use ${MAX_PASSWORD_LENGTH} characters or fewer for your password.`;
  if (!value.trim()) return "Your password can't be only spaces.";
  return null;
}
