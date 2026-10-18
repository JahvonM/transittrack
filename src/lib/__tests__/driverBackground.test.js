import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const f=vi.hoisted(()=>({available:true,native:{}}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>f.available,getPlatform:()=> 'android',isPluginAvailable:()=>f.available},registerPlugin:()=>f.native}));
import { configureBackgroundGps, stopBackgroundGps, exportBackgroundGps } from '../driverBackground';
beforeEach(()=>{
 const storage=new Map([['tt_driver_device_id','tablet'],['tt_device_token_tablet','a'.repeat(64)],['tt_driver_grant_tablet','b'.repeat(64)]]);
 vi.stubGlobal('localStorage',{getItem:key=>storage.get(key)||null});
 f.available=true;f.native.getState=vi.fn(async()=>({enabled:true}));f.native.configure=vi.fn(async()=>({managed:true}));f.native.stop=vi.fn(async()=>{});
});
afterEach(()=>vi.unstubAllGlobals());
describe('native background GPS bridge',()=>{
 it('starts only with current credentials and explicit bus/company binding',async()=>{
  expect(await configureBackgroundGps({id:'bus',company_id:'company'})).toBe(true);
  expect(f.native.configure).toHaveBeenCalledWith({device_id:'tablet',device_token:'a'.repeat(64),driver_grant:'b'.repeat(64),expected_device_id:'tablet',expected_company_id:'company',expected_vehicle_id:'bus'});
 });
 it('does not activate on web, when disabled or without a verified PIN grant',async()=>{
  f.available=false;expect(await configureBackgroundGps({id:'bus',company_id:'company'})).toBe(false);
  f.available=true;f.native.getState.mockResolvedValue({enabled:false});expect(await configureBackgroundGps({id:'bus',company_id:'company'})).toBe(false);
  f.native.getState.mockResolvedValue({enabled:true});vi.stubGlobal('localStorage',{getItem:()=>null});expect(await configureBackgroundGps({id:'bus',company_id:'company'})).toBe(false);
  expect(f.native.configure).not.toHaveBeenCalled();
 });
 it('ends native tracking without deleting exported or queued work',async()=>{
  await stopBackgroundGps();expect(f.native.stop).toHaveBeenCalledOnce();
 });
 it('exports every page in one snapshot without removing the originals',async()=>{
  f.native.savedPoints=vi.fn().mockResolvedValueOnce({points:[{queue_id:'one'}],cursor:100,max:101,done:false}).mockResolvedValueOnce({points:[{queue_id:'two'}],cursor:101,max:101,done:true});
  expect(await exportBackgroundGps()).toEqual([{queue_id:'one'},{queue_id:'two'}]);
  expect(f.native.savedPoints).toHaveBeenLastCalledWith({cursor:100,max:101});expect(f.native.stop).not.toHaveBeenCalled();
 });
 it('rejects a non-advancing export rather than returning a partial file',async()=>{
  f.native.savedPoints=vi.fn(async()=>({points:[],cursor:0,max:100,done:false}));
  await expect(exportBackgroundGps()).rejects.toThrow('could not continue');
 });
});
