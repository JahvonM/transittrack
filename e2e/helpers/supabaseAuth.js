// Sign-in helpers for the browser tests. The test build talks to Supabase at
// /api on the page's own address (vite.config.js), so the Supabase client
// saves its session under sb-localhost-auth-token and every Supabase Auth
// request goes to /api/auth/v1/...

export const SESSION_KEY = 'sb-localhost-auth-token';

// What Supabase Auth answers with a session (and what the client saves).
export function sessionJson(accessToken, user = { id: 'test-user' }) {
  return { access_token: accessToken, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };
}

// The access token of the session saved in the page, or null.
export function savedAccessToken(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.access_token ?? null, SESSION_KEY);
}

// Coming back from Google: the client saved a code verifier when it sent the
// person to Google, and swaps the returned ?code= for a session. Open the
// page with `?tt_oauth=1&code=test-auth-code` after calling this.
export async function googleReturn(page, accessToken) {
  await page.addInitScript((key) => localStorage.setItem(`${key}-code-verifier`, JSON.stringify('test-code-verifier')), SESSION_KEY);
  await page.route('**/api/auth/v1/token?grant_type=pkce', (route) => {
    const body = route.request().postDataJSON();
    if (body?.auth_code !== 'test-auth-code' || body?.code_verifier !== 'test-code-verifier') return route.fulfill({ status: 400, json: { code: 'bad_code_verifier', msg: 'Invalid code' } });
    return route.fulfill({ json: sessionJson(accessToken) });
  });
}

// The "Continue with ..." buttons show only for the providers Supabase Auth's
// settings list as on, so a test that needs them says which are on.
export async function signInProviders(page, external = { google: true, apple: true }) {
  await page.route('**/api/auth/v1/settings', (route) => route.fulfill({ json: { external } }));
}
