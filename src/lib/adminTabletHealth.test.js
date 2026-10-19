import {describe,it,expect} from 'vitest';
import {adminTabletHealth} from './adminTabletHealth';
const now=Date.parse('2026-10-08T12:00:00Z');
const iso=offset=>new Date(now+offset).toISOString();
const healthy={paired:true,status:'active',last_seen:iso(0),helper_health:{reported_at:iso(0),reader:'Connected',battery:80}};
describe('admin tablet reports',()=>{
 it('requires fresh device and helper reports before showing healthy',()=>{
  expect(adminTabletHealth(healthy,now)).toMatchObject({tone:'success',attention:false});
  expect(adminTabletHealth({...healthy,last_seen:iso(-660000)},now)).toMatchObject({label:'Not reporting',attention:true});
  expect(adminTabletHealth({...healthy,helper_health:null},now)).toMatchObject({label:'Helper status unknown',tone:'offline'});
  expect(adminTabletHealth({...healthy,helper_health:{reported_at:iso(-660000)}},now)).toMatchObject({label:'Helper report is stale',attention:true});
  expect(adminTabletHealth({...healthy,last_seen:iso(120000)},now).tone).not.toBe('success');
 });
 it('surfaces reader failures and low batteries without flagging intentionally inactive tablets',()=>{
  expect(adminTabletHealth({...healthy,helper_health:{...healthy.helper_health,reader:'Not plugged in'}},now)).toMatchObject({label:'Reader: Not plugged in',attention:true});
  expect(adminTabletHealth({...healthy,helper_health:{...healthy.helper_health,battery:10,charging:false}},now)).toMatchObject({label:'Low battery',attention:true});
  expect(adminTabletHealth({...healthy,status:'inactive'},now)).toMatchObject({label:'Inactive',attention:false});
  expect(adminTabletHealth({...healthy,paired:false},now)).toMatchObject({label:'Not paired',attention:false});
 });
});

describe('native driver tracking status',()=>{
 it('shows a fresh native service report even when the web helper report is stale',()=>{
  const device={...healthy,kiosk_type:'driver',helper_health:{reported_at:iso(-660000)},native_tracking_health:{active:true,reported_at:iso(0),review:0}};
  expect(adminTabletHealth(device,now)).toMatchObject({label:'Background GPS reporting',tone:'success'});
  expect(adminTabletHealth({...device,native_tracking_health:{...device.native_tracking_health,review:2}},now)).toMatchObject({attention:true,tone:'warning'});
  expect(adminTabletHealth({...device,native_tracking_health:{...device.native_tracking_health,reported_at:iso(-240000)}},now).tone).not.toBe('success');
 });
});
