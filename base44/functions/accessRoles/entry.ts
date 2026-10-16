import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ROLE_SECTIONS, roleSections, assignedAccessRole, safeRoleRecord } from '../../shared/accessRoles.ts';

export default async function(req) {
 try {
  const base44=createClientFromRequest(req), db=base44.asServiceRole.entities;
  const session=await base44.auth.me();
  if(!session)return Response.json({error:'Sign in required'},{status:401});
  const user=await db.User.get(session.id);
  if(!user || user.id!==session.id)return Response.json({error:'Sign in required'},{status:401});
  const body=await req.json().catch(()=>({})), action=body.action;
  if(action==='workspace') {
   const role=await assignedAccessRole(db,user);
   if(!role || !role.sections.includes(body.section))return Response.json({error:'This screen is not included in your role'},{status:403});
   const spec=ROLE_SECTIONS[body.section];
   if(!spec)return Response.json({error:'Screen unavailable'},{status:403});
   const skip=Number(body.skip || 0);
   if(!Number.isInteger(skip) || skip<0 || skip>100000)return Response.json({error:'Invalid page'},{status:400});
   const rows=await db[spec.entity].filter({},'-created_date',100,skip);
   return Response.json({role,section:body.section,fields:spec.fields,rows:rows.map(row=>safeRoleRecord(row,spec)),more:rows.length===100});
  }
  if(user.role!=='admin')return Response.json({error:'Administrators only'},{status:403});
  if(action==='list') {
   const roles=await db.AccessRole.list('-created_date',1000);
   const assignments=await db.RoleAssignment.list('-updated_date',5000);
   return Response.json({roles,assignments,catalog:ROLE_SECTIONS});
  }
  if(action==='save') {
   const name=typeof body.name==='string'?body.name.trim().slice(0,80):'';
   if(!name)return Response.json({error:'Role name is required'},{status:400});
   const sections=roleSections(body.sections);
   const data={name,sections,active:body.active!==false};
   if(body.role_id) {
    const existing=await db.AccessRole.get(body.role_id);
    if(!existing)return Response.json({error:'Role not found'},{status:404});
   }
   const role=body.role_id?await db.AccessRole.update(body.role_id,data):await db.AccessRole.create(data);
   return Response.json({role});
  }
  if(action==='assign') {
   if(typeof body.user_id!=='string')return Response.json({error:'Select a user'},{status:400});
   const target=await db.User.get(body.user_id);
   if(!target)return Response.json({error:'User not found'},{status:404});
   if(target.role==='admin')return Response.json({error:'Full administrators keep full access. Choose a non-admin account.'},{status:403});
   const roleId=typeof body.role_id==='string'?body.role_id:'';
   if(roleId) {
    const role=await db.AccessRole.get(roleId);
    if(!role || role.active===false)return Response.json({error:'Choose an active role'},{status:400});
   }
   const [old]=await db.RoleAssignment.filter({user_id:target.id},'-updated_date',1);
   const data={user_id:target.id,role_id:roleId,assigned_by:user.id};
   if(old)await db.RoleAssignment.update(old.id,data);else await db.RoleAssignment.create(data);
   // A custom view role replaces elevated company/mechanic/driver access.
   // Clearing it leaves a regular staff account; admin can set a standard role.
   await db.User.update(target.id,{access_role_id:roleId,...(roleId?{role:'staff'}:{})});
   return Response.json({ok:true});
  }
  return Response.json({error:'Unknown action'},{status:400});
 } catch(error) {
  const status=Number(error?.status ?? error?.response?.status)||500;
  return Response.json({error:status<500?error.message:'Role request failed'},{status:status>=400&&status<=599?status:500});
 }
}
