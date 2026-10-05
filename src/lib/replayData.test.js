
import { describe, expect, it, vi } from 'vitest';
import { latestReplayDay, loadReplayDay, replayDay } from './replayData';
describe('historical fleet location reads',()=>{
 it('finds the latest recorded day without requiring a live position',async()=>{
   const store={filter:vi.fn().mockResolvedValue([{recorded_at:'2026-09-30T12:00:00Z'}])};
   expect(await latestReplayDay(store,'offline-bus')).toBe(replayDay(new Date('2026-09-30T12:00:00Z')));
   expect(store.filter).toHaveBeenCalledWith({vehicle_id:'offline-bus'},'-recorded_at',1);
 });
 it('pages a whole day beyond the first 1000 points',async()=>{
   const row={recorded_at:new Date('2026-09-30T12:00:00').toISOString()};
   const store={filter:vi.fn().mockResolvedValueOnce(Array(1000).fill(row)).mockResolvedValueOnce([row])};
   expect(await loadReplayDay(store,'bus','2026-09-30')).toHaveLength(1001);
   expect(store.filter.mock.calls[1][3]).toBe(1000);
 });
 it('falls back to paginated equality queries on older stores',async()=>{
   const row={recorded_at:new Date('2026-09-30T12:00:00').toISOString()};
   const store={filter:vi.fn().mockRejectedValueOnce(new Error('range unsupported')).mockResolvedValueOnce([row,{recorded_at:'2026-09-29T00:00:00Z'}])};
   expect(await loadReplayDay(store,'bus','2026-09-30')).toEqual([row]);
   expect(store.filter.mock.calls[1][0]).toEqual({vehicle_id:'bus'});
 });
 it('preserves read errors instead of claiming there are no trips',async()=>{
   const store={filter:vi.fn().mockRejectedValue(new Error('Forbidden'))};
   await expect(loadReplayDay(store,'bus','2026-09-30')).rejects.toThrow('Forbidden');
 });
 it('reports no latest day when there are no recorded points',async()=>{
   expect(await latestReplayDay({filter:vi.fn().mockResolvedValue([])},'bus')).toBeNull();
 });
});
