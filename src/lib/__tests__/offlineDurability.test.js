import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from './memoryStorage';
import { enqueueCheckIn, flushQueue, queueLength } from '../offlineQueue';
import { queueGpsPoint, flushGpsQueue, queuedGpsCount } from '../gpsQueue';
import { enqueueJob, registerRunner, flushJobs, pendingJobs } from '../offlineJobs';
vi.mock('@/lib/reportError',()=>({reportError:vi.fn()}));
beforeEach(()=>installMemoryStorage());
const failure=status=>Object.assign(new Error('failed'),{response:{status}});
describe('durable tablet queues',()=>{
 for(const status of [400,401,403,429,500]) it('retains check-ins and order after HTTP '+status,async()=>{
  enqueueCheckIn({staff_id:'a',status:'boarded'}); enqueueCheckIn({staff_id:'b',status:'boarded'});
  const send=vi.fn().mockRejectedValue(failure(status));
  expect(await flushQueue(send)).toBe(0); expect(send).toHaveBeenCalledTimes([400,403].includes(status)?2:1); expect(queueLength()).toBe(2);
 });
 it('persists a stable ID for legacy queued work before a lost response',async()=>{
  localStorage.setItem('tt_offline_checkins',JSON.stringify([{id:'old',payload:{staff_id:'a',status:'boarded'}}]));
  let first; await flushQueue(async(_action,p)=>{first=p.client_request_id;throw new Error('lost response');});
  const send=vi.fn().mockResolvedValue({}); expect(await flushQueue(send)).toBe(1);
  expect(send.mock.calls[0][1].client_request_id).toBe(first); expect(first).toBeTruthy(); expect(queueLength()).toBe(0);
 });
 it('preserves work enqueued while an upload is running',async()=>{
  enqueueCheckIn({staff_id:'a',status:'boarded'});
  expect(await flushQueue(async()=>{enqueueCheckIn({staff_id:'b',status:'boarded'});})).toBe(1);
  expect(queueLength()).toBe(1);
 });
 it('does not claim an item was saved when storage is full',()=>{
  localStorage.setItem=()=>{throw new Error('quota');};
  expect(()=>enqueueCheckIn({staff_id:'a'})).toThrow(/not saved/);
  expect(()=>queueGpsPoint({lat:18,lng:-76,t:Date.now()})).toThrow(/could not be saved/);
  expect(enqueueJob('inspection',{},'Inspection')).toBe(false);
 });
 for(const key of ['tt_offline_checkins','tt_gps_queue','tt_offline_jobs']) it('preserves corrupt storage '+key,()=>{
  localStorage.setItem(key,'broken');
  const read=key==='tt_offline_checkins'?queueLength:key==='tt_gps_queue'?queuedGpsCount:pendingJobs;
  expect(read).toThrow(/cannot be read/);expect(localStorage.getItem(key)).toBe('broken');
 });
 for(const status of [401,429,500]) it('retains GPS batch after HTTP '+status,async()=>{
  queueGpsPoint({lat:18,lng:-76,t:Date.now()-60000});
  expect(await flushGpsQueue(async()=>{throw failure(status);})).toBe(0);expect(queuedGpsCount()).toBe(1);
  expect(await flushGpsQueue(async()=>({ok:true}))).toBe(1);expect(queuedGpsCount()).toBe(0);
 });
 it('rejects invalid and future GPS points before storage',()=>{
  expect(queueGpsPoint({lat:null,lng:0})).toBe(false);
  expect(queueGpsPoint({lat:91,lng:0})).toBe(false);
  expect(queueGpsPoint({lat:18,lng:0,t:Date.now()+120000})).toBe(false);
  expect(queuedGpsCount()).toBe(0);
 });
 it('retains failed jobs and their saved progress',async()=>{
  enqueueJob('test-inspection',{step:0},'Test');
  registerRunner('test-inspection',async(p,save)=>{save({...p,step:1});throw failure(500);});
  expect(await flushJobs()).toBe(0);expect(pendingJobs()[0]).toMatchObject({payload:{step:1},last_error:'Server returned 500'});
  registerRunner('test-inspection',async p=>expect(p.step).toBe(1));
  expect(await flushJobs()).toBe(1);expect(pendingJobs()).toEqual([]);
 });
});
