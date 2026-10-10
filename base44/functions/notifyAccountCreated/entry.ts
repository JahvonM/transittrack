import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { emailWithPolicy } from '../../shared/notificationPolicy.ts';

// Existing accounts do not generate a backlog of signup alerts on rollout.
const ENABLED_FROM = Date.parse('2026-10-10T03:19:31Z');
const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 160);

// Called after account verification / first authenticated sign-in. Identity,
// account creation time and recipients are all determined on the server.
// Never accept a user ID, name, email address or recipient from the request.
export default async function(req) {
 try {
  const base44 = createClientFromRequest(req);
  const session = await base44.auth.me().catch(error => {
   if ([401,403].includes(error?.status ?? error?.response?.status)) return null;
   throw error;
  });
  if (!session) return Response.json({error:'Sign in required'},{status:401});
  const db = base44.asServiceRole.entities;
  const user = await db.User.get(session.id);
  const created = Date.parse(user?.created_date || '');
  if (!user || !Number.isFinite(created) || created < ENABLED_FROM) return Response.json({ok:true});
  // Durable per-account budget prevents two phone/browser workers delivering
  // the same notice concurrently. A failed delivery can retry after a minute.
  let row = (await db.SignupAlert.filter({user_id:user.id},'-created_date',1))[0];
  if (row?.completed) return Response.json({ok:true});
  if (!(await reserveAttempt(base44,'signup-alert:'+user.id,1,60_000))) return Response.json({ok:true,retry_after_ms:60_000});
  row = (await db.SignupAlert.filter({user_id:user.id},'-created_date',1))[0];
  if (row?.completed) return Response.json({ok:true});
  if (!row) row = await db.SignupAlert.create({user_id:user.id,completed:false,delivered_emails:[]});
  const delivered = new Set(row.delivered_emails || []);
  const admins = (await db.User.filter({role:'admin'},'-created_date',1000))
   .filter(admin => admin.email && !delivered.has(admin.email.trim().toLowerCase()));
  if (!admins.length) return Response.json({ok:true,retry_after_ms:60_000});
  const subject = 'TransitTrack: new account created';
  const body = `A new TransitTrack account has completed sign-in.\n\nName: ${clean(user.display_name || user.full_name) || 'Not provided'}\nEmail: ${clean(user.email) || 'Not provided'}\nCreated: ${new Date(created).toISOString()}\n\nOpen Admin → Passenger directory or Users to review the account.\n\n— TransitTrack`;
  const result = await emailWithPolicy(base44,'account_created',admins,
   admin => base44.asServiceRole.integrations.Core.SendEmail({to:admin.email,subject,body}),{title:subject});
  for (const recipient of result.results) if (recipient.ok || recipient.skipped) delivered.add(recipient.to.trim().toLowerCase());
  await db.SignupAlert.update(row.id,{delivered_emails:[...delivered],completed:result.failed===0,notified_at:new Date().toISOString()});
  return Response.json(result.failed ? {ok:true,retry_after_ms:60_000} : {ok:true});
 } catch {
  // Failure to notify the administrator never undoes account creation or login.
  return Response.json({error:'Could not send signup alert'},{status:503});
 }
}
