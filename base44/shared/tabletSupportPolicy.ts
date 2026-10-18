// Server-side policy. actor/device identities must come from authenticated
// server lookups, never from the request's role, company or capability fields.
export const SUPPORT_MAX_MS = 10 * 60 * 1000;
const terminal = new Set(['ended','denied','failed','expired']);
function supportFail(status: number, message: string): never {
 throw Object.assign(new Error(message), {status});
}
export function authorizeSupportAdmin(actor: any) {
 if(!actor?.id) supportFail(401,'Sign in required');
 if(actor.role !== 'admin') supportFail(403,'Administrators only');
}
export function supportRequest(actor: any, device: any, capability: string, now = Date.now()) {
 authorizeSupportAdmin(actor);
 if(!device?.id || device.status !== 'active' || !device.paired) supportFail(403,'An active paired tablet is required');
 if(!['screen','camera_front','camera_back'].includes(capability)) supportFail(400,'Unsupported viewing capability');
 // Native permission is still required; requesting a session never activates capture.
 return {device_id:device.id, requested_by:actor.id, capability, state:'requested',
  created_at:new Date(now).toISOString(), expires_at:new Date(now+SUPPORT_MAX_MS).toISOString(),
  ended_at:null};
}
export function supportTransition(session: any, identity: any, next: string, now=Date.now()) {
 const deviceSide=['waiting_permission','active','denied','failed'].includes(next);
 if(deviceSide) {
  if(!identity?.device_id || identity.device_id!==session.device_id) supportFail(403,'Wrong tablet');
 } else {authorizeSupportAdmin(identity);}
 if(!['waiting_permission','active','denied','failed','ended'].includes(next))supportFail(400,'Unsupported state');
 if(terminal.has(session.state))supportFail(409,'Session has already ended');
 if(!(Date.parse(session.expires_at)>now))return {...session,state:'expired',ended_at:new Date(now).toISOString()};
 const allowed:Record<string,string[]>={requested:['waiting_permission','denied','failed','ended'],waiting_permission:['active','denied','failed','ended'],active:['failed','ended']};
 if(!allowed[session.state]?.includes(next))supportFail(409,'Invalid session transition');
 return {...session,state:next,ended_at:terminal.has(next)?new Date(now).toISOString():null};
}
export function canSupportSignal(session: any, identity: any, now=Date.now()) {
 if(terminal.has(session.state)||!(Date.parse(session.expires_at)>now))return false;
 if(identity?.device_id)return identity.device_id===session.device_id;
 return identity?.role==='admin' && identity?.id===session.requested_by;
}
