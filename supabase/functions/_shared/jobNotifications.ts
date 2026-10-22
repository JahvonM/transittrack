import { secrets } from './base44-compat.ts';
import { sendPushToTokens } from './fcm.ts';
import { pushWithPolicy } from './notificationPolicy.ts';
import { durableCreate, operationHash } from './durableOperation.ts';

export async function notifyJobProgress(base44,trip,event) {
 const labels={accepted:'Driver accepted the job',started:'Job started',pickup_arrived:'Bus arrived at pickup',pickup:'Pickup confirmed',arrived:'Bus arrived at drop-off',dropoff:'Drop-off confirmed — job completed',completed:'Job completed'};
 const title=labels[event];
 if(!title)return;
 const db=base44.asServiceRole.entities;
 try {
  let created=false;
  const text=title+' · '+(trip.vehicle_name||'Bus')+' · '+(trip.pickup_name||'Pickup')+' → '+(trip.dropoff_name||'Drop-off');
  await durableCreate('job-progress:'+trip.id+':'+event,await operationHash({trip_id:trip.id,event}),async()=>{
   created=true;
   return db.GroupMessage.create({company_id:trip.company_id,company_name:trip.company_name||'',vehicle_id:trip.vehicle_id,vehicle_name:trip.vehicle_name||'',channel:'dispatch',sender_role:'driver',sender_name:'Job updates',text,message_type:'text'});
  },id=>db.GroupMessage.get(id));
  if(!created)return;
  // Token role labels are not authorization. Re-read the current admin accounts.
  const admins=await db.User.filter({role:'admin'},'-updated_date',1000);
  const emails=admins.filter(u=>u.role==='admin'&&u.email).map(u=>u.email);
  const rows=emails.length?await db.PushToken.filter({email:{$in:emails}},'-updated_date',2000):[];
  const tokens=[...new Set(rows.filter(r=>emails.includes(r.email)).map(r=>r.token).filter(Boolean))];
  const payload={title,body:text,data:{type:'job_progress',trip_id:trip.id,event,link:'/admin/trips'}};
  await pushWithPolicy(base44,'job_progress',tokens,payload,list=>sendPushToTokens(secrets.get('FIREBASE_SERVICE_ACCOUNT'),list,payload,'/admin/trips'),{companyId:trip.company_id});
 } catch { /* A notification problem must not undo the recorded job step. */ }
}
