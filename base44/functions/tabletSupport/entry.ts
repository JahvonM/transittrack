import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { AccessToken, RoomServiceClient, TrackSource } from 'npm:livekit-server-sdk@2.19.1';
import { streamingConfig, supportNotice, publicSupport, supportBinding } from '../../shared/tabletStreaming.ts';
import { strictControlDevice } from '../../shared/tabletControl.ts';
import { authorizeSupportAdmin, supportRequest } from '../../shared/tabletSupportPolicy.ts';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const terminal=s=>['ended','denied','failed','expired'].includes(s);
export default async function(req) {
 try {
  if(req.method!=='POST')return reply({error:'POST required'},405);
  const b=await req.json().catch(()=>null);
  if(!b || !['config','request','status','viewer','end','prepare','publish','started','pulse','stop'].includes(b.operation))return reply({error:'Invalid operation'},400);
  const client=createClientFromRequest(req),db=client.asServiceRole.entities;
  const native=['prepare','publish','started','pulse','stop'].includes(b.operation);
  let admin=null;
  if(!native){admin=await client.auth.me().catch(()=>null);authorizeSupportAdmin(admin);}
  const config=streamingConfig();
  if(b.operation==='config')return reply({enabled:!!config});
  if(!config)return reply({error:'Remote viewing is not configured yet'},503);
  const rooms=new RoomServiceClient(config.http,config.key,config.secret,{requestTimeout:8});
  const audit=async(s,event)=>db.AuditLog.create({actor_role:native?'device':'admin',actor_email:admin?.email||'',
   action:'update',entity:'KioskDevice',record_id:s.device_id,page:'/admin/kiosks',
   summary:'Remote support '+event+' · '+s.capability+' · session '+s.id});
  const finish=async(s,state)=>{
   // Persist termination before room cleanup. Native pulse and fixed local deadline also stop capture.
   await db.TabletSupportSession.update(s.id,{state,ended_at:new Date().toISOString()});
   await audit(s,state).catch(()=>{});
   await rooms.deleteRoom(s.room_name).catch(()=>{});
   return reply({ok:true,session:publicSupport({...s,state})});
  };
  if(b.operation==='request') {
   const d=await db.KioskDevice.get(b.device_id).catch(()=>null);
   const built=supportRequest(admin,d,b.capability);
   if(d.helper_health?.support_available!==true)return reply({error:'Install the combined kiosk viewing update first'},409);
   if(supportNotice(d)) {
    const prior=await db.TabletSupportSession.get(d.support_request.id).catch(()=>null);
    if(prior && !(prior.ended_at || terminal(prior.state))) return reply({error:'A viewing session is already open'},409);
   }
   const s=await db.TabletSupportSession.create({...built,requested_name:String(admin.full_name||'Administrator').slice(0,80),
    company_id:d.company_id,vehicle_id:d.vehicle_id||'',kiosk_type:d.kiosk_type,room_name:'tt-support-'+crypto.randomUUID()});
   await db.KioskDevice.update(d.id,{support_request:{id:s.id,expires_at:s.expires_at}});
   await audit(s,'requested');
   return reply({session:publicSupport(s)});
  }
  const s=typeof b.session_id==='string' ? await db.TabletSupportSession.get(b.session_id).catch(()=>null):null;
  if(!s)return reply({error:'Session unavailable'},404);
  const d=await db.KioskDevice.get(s.device_id).catch(()=>null);
  if(native) {
   if(b.device_id!==s.device_id || !await strictControlDevice(db,d,b.device_token))return reply({error:'Device authentication required'},401);
  } else if(b.operation!=='end' && s.requested_by!==admin.id) return reply({error:'Session belongs to another administrator'},403);
  if(b.operation==='end' || b.operation==='stop') {
   if((s.ended_at || terminal(s.state))) return reply({ok:true,session:publicSupport(s)});
   return finish(s,native && ['denied','failed'].includes(b.reason)?b.reason:'ended');
  }
  if((s.ended_at || terminal(s.state)))return b.operation==='status'?reply({session:publicSupport(s)}):reply({error:'Session ended'},410);
  if(!(Date.parse(s.expires_at)>Date.now())){const ended=await finish(s,'expired');return b.operation==='status'?ended:reply({error:'Session expired'},410);}
  const requester=await db.User.get(s.requested_by).catch(()=>null);
  if(requester?.role!=='admin' || !d || d.status!=='active' || !d.paired || !supportBinding(s,d)) {
   await finish(s,'ended');return reply({error:'Viewing authorization changed'},403);
  }
  if(b.operation==='status')return reply({session:publicSupport(s)});
  if(b.operation==='prepare') {
   if(s.state!=='requested')return reply({error:'Request already handled'},409);
   await db.TabletSupportSession.update(s.id,{state:'waiting_permission'});await audit(s,'waiting_permission');
   return reply({id:s.id,capability:s.capability,admin_name:s.requested_name,ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now())});
  }
  if(b.operation==='pulse')return reply({ok:true,id:s.id,ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now())});
  if(b.operation==='started') {
   if(s.state!=='waiting_permission' && s.state!=='active')return reply({error:'Invalid state'},409);
   if(s.state!=='active'){await db.TabletSupportSession.update(s.id,{state:'active'});await audit(s,'active');}
   return reply({ok:true});
  }
  if(b.operation==='publish' && s.state!=='waiting_permission')return reply({error:'Permission request is not active'},409);
  if(b.operation==='viewer' && s.state!=='active')return reply({error:'Waiting for tablet approval'},409);
  if(b.operation==='publish')await rooms.createRoom({name:s.room_name,emptyTimeout:120,departureTimeout:15,maxParticipants:2});
  await audit(s,native?'publisher_authorized':'viewer_authorized');
  const jwt=new AccessToken(config.key,config.secret,{identity:native?'tablet:'+s.device_id:'admin:'+admin.id,ttl:30});
  jwt.addGrant({roomJoin:true,room:s.room_name,canPublish:native,canSubscribe:!native,canPublishData:false,
   ...(native?{canPublishSources:[s.capability==='screen'?TrackSource.SCREEN_SHARE:TrackSource.CAMERA]}:{})});
  return reply({id:s.id,capability:s.capability,url:config.url,token:await jwt.toJwt(),
   ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now()),publisher:'tablet:'+s.device_id});
 } catch(e) {return reply({error:e.status && e.status<500?e.message:'Remote viewing unavailable'},e.status||503);}
}
