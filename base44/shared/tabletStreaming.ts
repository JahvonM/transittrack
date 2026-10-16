import { secrets } from 'base44:runtime';
export function streamingConfig() {
 if(secrets.get('TT_SUPPORT_ENABLED')!=='true') return null;
 try {
  const url=secrets.get('TT_LIVEKIT_URL')?.trim(),key=secrets.get('TT_LIVEKIT_API_KEY')?.trim(),secret=secrets.get('TT_LIVEKIT_API_SECRET')?.trim();
  const u=new URL(url||'');
  if(u.protocol!=='wss:' || !/^[a-z0-9-]+\.livekit\.cloud$/.test(u.hostname) || u.port || u.username || u.password ||
   u.search || u.hash || u.pathname!=='/' || !key || !secret || secret.length<20) return null;
  return {url:u.origin.replace('https:','wss:'),http:'https://'+u.hostname,key,secret};
 } catch { return null; }
}
export function supportNotice(device:any,now=Date.now()) {
 const n=device?.support_request;
 return n && typeof n.id==='string' && /^[A-Za-z0-9_-]{6,128}$/.test(n.id) &&
 Date.parse(n.expires_at)>now ? {id:n.id} : null;
}
export function publicSupport(s:any) {
 return {id:s.id,device_id:s.device_id,capability:s.capability,state:s.ended_at ? (['denied','failed','expired'].includes(s.state)?s.state:'ended') : s.state,expires_at:s.expires_at,requested_name:s.requested_name};
}
export function supportBinding(s:any,d:any) {
 return s.device_id===d.id && s.company_id===d.company_id && s.vehicle_id===(d.vehicle_id||'') &&
 s.kiosk_type===d.kiosk_type && d.support_request?.id===s.id;
}
