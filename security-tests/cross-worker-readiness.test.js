// S06 gate: do not replace this with a shared-process harness or skip it.
import {describe,it,expect} from 'vitest';
import {load,mock,interleaveReads} from './helpers';
describe('deployment-wide production concurrency requirements',()=>{
 it('enforces one shared request budget across independently loaded backend workers',async()=>{
  const sdk=mock();interleaveReads(sdk,'VerificationAttempt',20);
  // Each load evaluates shared modules independently, as separate workers do.
  const workers=Array.from({length:20},()=>load('driverSession',sdk,['reserveAttempt']));
  const decisions=await Promise.all(workers.map(w=>w.reserveAttempt(sdk,'worker-burst',5,60000)));
  expect(decisions.filter(Boolean)).toHaveLength(5);
  expect(await load('driverSession',sdk,['reserveAttempt']).reserveAttempt(sdk,'worker-burst',5,60000)).toBe(false);
  expect(sdk.atomicCalls).toHaveLength(21);
  expect(sdk.writes.some(w=>w.name==='VerificationAttempt')).toBe(false);
 });
});
