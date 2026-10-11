import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const env = vi.hoisted(() => ({ native: false, plugins: new Set() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => env.native,
    isPluginAvailable: (name) => env.plugins.has(name),
    getPlatform: () => (env.native ? 'ios' : 'web'),
  },
}));

import {
  PHONE_SIGNIN_MAX_AGE_MS,
  phoneSignInAvailable,
  startPhoneSignIn,
  readPhoneSignIn,
  phoneSignInPath,
  sealSessionForPhone,
  openPhoneSignInLink,
  isPhoneSignInLink,
  afterPhoneSignInPath,
  forgetPhoneSignInKey,
  toBase64Url,
} from '../phoneSignIn';
import { acceptPhoneSignInLink } from '../../components/PhoneSignInListener';

const cryptoImpl = globalThis.crypto?.subtle ? globalThis.crypto : webcrypto;
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVl';

function memoryStore() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

// The app starts; returns what the browser page would see.
async function appStarts({ provider = 'google', returnTo = '/staff', now = 1_000_000 } = {}) {
  const appStorage = memoryStore();
  let opened = '';
  await startPhoneSignIn({ provider, returnTo, origin: 'https://tt.example', storage: appStorage, openBrowser: async (u) => { opened = u; }, cryptoImpl, now });
  const url = new URL(opened);
  return { appStorage, opened, url };
}

describe('phone app sign-in through the phone browser', () => {
  it('is used only inside a phone app that can open the browser', () => {
    expect(phoneSignInAvailable()).toBe(false);
    env.native = true;
    env.plugins = new Set(['App']);
    expect(phoneSignInAvailable()).toBe(false);
    env.plugins = new Set(['App', 'Browser']);
    expect(phoneSignInAvailable()).toBe(true);
    env.native = false;
  });

  it('opens the browser with a random state and keeps the key out of the server-bound part of the link', async () => {
    const { opened, url, appStorage } = await appStarts();
    expect(url.origin + url.pathname).toBe('https://tt.example/phone-signin');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.search).not.toContain('k=');
    expect(url.hash).toMatch(/^#k=[A-Za-z0-9_-]{43}$/);
    const pending = JSON.parse(appStorage.getItem('tt_phone_signin'));
    expect(pending).toMatchObject({ state: url.searchParams.get('state'), provider: 'google', returnTo: '/staff' });
    expect(opened).toContain(pending.key);
    // Two sign-ins never share a state or key.
    const again = await appStarts();
    expect(again.url.searchParams.get('state')).not.toBe(url.searchParams.get('state'));
  });

  it('refuses unknown providers and unsafe return paths', async () => {
    await expect(startPhoneSignIn({ provider: 'evil', returnTo: '/', origin: 'https://tt.example', storage: memoryStore(), openBrowser: async () => {}, cryptoImpl })).rejects.toMatchObject({ name: 'BadProvider' });
    const { appStorage } = await appStarts({ returnTo: '//evil.example/x' });
    expect(JSON.parse(appStorage.getItem('tt_phone_signin')).returnTo).toBe('/');
  });

  it('full round trip: browser page seals the session, the app opens it once', async () => {
    const { url, appStorage } = await appStarts({ now: 5_000 });
    const tab = memoryStore();
    const request = readPhoneSignIn(url.search, url.hash, tab);
    expect(request.key).toBeTruthy();
    // Back from Google: the # part is gone, the key is still in this tab.
    expect(readPhoneSignIn(phoneSignInPath(request).slice('/phone-signin'.length), '', tab)).toEqual(request);
    const link = await sealSessionForPhone(request, TOKEN, cryptoImpl);
    expect(isPhoneSignInLink(link)).toBe(true);
    expect(link).toMatch(/^com\.transittrack\.app:\/\/signin\?state=/);
    expect(link).not.toContain(TOKEN);
    expect(link).not.toContain(request.key);
    expect(await openPhoneSignInLink(link, { storage: appStorage, cryptoImpl, now: 6_000 })).toEqual({ token: TOKEN, returnTo: '/staff' });
    // One use only.
    await expect(openPhoneSignInLink(link, { storage: appStorage, cryptoImpl, now: 6_000 })).rejects.toMatchObject({ name: 'NotOurs' });
    forgetPhoneSignInKey(request.state, tab);
    expect(readPhoneSignIn(phoneSignInPath(request).slice('/phone-signin'.length), '', tab).key).toBeNull();
  });

  it('a link made with someone else\'s key or state does not sign the app in', async () => {
    const { url, appStorage } = await appStarts();
    const request = readPhoneSignIn(url.search, url.hash, memoryStore());
    const otherKey = toBase64Url(cryptoImpl.getRandomValues(new Uint8Array(32)));
    const otherState = toBase64Url(cryptoImpl.getRandomValues(new Uint8Array(32)));
    // Another state: not a sign-in this app started, so it is ignored and the real one still works.
    const stranger = await sealSessionForPhone({ state: otherState, key: request.key }, TOKEN, cryptoImpl);
    await expect(openPhoneSignInLink(stranger, { storage: appStorage, cryptoImpl })).rejects.toMatchObject({ name: 'NotOurs' });
    expect(appStorage.getItem('tt_phone_signin')).not.toBeNull();
    // Right state, wrong key: refused, and the pending sign-in is used up.
    const forged = await sealSessionForPhone({ state: request.state, key: otherKey }, TOKEN, cryptoImpl);
    await expect(openPhoneSignInLink(forged, { storage: appStorage, cryptoImpl })).rejects.toMatchObject({ name: 'BadLink' });
    expect(appStorage.getItem('tt_phone_signin')).toBeNull();
  });

  it('a tampered link is refused', async () => {
    const { url, appStorage } = await appStarts();
    const request = readPhoneSignIn(url.search, url.hash, memoryStore());
    const link = new URL(await sealSessionForPhone(request, TOKEN, cryptoImpl));
    const data = link.searchParams.get('data');
    link.searchParams.set('data', (data[0] === 'A' ? 'B' : 'A') + data.slice(1));
    await expect(openPhoneSignInLink(link.toString(), { storage: appStorage, cryptoImpl })).rejects.toMatchObject({ name: 'BadLink' });
  });

  it('an old sign-in has expired', async () => {
    const { url, appStorage } = await appStarts({ now: 0 });
    const request = readPhoneSignIn(url.search, url.hash, memoryStore());
    const link = await sealSessionForPhone(request, TOKEN, cryptoImpl);
    await expect(openPhoneSignInLink(link, { storage: appStorage, cryptoImpl, now: PHONE_SIGNIN_MAX_AGE_MS + 1 })).rejects.toMatchObject({ name: 'Expired' });
  });

  it('the browser page accepts only links the app could have made', () => {
    const state = 'A'.repeat(43);
    const key = 'B'.repeat(43);
    expect(readPhoneSignIn(`?state=${state}&provider=google`, `#k=${key}`, memoryStore())).toEqual({ state, provider: 'google', key });
    expect(readPhoneSignIn(`?state=${state}&provider=apple`, '', memoryStore())).toEqual({ state, provider: 'apple', key: null });
    for (const bad of ['', '?state=short', `?state=${state}<x`, `?state=${state}&provider=evil`, `?state=${state}&provider=__proto__`]) {
      expect(readPhoneSignIn(bad, `#k=${key}`, memoryStore()), bad).toBeNull();
    }
    expect(readPhoneSignIn(`?state=${state}`, '#k=short', memoryStore()).key).toBeNull();
  });

  it('after signing in the app resumes through the login page', () => {
    expect(afterPhoneSignInPath('/join')).toBe('/login?authReturn=1&returnTo=%2Fjoin');
    expect(afterPhoneSignInPath('https://evil.example')).toBe('/login?authReturn=1&returnTo=%2F');
  });
});

describe('the phone app receiving the link', () => {
  it('signs in with its own link and closes the browser', async () => {
    const { url, appStorage } = await appStarts({ returnTo: '/join', now: Date.now() });
    const request = readPhoneSignIn(url.search, url.hash, memoryStore());
    const link = await sealSessionForPhone(request, TOKEN, cryptoImpl);
    const setToken = vi.fn();
    const go = vi.fn();
    const closeBrowser = vi.fn(async () => {});
    expect(await acceptPhoneSignInLink(link, { storage: appStorage, setToken, go, closeBrowser })).toBe('signed-in');
    expect(setToken).toHaveBeenCalledWith(TOKEN);
    expect(go).toHaveBeenCalledWith('/login?authReturn=1&returnTo=%2Fjoin');
    expect(closeBrowser).toHaveBeenCalled();
  });

  it('ignores other links and links it did not start; says when sign-in failed', async () => {
    const setToken = vi.fn();
    const go = vi.fn();
    expect(await acceptPhoneSignInLink('https://tt.example/x', { storage: memoryStore(), setToken, go })).toBe('ignored');
    expect(await acceptPhoneSignInLink(`com.transittrack.app://signin?state=${'A'.repeat(43)}&iv=x&data=y`, { storage: memoryStore(), setToken, go })).toBe('ignored');
    expect(go).not.toHaveBeenCalled();
    const { url, appStorage } = await appStarts({ now: Date.now() });
    const request = readPhoneSignIn(url.search, url.hash, memoryStore());
    expect(await acceptPhoneSignInLink(`com.transittrack.app://signin?state=${request.state}&iv=x&data=y`, { storage: appStorage, setToken, go })).toBe('failed');
    expect(go).toHaveBeenCalledWith('/login?phoneSignIn=failed');
    expect(setToken).not.toHaveBeenCalled();
  });
});
