import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
const PAIR_TTL_MS=15*60_000,JOIN_TTL_MS=30*86400_000;
function fail(status,message){throw Object.assign(new Error(message),{status});}
function randomAccessCode() {
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';
 while(code.length<12){const byte=crypto.getRandomValues(new Uint8Array(1))[0];if(byte<Math.floor(256/alphabet.length)*alphabet.length)code+=alphabet[byte%alphabet.length];}
 return code;
}
async function uniqueAccessCode(db,entity,field) {
 // Sequential collision detection only. Concurrent uniqueness needs atomic storage.
 for(let i=0;i<50;i++) {const code=randomAccessCode();if(!(await db[entity].filter({[field]:code},'-created_date',1)).length)return code;}
 fail(503,'Could not allocate a unique code');
}
async function liveMembership(db,row) {
 if(!row.expires_at&&!row.code_hash)return true;
 if(!(Date.parse(row.expires_at)>Date.now())||!row.code_hash)return false;
 const company=await db.Company.get(row.company_id).catch(()=>null);if(!company)return false;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code||''));
 return row.code_hash===Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function authorizeCompany(db,user,id) {
 const company=await db.Company.get(id);if(!company)fail(404,'Company not found');
 if(user.role!=='admin') {
  const memberships=await db.CompanyMembership.filter({user_id:user.id,company_id:id,scope:'manager',active:true},'-updated_date',100);
  let allowed=false;for(const row of memberships)if(await liveMembership(db,row)){allowed=true;break;}
  if(!allowed)fail(403,'Approved manager membership required');
 }
 return company;
}
export default async function(req) {
 try {
  const base44=createClientFromRequest(req),db=base44.asServiceRole.entities;
  const session=await base44.auth.me().catch(()=>null);if(!session)fail(401,'Sign in required');
  const user=await db.User.get(session.id);if(!user||user.id!==session.id||!['admin','company'].includes(user.role))fail(403,'Administrators or approved company managers only');
  const body=await req.json();
  if(body.action==='issue_company') {
   if(typeof body.company_id!=='string'||!body.company_id)fail(400,'Company required');
   const company=await authorizeCompany(db,user,body.company_id);
   const code=await uniqueAccessCode(db,'Company','access_code'),expires_at=new Date(Date.now()+JOIN_TTL_MS).toISOString();
   await db.Company.update(company.id,{access_code:code,access_code_expires_at:expires_at});
   return Response.json({code,expires_at});
  }
  if(!['issue_pairing','revoke_device','reactivate_device'].includes(body.action))fail(400,'Unsupported action');
  if(typeof body.device_id!=='string'||!body.device_id)fail(400,'Device required');
  const device=await db.KioskDevice.get(body.device_id);if(!device)fail(404,'Device not found');
  await authorizeCompany(db,user,device.company_id);
  if(body.action==='revoke_device') {
   await db.KioskDevice.update(device.id,{status:'revoked',paired:false,pairing_code:'',pairing_expires_at:null});
   return Response.json({ok:true});
  }
  if(body.action==='issue_pairing'&&device.status!=='active')fail(409,'Reactivate this device first');
  if(device.paired&&body.replace_existing!==true)fail(409,'Explicit confirmation is required to replace a paired device');
  if(['driver','bus_boarding'].includes(device.kiosk_type)&&!device.vehicle_id)fail(400,'Vehicle assignment required');
  if(device.vehicle_id) {
   const vehicle=await db.Vehicle.get(device.vehicle_id);if(!vehicle||vehicle.company_id!==device.company_id)fail(403,'Vehicle assignment mismatch');
  }
  const code=await uniqueAccessCode(db,'KioskDevice','pairing_code'),expires_at=new Date(Date.now()+PAIR_TTL_MS).toISOString();
  await db.KioskDevice.update(device.id,{status:'active',paired:false,pairing_code:code,pairing_expires_at:expires_at});
  return Response.json({code,expires_at});
 }catch(error){return Response.json({error:error.status?error.message:'Could not manage access code'},{status:error.status||500});}
}
