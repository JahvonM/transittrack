import {createClientFromRequest} from 'npm:@base44/sdk@0.8.44';
import {strictControlDevice} from '../../shared/tabletControl.ts';
import {streamingConfig,supportIce} from '../../shared/tabletStreaming.ts';
import {recordingsAdmin,recordingsRequest,recordingsBinding,recordingsNotice,recordingsTerminal,publicRecordings,validateRecordingsSdp} from '../../shared/tabletRecordings.ts';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default async function(req){
 try{
  if(req.method!=='POST')return reply({error:'POST required'},405);
  if(Number(req.headers.get('Content-Length')||0)>75000)return reply({error:'Request too large'},413);
  const raw=await req.text();if(raw.length>75000)return reply({error:'Request too large'},413);
  let b;try{b=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400);}
  if(!b || !['request','status','viewer','answer','end','prepare','offer','answer_poll','pulse','stop'].includes(b.operation))return reply({error:'Invalid operation'},400);
  const client=createClientFromRequest(req),db=client.asServiceRole.entities;
  const native=['prepare','offer','answer_poll','pulse','stop'].includes(b.operation);
  let admin=null;if(!native){admin=await client.auth.me().catch(()=>null);recordingsAdmin(admin);}
  const config=streamingConfig();
  const audit=async(s,event)=>db.AuditLog.create({actor_role:native?'device':'admin',actor_email:admin?.email||'',action:'update',entity:'KioskDevice',record_id:s.device_id,page:'/admin/kiosks',summary:'Saved recording access '+event+' · session '+s.id});
  const finish=async(s,state)=>{await db.TabletRecordingSession.update(s.id,{state,ended_at:new Date().toISOString(),offer_sdp:'',answer_sdp:''});await audit(s,state).catch(()=>{});return reply({session:publicRecordings({...s,state})});};
  if(b.operation==='request'){
   if(!config)return reply({error:'Relay viewing is not enabled'},503);
   const d=await db.KioskDevice.get(b.device_id).catch(()=>null),built=recordingsRequest(admin,d);
   if(recordingsNotice(d)){
    const prior=await db.TabletRecordingSession.get(d.recordings_request.id).catch(()=>null);
    if(prior && !recordingsTerminal(prior))return reply({error:'A recordings session is already open. Close it before reconnecting.'},409);
   }
   const s=await db.TabletRecordingSession.create(built);
   await db.KioskDevice.update(d.id,{recordings_request:{id:s.id,expires_at:s.expires_at}});
   await audit(s,'requested');return reply({session:publicRecordings(s)});
  }
  const s=typeof b.session_id==='string'?await db.TabletRecordingSession.get(b.session_id).catch(()=>null):null;
  if(!s)return reply({error:'Session unavailable'},404);
  const d=await db.KioskDevice.get(s.device_id).catch(()=>null);
  if(native){if(b.device_id!==s.device_id || !await strictControlDevice(db,d,b.device_token))return reply({error:'Device authentication required'},401);}
  else if(s.requested_by!==admin.id)return reply({error:'Session belongs to another administrator'},403);
  if(b.operation==='end' || b.operation==='stop')return recordingsTerminal(s)?reply({session:publicRecordings(s)}):finish(s,b.reason==='failed'?'failed':'ended');
  if(recordingsTerminal(s))return b.operation==='status'?reply({session:publicRecordings(s)}):reply({error:'Session ended'},410);
  if(!(Date.parse(s.expires_at)>Date.now())){await finish(s,'expired');return reply({error:'Session expired'},410);}
  const requester=await db.User.get(s.requested_by).catch(()=>null);
  if(!config || requester?.role!=='admin' || !recordingsBinding(s,d)){await finish(s,'ended');return reply({error:'Recording authorization changed'},403);}
  if(b.operation==='status')return reply({session:publicRecordings(s),offer_ready:!!s.offer_sdp});
  if(b.operation==='prepare'){
   if(s.state!=='requested')return reply({error:'Request already handled'},409);
   await audit(s,'tablet_authorized');
   await db.TabletRecordingSession.update(s.id,{state:'connecting'});
   return reply({id:s.id,...await supportIce(config,s,'recordings-tablet')});
  }
  if(b.operation==='pulse')return reply({ok:true,id:s.id,ttl_ms:Math.max(0,Date.parse(s.expires_at)-Date.now())});
  if(b.operation==='offer'){
   if(s.state!=='connecting' || s.offer_sdp)return reply({error:'Offer already handled'},409);
   await db.TabletRecordingSession.update(s.id,{offer_sdp:validateRecordingsSdp(b.sdp)});return reply({ok:true});
  }
  if(b.operation==='viewer'){
   if(!s.offer_sdp)return reply({error:'Waiting for tablet'},409);
   await audit(s,'viewer_authorized');return reply({id:s.id,sdp:s.offer_sdp,...await supportIce(config,s,'recordings-admin')});
  }
  if(b.operation==='answer'){
   if(!s.offer_sdp || s.answer_sdp)return reply({error:'Answer already handled'},409);
   await db.TabletRecordingSession.update(s.id,{answer_sdp:validateRecordingsSdp(b.sdp),state:'active'});return reply({ok:true});
  }
  if(b.operation==='answer_poll')return reply({id:s.id,sdp:s.answer_sdp||null});
 }catch(e){return reply({error:e.status && e.status<500?e.message:'Recordings unavailable'},e.status||503);}
}
