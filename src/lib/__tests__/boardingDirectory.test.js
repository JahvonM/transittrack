import {beforeEach,it,expect,vi} from 'vitest';
import {webcrypto,createHash} from 'node:crypto';
import {load,mock,request} from '../../../security-tests/helpers.js';
import {saveBoardingDirectory,localCardLookup,boardingDirectoryInfo} from '../boardingDirectory';
const device={device_id:'tablet',company_id:'a',vehicle_id:'bus-a'};
const hash=s=>createHash('sha256').update(s).digest('hex');
const snapshot=()=>({version:1,device_id:'tablet',company_id:'a',vehicle_id:'bus-a',generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),directory_grant:'a'.repeat(64),staff:[{id:'rider',full_name:'Rider',photo_url:'',card_fingerprint:hash('tablet:AABBCCDD')}]});
beforeEach(()=>{
 const values=new Map();
 vi.stubGlobal('localStorage',{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)});
 vi.stubGlobal('crypto',webcrypto);
});
it('looks up cards locally without persisting raw UIDs',async()=>{
 saveBoardingDirectory(snapshot(),device);
 expect((await localCardLookup('aa-bb-cc-dd',device)).staff.full_name).toBe('Rider');
 expect(localStorage.getItem('tt_boarding_card_index_v1')).not.toContain('AABBCCDD');
 expect(await localCardLookup('11223344',device)).toBeNull();
 expect(await localCardLookup('AABBCCDD',{...device,vehicle_id:'bus-b'})).toBeNull();
});
it('preserves a good snapshot after a malformed refresh and refuses expired data',async()=>{
 saveBoardingDirectory(snapshot(),device);
 expect(()=>saveBoardingDirectory({...snapshot(),staff:[{}]},device)).toThrow();
 expect(boardingDirectoryInfo().count).toBe(1);
 const d=snapshot();d.expires_at=new Date(Date.now()-1).toISOString();localStorage.setItem('tt_boarding_card_index_v1',JSON.stringify(d));
 expect(await localCardLookup('AABBCCDD',device)).toBeNull();
});
it('publishes only assigned active cards and rechecks revocation when syncing',async()=>{
 const sdk=mock('admin');sdk.tables.Contact[0].nfc_card_tag='AABBCCDD';
 sdk.tables.NfcCard=[{id:'card',company_id:'a',holder_source:'contact',holder_id:'rider',card_uid:'AABBCCDD',is_active:true}];
 sdk.tables.Contact.push({id:'other',company_id:'a',type:'staff',vehicle_id:'bus-b',name:'Other bus',nfc_card_tag:'11223344'});
 const handler=load('kioskCheckIn',sdk).default;
 const d=await (await handler(request({device_id:'tablet',action:'offline_directory'}))).json();
 expect(d.staff).toHaveLength(1);
 expect(JSON.stringify(d)).not.toMatch(/AABBCCDD|11223344|access_code/);
 const body={device_id:'tablet',action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',directory_grant:d.directory_grant,card_fingerprint:d.staff[0].card_fingerprint};
 expect((await handler(request(body))).status).toBe(200);
 sdk.tables.NfcCard[0].is_active=false;
 expect((await handler(request(body))).status).toBe(403);
});
it('rejects copied directory grants on another tablet and refuses mismatched fingerprints',async()=>{
 const sdk=mock('admin');sdk.tables.Contact[0].nfc_card_tag='AABBCCDD';
 const handler=load('kioskCheckIn',sdk).default;
 const d=await (await handler(request({device_id:'tablet',action:'offline_directory'}))).json();
 const body={device_id:'tablet',action:'check_in',staff_id:'rider',method:'nfc',status:'boarded',directory_grant:d.directory_grant,card_fingerprint:'0'.repeat(64)};
 expect((await handler(request(body))).status).toBe(403);
 sdk.tables.KioskDevice.push({...sdk.tables.KioskDevice[0],id:'other'});
 body.device_id='other';body.card_fingerprint=d.staff[0].card_fingerprint;
 expect((await handler(request(body))).status).toBe(403);
});
