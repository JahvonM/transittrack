// Separate from live camera support: only an authenticated data channel, no media capture.
export const RECORDINGS_TTL=600000;
function fail(status:number,message:string):never{throw Object.assign(new Error(message),{status});}
export function recordingsAdmin(actor:any){
 if(!actor?.id)fail(401,'Sign in required');
 if(actor.role!=='admin')fail(403,'Administrators only');
}
export function recordingsRequest(actor:any,d:any,now=Date.now()){
 recordingsAdmin(actor);
 if(!d?.id || d.status!=='active' || d.paired!==true)fail(403,'An active paired tablet is required');
 if(d.helper_health?.recordings_available!==true)fail(409,'Install the recordings kiosk update and wait for a fresh tablet check-in');
 return {device_id:d.id,requested_by:actor.id,requested_name:String(actor.full_name||'Administrator').slice(0,80),
  company_id:d.company_id,vehicle_id:d.vehicle_id||'',kiosk_type:d.kiosk_type,state:'requested',
  expires_at:new Date(now+RECORDINGS_TTL).toISOString(),created_at:new Date(now).toISOString()};
}
export function recordingsBinding(s:any,d:any){
 return !!d && d.status==='active' && d.paired===true && s.device_id===d.id && s.company_id===d.company_id &&
 s.vehicle_id===(d.vehicle_id||'') && s.kiosk_type===d.kiosk_type && d.recordings_request?.id===s.id;
}
export function recordingsTerminal(s:any){return !!s.ended_at || ['ended','failed','expired'].includes(s.state);}
export function recordingsNotice(d:any,now=Date.now()){
 const n=d?.recordings_request;
 return n && /^[A-Za-z0-9_-]{6,128}$/.test(n.id||'') && Date.parse(n.expires_at)>now?{id:n.id}:null;
}
export function publicRecordings(s:any){return {id:s.id,device_id:s.device_id,state:s.state,expires_at:s.expires_at};}
export function validateRecordingsSdp(value:any){
 if(typeof value!=='string' || value.length<40 || value.length>65536 || value.includes('\0'))fail(400,'Expected a recording data channel');
 const lines=value.split(/\r?\n/),media=lines.filter(l=>l.startsWith('m='));
 if(!lines.includes('v=0') || media.length!==1 || !/^m=application [1-9][0-9]* UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0]) ||
 !lines.some(l=>/^a=sctp-port:[1-9][0-9]*$/.test(l)) ||
 !lines.some(l=>/^a=fingerprint:sha-256 ([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(l)))fail(400,'Expected a recording data channel');
 return value;
}
