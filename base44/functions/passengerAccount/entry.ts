import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { reserveAttempt } from '../../shared/atomicOps.ts';
// Own card status and boarding history only. NFC identifiers never leave the server.
async function approvedCompany(db, user) {
 const rows = await db.CompanyMembership.filter({user_id:user.id,active:true,scope:'passenger'},'-updated_date',100);
 const ids = new Set();
 for (const row of rows) {
  if (!row.code_hash && !row.expires_at) {ids.add(row.company_id);continue;}
  if (!row.code_hash) continue;
  const company = await db.Company.get(row.company_id);
  if (!company) continue;
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code || ''));
  const hash = Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash===row.code_hash) ids.add(row.company_id);
 }
 return ids.size===1 ? [...ids][0] : null;
}
export default async function(req) {
 try {
  const client=createClientFromRequest(req), session=await client.auth.me();
  if(!session) return Response.json({error:'Sign in required'},{status:401});
  const db=client.asServiceRole.entities, user=await db.User.get(session.id);
  if(!user || !['staff','passenger'].includes(user.role)) return Response.json({error:'Passenger access required'},{status:403});
  const companyId=await approvedCompany(db,user);
  if(!companyId) return Response.json({error:'Verified company access required'},{status:403});
  const body=await req.json(), action=body.action || 'summary';
  if(!['summary','report_lost_card','report_missed_pickup'].includes(action)) return Response.json({error:'Unknown action'},{status:400});
  if(action!=='summary' && !(await reserveAttempt(client,'passenger-report:'+action+':'+user.id,3,60_000))) return Response.json({error:'Please wait before sending another report.'},{status:429,headers:{'Retry-After':'60'}});
  const contacts=(await db.Contact.filter({company_id:companyId,email:user.email},'-updated_date',100)).filter(c=>c.company_id===companyId && c.email?.toLowerCase()===user.email?.toLowerCase());
  const cards=await db.NfcCard.filter({company_id:companyId,holder_source:'user',holder_id:user.id},'-issue_date',100);
  for(const contact of contacts) cards.push(...await db.NfcCard.filter({company_id:companyId,holder_source:'contact',holder_id:contact.id},'-issue_date',100));
  const owned=cards.filter(c=>c.company_id===companyId && (c.holder_source==='user' && c.holder_id===user.id || c.holder_source==='contact' && contacts.some(x=>x.id===c.holder_id)));
  const active=owned.filter(c=>c.is_active && !c.revoked_at && (!c.expiry_date || c.expiry_date>=new Date().toISOString().slice(0,10)));
  if(action==='report_lost_card') {
   if(!active.length) return Response.json({ok:true,already_inactive:true});
   for(const card of active) await db.NfcCard.update(card.id,{is_active:false,revoked_at:new Date().toISOString(),revoked_by:user.email,revoke_reason:'Card reported lost by its holder'});
   await db.LostItemReport.create({company_id:companyId,reporter_id:user.id,reporter_name:user.full_name || user.email,reporter_email:user.email,contact:user.phone || user.email,description:'NFC boarding card reported lost. Card disabled; please issue a replacement.',status:'open'});
   return Response.json({ok:true});
  }
  if(action==='report_missed_pickup') {
   const memberships=await db.CompanyMembership.filter({user_id:user.id,company_id:companyId,active:true,scope:'passenger'},'-updated_date',100);
   const vehicleId=contacts.find(c=>c.vehicle_id)?.vehicle_id || memberships.find(m=>m.vehicle_id)?.vehicle_id;
   const vehicle=vehicleId ? await db.Vehicle.get(vehicleId) : null;
   if(!vehicle || vehicle.company_id!==companyId) return Response.json({error:'Ask your company to assign a bus first'},{status:403});
   const message=await db.GroupMessage.create({company_id:companyId,vehicle_id:vehicle.id,vehicle_name:vehicle.name,channel:'staff',sender_id:user.id,sender_email:user.email,sender_name:user.full_name || user.email,sender_role:user.role,text:'I missed my pickup. Please contact me about this journey.'});
   return Response.json({ok:true,message_id:message.id});
  }
  // Match stable IDs and all this person's card identifiers; never match by name.
  const tags=[...new Set([user.id,...owned.map(c=>c.card_uid),...contacts.flatMap(c=>[c.id,c.nfc_card_tag])].filter(Boolean))];
  const rows=await db.StaffCheckIn.filter({company_id:companyId,card_tag:{$in:tags}},'-boarded_at',10);
  return Response.json({
   card:{issued:owned.length>0,active:active.length>0,status:active.length?'Active':owned.length?'Inactive':'Not issued'},
   history:rows.filter(r=>r.company_id===companyId && tags.includes(r.card_tag)).map(r=>({id:r.id,status:r.status,boarded_at:r.boarded_at || r.created_date,vehicle_name:r.vehicle_name || 'Bus',method:r.check_in_method})),
  });
 } catch(error) {
  const status=error?.status ?? error?.response?.status ?? 500;
  return Response.json({error:status===429?'Server is busy. Try again shortly.':'Could not load your card details.'},{status, ...(status===429?{headers:{'Retry-After':'15'}}:{})});
 }
}
