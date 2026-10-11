import { beforeEach, describe, it, expect, vi } from 'vitest';
import { installMemoryStorage } from './memoryStorage';
import { enqueueCheckIn, flushQueue, submitSavedCheckIn, queueLength, clearLiveRefusals } from '../offlineQueue';
import { savedWork } from '../savedWork';

beforeEach(() => installMemoryStorage());
const reject = (status) => Object.assign(new Error('rejected'), { response: { status } });
const saved = (id, queued, failed, state = 'needs_review') =>
  ({ id, payload: { client_request_id: id, staff_id: id, status: 'boarded' }, queued_at: queued, ...(state ? { state, failed_at: failed, last_error: 'Not allowed' } : {}) });

describe('saved check-ins a tablet cannot act on', () => {
  it('drops a refusal answered while the passenger is at the tablet, and still reports it', async () => {
    await expect(submitSavedCheckIn(async () => { throw reject(403); }, { staff_id: 'a', status: 'boarded' })).rejects.toMatchObject({ response: { status: 403 } });
    expect(queueLength()).toBe(0);
  });

  it('keeps a check-in that never reached the server', async () => {
    await expect(submitSavedCheckIn(async () => { throw new Error('offline'); }, { staff_id: 'a', status: 'boarded' })).rejects.toThrow('offline');
    expect(queueLength()).toBe(1);
    expect(savedWork()[0].state).toBeUndefined();
  });

  it('a live refusal no longer holds back that passenger\'s later saved check-ins', async () => {
    await submitSavedCheckIn(async () => { throw reject(403); }, { staff_id: 'a', status: 'boarded' }).catch(() => {});
    enqueueCheckIn({ staff_id: 'a', status: 'boarded' });
    const send = vi.fn(async () => ({ record: {} }));
    expect(await flushQueue(send)).toBe(1);
    expect(queueLength()).toBe(0);
  });

  it('clears old live refusals once and keeps refusals of check-ins saved offline', () => {
    localStorage.setItem('tt_offline_checkins', JSON.stringify([
      saved('live', '2026-10-10T12:00:00.000Z', '2026-10-10T12:00:02.000Z'),
      saved('replayed', '2026-10-10T12:00:00.000Z', '2026-10-10T12:20:00.000Z'),
      saved('waiting', '2026-10-10T12:00:00.000Z', null, null),
    ]));
    expect(clearLiveRefusals()).toBe(1);
    expect(savedWork().map((item) => item.id)).toEqual(['replayed', 'waiting']);
    // Only once: anything refused later is left for review.
    localStorage.setItem('tt_offline_checkins', JSON.stringify([saved('later', '2026-10-11T12:00:00.000Z', '2026-10-11T12:00:01.000Z')]));
    expect(clearLiveRefusals()).toBe(0);
    expect(savedWork()).toHaveLength(1);
  });
});
