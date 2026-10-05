import {describe,it,expect,vi,afterEach} from 'vitest';
import {badgeInbox} from './badgeInbox';
afterEach(()=>vi.restoreAllMocks());
describe('scanner page handoff',()=>{
 it('delivers a buffered startup tap once, including its retried event',()=>{
   const w={__ttBadgeInbox:[{uid:'aa:bb:cc:dd',id:'tap-1',at:Date.now()}]};
   const take=badgeInbox(w);
   expect(take({detail:'AABBCCDD',ttTapId:'tap-1',ttTapAt:Date.now()})).toEqual(['AABBCCDD']);
   expect(w.__ttBadgeInbox).toEqual([]);
   w.__ttBadgeInbox=[{uid:'AABBCCDD',id:'tap-1',at:Date.now()}];
   expect(take({detail:'AABBCCDD',ttTapId:'tap-1'})).toEqual([]);
 });
 it('drains a tap after wake even when no new event fires',()=>{
   const w={__ttBadgeInbox:[{uid:'1234ABCD',id:'wake',at:Date.now()}]};
   expect(badgeInbox(w)()).toEqual(['1234ABCD']);
   expect(w.__ttBadgeInbox).toEqual([]);
 });
 it('drops stale taps rather than showing an old passenger after wake',()=>{
   const w={__ttBadgeInbox:[{uid:'1234ABCD',id:'old',at:Date.now()-31000}]};
   expect(badgeInbox(w)()).toEqual([]);
 });
 it('retains compatibility with old helper string events',()=>{
   expect(badgeInbox({})({detail:'aa:bb'})).toEqual(['AABB']);
 });
 it('does not persist scanner credentials',()=>{
   const w={localStorage:{setItem:vi.fn()},__ttBadgeInbox:[{uid:'AABB',id:'memory',at:Date.now()}]};
   badgeInbox(w)();
   expect(w.localStorage.setItem).not.toHaveBeenCalled();
   expect(w.__ttBadgeInbox).toEqual([]);
 });
});
