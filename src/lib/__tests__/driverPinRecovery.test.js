import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { installMemoryStorage } from './memoryStorage';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...args) => invoke(...args) } } }));

import { rememberPin, checkPinOffline, confirmPinWhenOnline } from '@/lib/offlinePin';
import { rememberUnlockDay, unlockDayMarked } from '@/lib/localDay';

const GRANT = 'a'.repeat(64);
let locked = 0;

beforeEach(() => {
  vi.useFakeTimers();
  installMemoryStorage();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { onLine: true });
  locked = 0;
  vi.stubGlobal('window', {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: (event) => { if (event.type === 'tt-driver-locked') locked += 1; return true; },
  });
  invoke.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const serverError = (status, data) => Object.assign(new Error(data?.error || 'Request failed'), { status, data });

describe('driver PIN while the connection comes and goes', () => {
  it('never asks for the PIN again when the background check cannot reach the server', async () => {
    await rememberPin('tablet', '1234');
    rememberUnlockDay();
    invoke.mockRejectedValue(new Error('Network Error'));
    confirmPinWhenOnline('tablet', '1234');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(locked).toBe(0);
    expect(unlockDayMarked()).toBe(true);
    expect(await checkPinOffline('tablet', '1234')).toBe(true);
  });

  it('treats a reply that is not the tablet backend\'s PIN verdict as no answer at all', async () => {
    await rememberPin('tablet', '1234');
    rememberUnlockDay();
    invoke.mockRejectedValue(serverError(401, {}));
    confirmPinWhenOnline('tablet', '1234');
    await vi.advanceTimersByTimeAsync(0);
    expect(locked).toBe(0);
    expect(unlockDayMarked()).toBe(true);
    expect(await checkPinOffline('tablet', '1234')).toBe(true);
  });

  it('stops trusting the remembered PIN only when the backend rejects it', async () => {
    await rememberPin('tablet', '1234');
    rememberUnlockDay();
    invoke.mockRejectedValue(serverError(403, { error: 'Incorrect PIN' }));
    confirmPinWhenOnline('tablet', '1234');
    await vi.advanceTimersByTimeAsync(0);
    expect(locked).toBe(0);
    expect(await checkPinOffline('tablet', '1234')).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps the pass the backend issues and stops checking', async () => {
    await rememberPin('tablet', '1234');
    rememberUnlockDay();
    invoke.mockResolvedValue({ data: { ok: true, driver_grant: GRANT } });
    confirmPinWhenOnline('tablet', '1234');
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem('tt_driver_grant_tablet')).toBe(GRANT);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(unlockDayMarked()).toBe(true);
  });
});