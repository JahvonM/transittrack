import { secrets } from 'base44:runtime';
function iceUrl(value:any,kind:string) {
 if(typeof value!=='string' || value.length>256)return null;
 // Explicit operator-owned endpoint only. No embedded password, path, arbitrary query or URL fetched by the backend.
 const match=value.match(/^(stun|turn|turns):([a-zA-Z0-9.-]+):([0-9]{1,5})(\?transport=(udp|tcp))?$/);
 if(!match || (kind==='stun'?match[1]!=='stun':!['turn','turns'].includes(match[1])) ||
  Number(match[3])<1 || Number(match[3])>65535 || !/^[a-zA-Z0-9]/.test(match[2]))return null;
 return value;
}
export function streamingConfig() {
 if(secrets.get('TT_SUPPORT_ENABLED')!=='true' || secrets.get('TT_SUPPORT_TRANSPORT')!=='webrtc') return null;
 const stun=secrets.get('TT_SUPPORT_STUN_URL')?.trim(),turn=secrets.get('TT_SUPPORT_TURN_URL')?.trim(),secret=secrets.get('TT_SUPPORT_TURN_SECRET');
 if(stun && !iceUrl(stun,'stun'))return null;
 if((turn || secret) && (!iceUrl(turn,'turn') || typeof secret!=='string' || secret.length<32))return null;
 return {stun:stun||null,turn:turn||null,secret:secret||null};
}
export async function supportIce(config:any, session:any, side:string, now=Date.now()) {
 const iceServers:any[]=[];
 if(config.stun)iceServers.push({urls:[config.stun]});
 if(config.turn) {
  const expires=Math.ceil((Date.parse(session.expires_at)+60_000)/1000);
  const username=expires+':'+session.id+':'+side;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username)));
  const credential=btoa(String.fromCharCode(...bytes));
  iceServers.push({urls:[config.turn],username,credential});
 }
 return {iceServers,relay_configured:!!config.turn,ttl_ms:Math.max(0,Date.parse(session.expires_at)-now)};
}
export function validateSupportSdp(value:any,type:string) {
 const fail=()=>{throw Object.assign(new Error('Expected a video-only '+type),{status:400});};
 if(typeof value!=='string' || value.length<40 || value.length>65536 || value.includes('\0'))fail();
 const lines=value.split(/\r?\n/);
 if(!lines.includes('v=0') || lines.filter(l=>l.startsWith('m=')).length!==1 ||
  !lines.some(l=>/^m=video \d+ UDP\/TLS\/RTP\/SAVPF /.test(l)) ||
  !lines.includes(type==='offer'?'a=sendonly':'a=recvonly') ||
  lines.some(l=>['a=sendrecv','a=inactive',type==='offer'?'a=recvonly':'a=sendonly'].includes(l)) ||
  !lines.some(l=>/^a=fingerprint:sha-256 ([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(l)))fail();
 return value;
}
export function supportNotice(device:any,now=Date.now()) {
 const n=device?.support_request;
 return n && typeof n.id==='string' && /^[A-Za-z0-9_-]{6,128}$/.test(n.id) &&
 Date.parse(n.expires_at)>now ? {id:n.id} : null;
}
// Accept fixed stages/status codes only; never persist exception text, SDP or credentials.
export function supportFailureCode(value:any) {
 return typeof value==='string' && /^(PREPARE|PUBLISH|PULSE|OFFER|ANSWER_POLL|STARTED|CAPTURE|ICE_GATHERING|PEER_CONNECT)_(ERROR|TIMEOUT|HTTP_[1-5][0-9]{2})$/.test(value) ? value : null;
}
export function publicSupport(s:any) {
 return {id:s.id,device_id:s.device_id,capability:s.capability,state:s.ended_at ? (['denied','failed','expired'].includes(s.state)?s.state:'ended') : s.state,expires_at:s.expires_at,requested_name:s.requested_name,failure_code:s.state==='failed'?supportFailureCode(s.failure_code):null};
}
export function supportBinding(s:any,d:any) {
 return s.device_id===d.id && s.company_id===d.company_id && s.vehicle_id===(d.vehicle_id||'') &&
 s.kiosk_type===d.kiosk_type && d.support_request?.id===s.id;
}
