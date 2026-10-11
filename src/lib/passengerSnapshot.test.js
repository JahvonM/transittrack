import {it,expect,beforeEach} from 'vitest';
import {savePassengerSnapshot,loadPassengerSnapshot,clearPassengerSnapshot} from './passengerSnapshot';
beforeEach(()=>{const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};});
it('saves display details without credentials and requires the same user and company',()=>{
 savePassengerSnapshot('me',{id:'a',name:'A',access_code:'SECRET'},null,{vehicles:[{id:'bus',driver_pin:'SECRET',name:'Bus'}],routes:[],trips:[],credential:'SECRET'});
 const data=loadPassengerSnapshot('me','a');
 expect(data.result.vehicles[0].name).toBe('Bus');expect(JSON.stringify(data)).not.toContain('SECRET');
 expect(loadPassengerSnapshot('other','a')).toBeNull();expect(loadPassengerSnapshot('me','b')).toBeNull();
 clearPassengerSnapshot();expect(loadPassengerSnapshot('me','a')).toBeNull();
});
it('does not serve expired saved data',()=>{
 savePassengerSnapshot('me',{id:'a'},null,{});
 const key='tt_passenger_display_snapshot_v1',data=JSON.parse(localStorage.getItem(key));data.savedAt='2020-01-01';localStorage.setItem(key,JSON.stringify(data));
 expect(loadPassengerSnapshot('me','a')).toBeNull();
});
