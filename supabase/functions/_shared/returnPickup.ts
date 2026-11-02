import { secrets } from './base44-compat.ts';
import { reserveAttempt } from './atomicOps.ts';
import { pushWithPolicy, emailWithPolicy } from './notificationPolicy.ts';
import { sendPushToTokens } from './fcm.ts';
import { patternSkips } from './ridePattern.ts';

function returnDistance(a,b) {
 const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad, dlng=(b.lng-a.lng)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export async function updateReturnPickup(base44, vehicle, sample, now=Date.now()) {
 if(!Number.isFinite(Date.parse(sample.last_location_update)) || !Number.isFinite(sample.current_lat) || !Number.isFinite(sample.current_lng) || vehicle.trip_direction!=='to_home' || !vehicle.tracking_active || vehicle.in_service===false
   || now-Date.parse(sample.last_location_update)>60000 || Date.parse(sample.last_location_update)>now+30000) return;
 const db=base44.asServiceRole.entities;
 const workplaces=await db.Workplace.filter({company_id:vehicle.company_id},'-updated_date',5);
 const workplace=workplaces.find(w=>w.company_id===vehicle.company_id && w.lat!=null && w.lng!=null
   && Number.isFinite(Number(w.lat)) && Math.abs(Number(w.lat))<=90
   && Number.isFinite(Number(w.lng)) && Math.abs(Number(w.lng))<=180);
 if(!workplace) return;
 const distance=returnDistance({lat:sample.current_lat,lng:sample.current_lng},{lat:Number(workplace.lat),lng:Number(workplace.lng)});
 const day=new Date(now).toLocaleDateString('en-CA',{timeZone:'America/Grenada'});
 const prior=vehicle.return_pickup_date===day ? vehicle.return_pickup_state || 'pending' : 'pending';
 if(vehicle.return_pickup_date!==day) await db.Vehicle.update(vehicle.id,{return_pickup_state:'pending',return_pickup_date:day});
 if(prior==='departed') return;
 if(prior==='arrived' && distance>300) {
   await db.Vehicle.update(vehicle.id,{return_pickup_state:'departed'});return;
 }
 const stage=distance<=120 ? 'arrived' : distance<=1000 && prior!=='arrived' ? 'near' : null;
 if(!stage) return;
 await db.Vehicle.update(vehicle.id,{return_pickup_state:stage});
 const run=(vehicle.trip_direction_started_at || 'legacy')+':'+day;
 const key='return-pickup:'+vehicle.company_id+':'+vehicle.id+':'+run+':'+stage;
 if(!(await reserveAttempt(base44,key,1,24*3600000))) return;
 const rows=await db.CompanyMembership.filter({company_id:vehicle.company_id,vehicle_id:vehicle.id,scope:'passenger',active:true},'-updated_date',5000);
 const live=[];
 let companyHash;
 for(const row of rows) {
   if(row.company_id!==vehicle.company_id || row.vehicle_id!==vehicle.id) continue;
   if(!row.expires_at && !row.code_hash) {live.push(row);continue;}
   if(!row.code_hash) continue;
   if(companyHash===undefined) {
     const company=await db.Company.get(vehicle.company_id);
     const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company?.access_code || ''));
     companyHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   }
   if(row.code_hash===companyHash) live.push(row);
 }
 const ids=[...new Set(live.map(m=>m.user_id).filter(Boolean))];
 if(!ids.length) return;
 const users=(await db.User.filter({id:{$in:ids}})).filter(u=>['staff','passenger'].includes(u.role)
   && !(u.skip_pickup_today && (!u.skip_pickup_until || Date.parse(u.skip_pickup_until)>now))
   && !patternSkips(u.ride_pattern, now, 'to_home'));
 const emails=[...new Set(users.map(u=>String(u.email||'').trim().toLowerCase()).filter(Boolean))];
 if(!emails.length) return;
 const name=String(workplace.name||'your company').replace(/[<>\x00-\x1f]/g,'');
 const bus=String(vehicle.name||'Your bus').replace(/[<>\x00-\x1f]/g,'');
 const title=stage==='arrived' ? bus+' is at your company' : bus+' is near your company';
 const message=stage==='arrived' ? bus+' has arrived at '+name+' to take you home. Please board at the company boarding point.'
   : bus+' is approaching '+name+' to take you home. Please head to the company boarding point.';
 await db.Broadcast.create({type:'info',title,message,company_id:vehicle.company_id,company_name:vehicle.company_name||'',
   vehicle_id:vehicle.id,vehicle_name:bus,return_pickup:true});
 const payload={title,body:message,data:{type:'return_pickup_'+stage,vehicle_id:vehicle.id}};
 const tokens=(await db.PushToken.filter({email:{$in:emails}},'-created_date',2000)).filter(t=>emails.includes(String(t.email||'').toLowerCase())).map(t=>t.token);
 const serviceAccount=secrets.get('FIREBASE_SERVICE_ACCOUNT');
 if(serviceAccount && tokens.length) await pushWithPolicy(base44,'return_pickup_push',tokens,payload,
   list=>sendPushToTokens(serviceAccount,list,payload,'/staff'),{companyId:vehicle.company_id}).catch(()=>{});
 await emailWithPolicy(base44,'return_pickup_email',emails.map(email=>({email})),
   r=>base44.asServiceRole.integrations.Core.SendEmail({to:r.email,subject:title,body:message}),
   {title,companyId:vehicle.company_id}).catch(()=>{});
}
