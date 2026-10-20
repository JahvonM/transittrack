import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { streamingConfig, supportIce, validateSupportSdp, supportNotice, publicSupport, supportBinding, supportFailureCode } from '../../shared/tabletStreaming.ts';
import { strictControlDevice } from '../../shared/tabletControl.ts';
import { authorizeSupportAdmin, supportRequest } from '../../shared/tabletSupportPolicy.ts';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const terminal=s=>s.ended_at || ['ended','denied','failed','expired'].includes(s.state);
export default async function(req) {
  // After the switch, calls from the installed tablet app go on to Supabase.
  const forwarded = await forwardToSupabase(req, 'tabletSupport');
  if (forwarded) return forwarded;
 try {
  if(req.method!=='POST')return reply({error:'POST required'},405);
  if(Number(req.headers.get('Content-Length')||0)>75000)return reply({error:'Request too large'},413);
  const raw=await req.text();if(raw.length>75000)return reply({error:'Request too large'},413);
  let b;try{b=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400)}
  if(!b || !['config','request','status','viewer','answer','end','prepare','publish','offer','answer_poll','started','pulse','stop'].includes(b.operation))return reply({error:'Invalid operation'},400);
  const client=createClientFromRequest(req),db=client.asServiceRole.entities;
  const native=['prepare','publish','offer','answer_poll','started','pulse','stop'].includes(b.operation);
  let admin=null;
  if(!native){admin=await client.auth.me().catch(()=>null);authorizeSupportAdmin(admin);}
  const config=streamingConfig();
  if(b.operation==='config')return reply({enabled:!!config,transport:'webrtc',relay_configured:!!config?.turn,stun_configured:!!config?.stun});
  const audit=async(s,event)=>db.AuditLog.create({actor_role:native?'device':'admin',actor_email:admin?.email||'',
   action:'update',entity:'KioskDevice',record_id:s.device_id,page:'/admin/kiosks',
   summary:'Remote support '+event+' · '+s.capability+' · session '+s.id});
  const finish=async(s,state,failure_code=null)=>{
   await db.TabletSupportSession.update(s.id,{state,ended_at:new Date().toISOString(),offer_sdp:'',answer_sdp:'',failure_code:state==='failed'?supportFailureCode(failure_code):null});
   await audit(s,state).catch(()=>{});
   return reply({ok:true,session:publicSupport({...s,state,failure_code})});
  };
  if(b.operation==='request') {
   if(!config)return reply({error:'Direct remote viewing is not enabled yet'},503);
   const d=await db.KioskDevice.get(b.device_id).catch(()=>null);
   const built=supportRequest(admin,d,b.capability);
   if(d.helper_health?.support_available!==true || d.helper_health?.support_transport!=='webrtc')return reply({error:'Install the direct-viewing kiosk update first'},409);
   if(supportNotice(d)) {
    const prior=await db.TabletSupportSession.get(d.support_request.id).catch(()=>null);
    if(prior && !terminal(prior))return reply({error:'A viewing session is already open'},409);
   }
   const s=await db.TabletSupportSession.create({...built,transport:'webrtc',requested_name:String(admin.full_name||'Administrator').slice(0,80),
    company_id:d.company_id,vehicle_id:d.vehicle_id||'',kiosk_type:d.kiosk_type});
   await db.KioskDevice.update(d.id,{support_request:{id:s.id,expires_at:s.expires_at}});
   await audit(s,'requested');
   return reply({session:publicSupport(s)});
  }
  const s=typeof b.session_id==='string' ? await db.TabletSupportSession.get(b.session_id).catch(()=>null):null;
  if(!s)return reply({error:'Session unavailable'},404);
  const d=await db.KioskDevice.get(s.device_id).catch(()=>null);
  if(native) {
   if(b.device_id!==s.device_id || !await strictControlDevice(db,d,b.device_token))return reply({error:'Device authentication required'},401);
  } else if(b.operation!=='end' && s.requested_by!==admin.id)return reply({error:'Session belongs to another administrator'},403);
  if(b.operation==='end' || b.operation==='stop') {
   if(terminal(s))return reply({ok:true,session:publicSupport(s)});
   return finish(s,native && ['denied','failed'].includes(b.reason)?b.reason:'ended',native?b.failure_code:null);
  }
  if(terminal(s))return b.operation==='status'?reply({session:publicSupport(s)}):reply({error:'Session ended'},410);
  if(!(Date.parse(s.expires_at)>Date.now())){const ended=await finish(s,'expired');return b.operation==='status'?ended:reply({error:'Session expired'},410);}
  const requester=await db.User.get(s.requested_by).catch(()=>null);
  if(!config || s.transport!=='webrtc' || requester?.role!=='admin' || !d || d.status!=='active' || !d.paired || !supportBinding(s,d)) {
   await finish(s,'ended');return reply({error:'Viewing authorization changed'},403);
  }
  if(b.operation==='status')return reply({session:publicSupport(s),offer_ready:!!s.offer_sdp});
  if(b.operation==='prepare') {
   if(s.state!=='requested')return reply({error:'Request already handled'},409);
   await db.TabletSupportSession.update(s.id,{state:'waiting_permission'});await audit(s,'waiting_permission');
   return reply({id:s.id,capability:s.capability,admin_name:s.requested_name,ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now())});
  }
  if(b.operation==='pulse')return reply({ok:true,id:s.id,ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now())});
  if(b.operation==='publish') {
   if(s.state!=='waiting_permission')return reply({error:'Permission request is not active'},409);
   await audit(s,'publisher_authorized');
   return reply({id:s.id,capability:s.capability,...await supportIce(config,s,'tablet')});
  }
  if(b.operation==='offer') {
   if(!['waiting_permission','connecting'].includes(s.state))return reply({error:'Invalid state'},409);
   const sdp=validateSupportSdp(b.sdp,'offer');
   if(s.offer_sdp && s.offer_sdp!==sdp)return reply({error:'Offer already set'},409);
   if(!s.offer_sdp) {await audit(s,'offer');await db.TabletSupportSession.update(s.id,{offer_sdp:sdp,state:'connecting'});}
   return reply({ok:true});
  }
  if(b.operation==='viewer') {
   if(!s.offer_sdp || !['connecting','active'].includes(s.state))return reply({error:'Waiting for tablet approval'},409);
   await audit(s,'viewer_authorized');
   return reply({id:s.id,sdp:s.offer_sdp,...await supportIce(config,s,'admin')});
  }
  if(b.operation==='answer') {
   if(!s.offer_sdp || s.state!=='connecting')return reply({error:'Waiting for tablet offer'},409);
   const sdp=validateSupportSdp(b.sdp,'answer');
   if(s.answer_sdp && s.answer_sdp!==sdp)return reply({error:'Answer already set'},409);
   if(!s.answer_sdp){await audit(s,'answer');await db.TabletSupportSession.update(s.id,{answer_sdp:sdp});}
   return reply({ok:true});
  }
  if(b.operation==='answer_poll')return reply({id:s.id,sdp:s.answer_sdp||null});
  if(b.operation==='started') {
   if(!s.offer_sdp || !s.answer_sdp || !['connecting','active'].includes(s.state))return reply({error:'Invalid state'},409);
   if(s.state!=='active'){await audit(s,'active');await db.TabletSupportSession.update(s.id,{state:'active'});}
   return reply({ok:true});
  }
 } catch(e) {return reply({error:e.status && e.status<500?e.message:'Remote viewing unavailable'},e.status||503);}
}
