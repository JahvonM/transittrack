import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { riderMembershipLive } from '../_shared/routeRiders.ts';

const project=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]??null]));
const pick=(rows,fields)=>rows.map(row=>project(row,fields.split(' ')));
export default async function(req) {
 try {
  const client=createClientFromRequest(req), db=client.asServiceRole.entities;
  const session=await client.auth.me();
  if(!session)return Response.json({error:'Sign in required'},{status:401});
  const user=await db.User.get(session.id);
  if(!user || user.id!==session.id || user.role!=='admin')return Response.json({error:'Administrators only'},{status:403});
  const body=await req.json();
  if(typeof body.company_id!=='string' || !body.company_id || body.company_id.length>200)return Response.json({error:'Choose a company'},{status:400});
  const company=await db.Company.get(body.company_id);
  if(!company || company.id!==body.company_id)return Response.json({error:'Company not found'},{status:404});
  const query={company_id:company.id}, limit=1000, rows={};
  // A bounded, company-filtered read when opened/refreshed; no polling.
  for(const name of ['Vehicle','Route','Driver','Workplace','Contact','KioskDevice','CompanyMembership'])
   rows[name]=(await db[name].filter(query,'-updated_date',limit)).filter(row=>row.company_id===company.id);
  const memberships=[],codes=new Map();
  for(const row of rows.CompanyMembership) {
   if(!row.active || !row.user_id || !['manager','passenger'].includes(row.scope))continue;
   if(row.scope==='manager' && row.expires_at && !(Date.parse(row.expires_at)>Date.now()))continue;
   if(await riderMembershipLive(db,row,codes))memberships.push(row);
  }
  const ids=[...new Set(memberships.map(row=>row.user_id))], users=[];
  for(let at=0;at<ids.length;at+=100) users.push(...await db.User.filter({id:{$in:ids.slice(at,at+100)}},'-updated_date',100));
  const people=memberships.flatMap(m=>{
   const u=users.find(u=>u.id===m.user_id);
   return u?[{id:m.id,user_id:u.id,name:u.display_name||u.full_name||u.email||'Member',email:u.email||'',phone:u.phone||'',scope:m.scope,vehicle_id:m.vehicle_id||''}]:[];
  });
  return Response.json({
   vehicles:pick(rows.Vehicle,'id name plate_number capacity status route_id driver_name driver_email in_service'),
   routes:pick(rows.Route,'id name active'),
   drivers:pick(rows.Driver,'id full_name email phone'),
   workplaces:pick(rows.Workplace,'id name lat lng'),
   contacts:pick(rows.Contact,'id name email phone type vehicle_id pickup_name'),
   devices:pick(rows.KioskDevice,'id label kiosk_type vehicle_id status last_seen'),
   people,limited:Object.values(rows).some(list=>list.length===limit)
  });
 } catch(error) {
  const status=Number(error?.status??error?.response?.status)||500;
  return Response.json({error:status===401?'Sign in required':'Could not load this company. Try again.'},{status:status===401?401:500});
 }
}
