import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { httpStatus, errorData, sessionRejected } from '@/lib/requestError';

// Exercise the provider's async state transitions without browser navigation.
function provider(me, { saved = null, savedSettings = null, settings = vi.fn().mockResolvedValue({ id: 'app' }) } = {}) {
  const states = [];
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState: initial => { const index = states.length; states.push(initial); return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => ({ current: initial }), useEffect: () => {},
    createElement: (_type, props) => props.value,
  };
  const source = fs.readFileSync(new URL('../AuthContext.jsx', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {}, sdk = { auth: { me, logout: vi.fn(), redirectToLogin: vi.fn() }, app: { getPublicSettings: settings } };
  const store = {
    savedProfile: vi.fn(() => saved), rememberProfile: vi.fn(), forgetProfile: vi.fn(),
    savedPublicSettings: vi.fn(() => savedSettings), rememberPublicSettings: vi.fn(),
  };
  new Function('exports', 'React', 'createContext', 'useState', 'useContext', 'useEffect', 'useRef', 'base44', 'appParams', 'setAuditActor', 'ACCENT_KEY', 'applyAccent', 'httpStatus', 'errorData', 'sessionRejected', 'isKioskInstall', 'savedProfile', 'rememberProfile', 'forgetProfile', 'savedPublicSettings', 'rememberPublicSettings', js)(exports, react, react.createContext, react.useState, () => null, react.useEffect, react.useRef, sdk, { token: 'saved' }, () => {}, 'accent', () => {}, httpStatus, errorData, sessionRejected, () => false, store.savedProfile, store.rememberProfile, store.forgetProfile, store.savedPublicSettings, store.rememberPublicSettings);
  return { actions: exports.AuthProvider({ children: null }), states, sdk, store };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const user = { id: 'passenger', role: 'passenger' };

describe('account sign-in recovery', () => {
  it('retains a confirmed session during a failed background profile refresh without showing a full-screen loader', async () => {
    const me = vi.fn().mockResolvedValueOnce(user).mockRejectedValueOnce({ status: 429 });
    const p = provider(me);
    await p.actions.checkUserAuth();
    expect(p.states[1]).toBe(true);
    const refresh = p.actions.checkUserAuth();
    expect(p.states[2]).toBe(false);
    await refresh;
    expect(p.states[0]).toEqual(user);
    expect(p.states[1]).toBe(true);
    expect(p.states[4]).toBeNull();
  });
  it('offers recovery rather than logging out when both startup attempts cannot connect', async () => {
    vi.useFakeTimers();
    const p = provider(vi.fn().mockRejectedValue({ status: 503 }));
    const pending = p.actions.checkUserAuth();
    await vi.runAllTimersAsync(); await pending;
    expect(p.states[4].type).toBe('auth_unavailable');
    expect(p.states[1]).toBe(false);
    expect(p.sdk.auth.logout).not.toHaveBeenCalled();
  });
  it('shares overlapping sign-in checks instead of making duplicate requests', async () => {
    let resolve; const me = vi.fn(() => new Promise(r => { resolve = r; }));
    const p = provider(me);
    const a = p.actions.checkUserAuth(), b = p.actions.checkUserAuth();
    expect(me).toHaveBeenCalledTimes(1);
    resolve(user); await Promise.all([a, b]);
    expect(p.states[1]).toBe(true);
  });
  it('does not restore a session from a response arriving after an explicit sign-out', async () => {
    let resolve; const p = provider(() => new Promise(r => { resolve = r; }));
    const pending = p.actions.checkUserAuth();
    p.actions.logout(false); resolve(user); await pending;
    expect(p.states[0]).toBeNull(); expect(p.states[1]).toBe(false);
  });
  it('still locks an account when the server genuinely rejects its login', async () => {
    const p = provider(vi.fn().mockRejectedValue({ status: 401 }));
    await p.actions.checkUserAuth();
    expect(p.states[4].type).toBe('auth_required'); expect(p.states[1]).toBe(false);
  });
});

// States: 0 user, 1 signed in, 2 loading account, 3 loading settings, 4 error, 5 checked, 6 settings.
describe('trust the phone: opening with the saved sign-in', () => {
  const fresh = { id: 'passenger', role: 'passenger', full_name: 'New name' };
  const opening = () => vi.stubGlobal('window', { location: { pathname: '/staff' } });

  it('opens at once with the saved profile and settings, then takes the server’s answer', async () => {
    opening();
    let answer; const me = vi.fn(() => new Promise((r) => { answer = r; }));
    const p = provider(me, { saved: user, savedSettings: { id: 'app' } });
    const pending = p.actions.checkAppState();
    // Nothing to wait for on screen: the saved person is shown straight away.
    expect(p.states[0]).toEqual(user);
    expect(p.states[1]).toBe(true);
    expect(p.states[2]).toBe(false);
    expect(p.states[3]).toBe(false);
    expect(me).toHaveBeenCalledTimes(1); // still checked
    answer(fresh); await pending;
    expect(p.states[0]).toEqual(fresh);
    expect(p.store.rememberProfile).toHaveBeenCalledWith(fresh);
    expect(p.store.rememberPublicSettings).toHaveBeenCalledWith({ id: 'app' });
  });

  it('still sends the person to the login page when the server has ended the sign-in', async () => {
    opening();
    const p = provider(vi.fn().mockRejectedValue({ status: 401 }), { saved: user, savedSettings: { id: 'app' } });
    await p.actions.checkAppState();
    expect(p.states[4].type).toBe('auth_required');
    expect(p.states[1]).toBe(false);
    expect(p.states[0]).toBeNull();
    expect(p.store.forgetProfile).toHaveBeenCalled();
  });

  it('keeps the saved screen when the server can’t be reached', async () => {
    opening();
    const p = provider(vi.fn().mockRejectedValue({ status: 503 }), {
      saved: user, savedSettings: { id: 'app' }, settings: vi.fn().mockRejectedValue({ status: 503 }),
    });
    await p.actions.checkAppState();
    expect(p.states[0]).toEqual(user);
    expect(p.states[1]).toBe(true);
    expect(p.states[4]).toBeNull();
    expect(p.sdk.auth.logout).not.toHaveBeenCalled();
  });

  it('waits for the server as before when there is nothing saved', async () => {
    opening();
    let answer; const p = provider(vi.fn(() => new Promise((r) => { answer = r; })));
    const pending = p.actions.checkAppState();
    expect(p.states[0]).toBeNull();
    expect(p.states[2]).toBe(true);
    expect(p.states[3]).toBe(true);
    answer(user); await pending;
    expect(p.states[0]).toEqual(user);
    expect(p.states[2]).toBe(false);
  });

  it('forgets the saved profile on sign-out', () => {
    const p = provider(vi.fn());
    p.actions.logout(false);
    expect(p.store.forgetProfile).toHaveBeenCalled();
  });
});