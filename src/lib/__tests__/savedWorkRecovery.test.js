import {beforeEach,describe,it,expect,vi} from 'vitest';
import {installMemoryStorage} from './memoryStorage';
import {enqueueCheckIn,flushQueue,submitSavedCheckIn,hasSavedCheckIn} from '../offlineQueue';
import {submitSavedJob,pendingJobs} from '../offlineJobs';
import {savedWork,exportSavedWork,archiveReviewedWork,removeArchivedWork,retryReviewedWork} from '../savedWork';
beforeEach(()=>installMemoryStorage());
const reject=status=>Object.assign(new Error('rejected'),{response:{status}});
describe('saved-work recovery',()=>{
 it('keeps dependent check-ins paused but continues another passenger',async()=>{
  enqueueCheckIn({staff_id:'a',status:'boarded'});
  enqueueCheckIn({staff_id:'a',status:'off_board'});
  enqueueCheckIn({staff_id:'b',status:'boarded'});
  const send=vi.fn(async(_action,payload)=>{if(payload.staff_id==='a')throw reject(403);});
  expect(await flushQueue(send)).toBe(1);
  expect(send.mock.calls.filter(([,payload])=>payload.staff_id==='a')).toHaveLength(1);
  expect(savedWork()).toHaveLength(2);expect(savedWork()[0].state).toBe('needs_review');
 });
 it('persists a check-in before invoking the server and removes it only after acknowledgement',async()=>{
  const payload={client_request_id:'persist-first',staff_id:'a',status:'boarded'};
  await submitSavedCheckIn(async()=>{
   expect(hasSavedCheckIn(payload.client_request_id)).toBe(true);
   return {record:{id:'saved'}};
  },payload);
  expect(hasSavedCheckIn(payload.client_request_id)).toBe(false);
 });
 it('never sends new work after storage failure even if older work exists',async()=>{
  enqueueCheckIn({staff_id:'old',status:'boarded'});
  localStorage.setItem=()=>{throw new Error('quota');};
  const send=vi.fn();
  await expect(submitSavedCheckIn(send,{client_request_id:'new-unsaved',staff_id:'new'})).rejects.toThrow(/not saved/);
  expect(send).not.toHaveBeenCalled();expect(hasSavedCheckIn('new-unsaved')).toBe(false);
 });
 it('persists job progress before sending and retains original photos after 503',async()=>{
  const payload={client_request_id:'photo-job',results:[{photo_data:'original-photo'}]};
  await expect(submitSavedJob('inspection',payload,'Inspection',async()=>{
   expect(pendingJobs()[0].payload.results[0].photo_data).toBe('original-photo');throw reject(503);
  })).rejects.toMatchObject({response:{status:503}});
  expect(pendingJobs()[0].payload.results[0].photo_data).toBe('original-photo');
 });
 it('exports original data while omitting credential tokens and PINs',()=>{
  enqueueCheckIn({staff_id:'a',verification_grant:'SECRET',device_token:'SECRET',nested:{driver_pin:'SECRET',card_uid:'SECRET'},photo_data:'keep-photo'});
  const exported=exportSavedWork();
  expect(exported).not.toContain('SECRET');expect(exported).toContain('keep-photo');expect(exported).toContain('staff_id');
 });
 it('archives retained failures without removing originals and never replays archived work',async()=>{
  enqueueCheckIn({staff_id:'a',status:'boarded'});
  await flushQueue(async()=>{throw reject(409);});
  archiveReviewedWork();expect(savedWork()[0].state).toBe('archived');
  const send=vi.fn();expect(await flushQueue(send)).toBe(0);expect(send).not.toHaveBeenCalled();
  expect(exportSavedWork()).toContain('archived');
 });
 it('removes only archived copies and leaves pending/reviewed work intact',async()=>{
  enqueueCheckIn({staff_id:'a',status:'boarded'});
  await flushQueue(async()=>{throw reject(400);});
  archiveReviewedWork();enqueueCheckIn({staff_id:'b',status:'boarded'});
  removeArchivedWork();expect(savedWork()).toHaveLength(1);expect(savedWork()[0].payload.staff_id).toBe('b');
 });
 it('retry keeps the original assignment and request ID and does not reset archived items',async()=>{
  enqueueCheckIn({staff_id:'a',client_request_id:'original-request',expected_vehicle_id:'original-bus'});
  await flushQueue(async()=>{throw reject(409);});retryReviewedWork();
  expect(savedWork()[0]).toMatchObject({payload:{client_request_id:'original-request',expected_vehicle_id:'original-bus'}});
  expect(savedWork()[0].state).toBeUndefined();
 });
});
