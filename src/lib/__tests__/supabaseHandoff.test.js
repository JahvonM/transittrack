import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  stopAutoRefresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => ({})),
}));
vi.mock('@supabase/auth-js', () => ({ AuthClient: class {
  constructor() { Object.assign(this, auth); }
} }));
import { afterSessionHandoff, AUTH_STORAGE_KEY, createBackend, sessionHandoffToken } from '../../api/backend.supabase.js';

let values;
beforeEach(() => {
  vi.clearAllMocks();
  values = new Map([
    [AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'aaa.bbb.ccc', refresh_token: 'refresh12345' })],
    ['tt_offline_queue', 'saved boarding'],
  ]);
  vi.stubGlobal('window', {
    localStorage: { getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k) },
    location: { href: 'https://app.mcsweenstransport.com/desktop-signin', origin: 'https://app.mcsweenstransport.com' },
    history: { state: null, replaceState() {} },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Supabase browser-to-app session ownership', () => {
  it('detaches the browser without revoking the session handed to desktop or phone', async () => {
    const transferred = sessionHandoffToken(window.localStorage);
    await afterSessionHandoff();
    expect(transferred).toBe('aaa.bbb.ccc~refresh12345');
    expect(auth.stopAutoRefresh).toHaveBeenCalledOnce();
    // scope:local revokes that same refresh session server-side; never use it here.
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(sessionHandoffToken(window.localStorage)).toBeNull();
    expect(values.get('tt_offline_queue')).toBe('saved boarding');
  });
  it('still revokes a session when the person explicitly signs out', async () => {
    await createBackend().auth.logout();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
