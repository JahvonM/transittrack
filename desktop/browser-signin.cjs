// Google / Apple / Microsoft sign-in for TransitTrack Desktop.
//
// Identity providers refuse to sign in inside embedded app windows (Google:
// "This browser or app may not be secure"), so the desktop app opens the
// website's /desktop-signin page in the person's own web browser and waits on
// a one-time loopback address (RFC 8252 section 7.3). When they finish signing
// in there and confirm, that page POSTs the session here with the random state
// this module generated. Nothing else is accepted:
//  - listens on 127.0.0.1 only, on a random port, and checks the Host header
//  - accepts one POST /callback with the exact 256-bit state (constant-time)
//  - rejects any Origin other than the TransitTrack website
//  - closes after success, cancel, failure or 10 minutes
const http=require('node:http');
const crypto=require('node:crypto');
const {APP_ORIGIN}=require('./policy.cjs');

const APP_HOST=new URL(APP_ORIGIN).host;
// Hosts that serve the Base44 provider-login entry points for this app.
const LOGIN_HOSTS=new Set([APP_HOST,'app.base44.com','base44.app']);
// Providers' own sign-in hosts (a redirect straight to one of these).
const PROVIDER_HOSTS={'accounts.google.com':'google','appleid.apple.com':'apple','login.microsoftonline.com':'microsoft','login.live.com':'microsoft','www.facebook.com':'facebook','m.facebook.com':'facebook'};
const PROVIDERS=new Set(['google','apple','microsoft','facebook','sso']);
const PROVIDER_NAMES={google:'Google',apple:'Apple',microsoft:'Microsoft',facebook:'Facebook',sso:'your organization'};
const TOKEN=/^[A-Za-z0-9._~+/=-]{20,8192}$/;
const SESSION_PARAMS=['access_token','clear_access_token','app_id','app_base_url','functions_version','from_url'];
const TIMEOUT_MS=10*60*1000;
const MAX_BODY=16384;

function secureUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}
 catch{return null;}
}
// "Continue with Google/Apple/…" on the login page navigates to one of these.
function providerFromLoginUrl(value){
 const u=secureUrl(value);if(!u||!LOGIN_HOSTS.has(u.host))return null;
 if(u.pathname==='/api/apps/auth/login')return 'google';
 const m=u.pathname.match(/^\/api\/apps\/auth\/(apple|microsoft|facebook)\/login$/);if(m)return m[1];
 if(/^\/api\/apps\/[A-Za-z0-9]{1,64}\/auth\/sso\/login$/.test(u.pathname))return 'sso';
 return null;
}
function providerFromRedirect(value){
 const u=secureUrl(value);
 return u&&Object.hasOwn(PROVIDER_HOSTS,u.host)?PROVIDER_HOSTS[u.host]:null;
}
// Where the person was going (from_url on the login address), as a safe app path.
function returnPathFromLoginUrl(value){
 const u=secureUrl(value);const from=u&&u.searchParams.get('from_url');
 if(!from)return '/';
 try{
  const target=new URL(from,APP_ORIGIN);
  if(target.origin!==APP_ORIGIN)return '/';
  for(const p of SESSION_PARAMS)target.searchParams.delete(p);
  const path=target.pathname+target.search;
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('\\'))return '/';
  if(/^\/(login|register|desktop-signin)(\/|$)/.test(target.pathname))return '/';
  return path;
 }catch{return '/';}
}
// The app address that stores the returned session in the desktop window.
// (The same access_token hand-off the website's own sign-in uses.)
function signedInUrl(token,returnPath='/'){
 if(!TOKEN.test(token))throw Error('Invalid session');
 const u=new URL(returnPath,APP_ORIGIN);
 if(u.origin!==APP_ORIGIN)throw Error('Invalid return path');
 for(const p of SESSION_PARAMS)u.searchParams.delete(p);
 u.searchParams.set('access_token',token);
 return u.href;
}
function sameSecret(a,b){
 const x=Buffer.from(String(a)),y=Buffer.from(String(b));
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
// Fixed text only (never echoes request data).
function page(title,text){
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TransitTrack Desktop</title><style>body{margin:0;background:#0d1520;color:#edf3fb;font:18px system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:540px;padding:40px}h1{font-size:32px}p{color:#b7c5d7;line-height:1.6}strong{color:#53d6c2}</style><main><strong>TransitTrack Desktop</strong><h1>'+title+'</h1><p>'+text+'</p></main></html>';
}

function startBrowserSignIn({openExternal,provider='google',returnPath='/',timeoutMs=TIMEOUT_MS}){
 if(!PROVIDERS.has(provider))provider='google';
 const state=crypto.randomBytes(32).toString('base64url');
 let resolveResult,rejectResult,finished=false,url=null,port=0;
 const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
 result.catch(()=>{});
 const server=http.createServer((req,res)=>{
  const send=(code,title,text,after)=>{
   res.writeHead(code,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Connection':'close'});
   res.end(page(title,text),after);
  };
  if(finished)return send(410,'Sign-in already finished','You can close this tab.');
  if(req.headers.host!=='127.0.0.1:'+port)return send(400,'Wrong address','Start signing in from TransitTrack Desktop.');
  if(req.method!=='POST'||req.url!=='/callback')return send(404,'Nothing here','Start signing in from TransitTrack Desktop.');
  const origin=req.headers.origin;
  if(origin&&origin!==APP_ORIGIN&&origin!=='null')return send(403,'Not allowed','Only the TransitTrack website can finish a desktop sign-in.');
  if(!/^application\/x-www-form-urlencoded(\s*;|$)/i.test(req.headers['content-type']||''))return send(415,'Not allowed','Start signing in from TransitTrack Desktop.');
  let body='',tooBig=false;
  req.setEncoding('utf8');
  req.on('data',chunk=>{if(tooBig)return;body+=chunk;if(body.length>MAX_BODY){tooBig=true;body='';}});
  req.on('end',()=>{
   if(tooBig)return send(413,'Not allowed','Start signing in from TransitTrack Desktop.');
   if(finished)return send(410,'Sign-in already finished','You can close this tab.');
   const form=new URLSearchParams(body);
   if(!sameSecret(form.get('state')||'',state))return send(400,'This sign-in link has expired','Go back to TransitTrack Desktop and choose Continue with '+PROVIDER_NAMES[provider]+' again.');
   const token=form.get('token')||'';
   if(!TOKEN.test(token))return send(400,'Sign-in could not be finished','Go back to TransitTrack Desktop and try again.');
   finished=true;
   send(200,'You’re signed in','TransitTrack Desktop is opening your workspace now. You can close this browser tab.',stop);
   resolveResult(token);
  });
  req.on('error',()=>{});
 });
 server.on('clientError',(_err,socket)=>socket.destroy());
 const timer=setTimeout(()=>cancel('timed out'),timeoutMs);timer.unref?.();
 function stop(){clearTimeout(timer);server.close();setImmediate(()=>server.closeAllConnections?.());}
 function cancel(reason='cancelled'){
  if(finished)return;
  finished=true;stop();
  rejectResult(Object.assign(Error('Sign-in '+reason),{code:reason}));
 }
 const listening=new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   port=server.address().port;
   url=APP_ORIGIN+'/desktop-signin?'+new URLSearchParams({port:String(port),state,provider}).toString();
   resolve(url);
  });
 });
 const opened=listening.then(async address=>{await openExternal(address);return address;});
 opened.catch(()=>cancel('failed'));
 return {
  provider,returnPath,result,opened,cancel,
  reopen:()=>url?openExternal(url):Promise.resolve(),
  get url(){return url;},
  get finished(){return finished;},
 };
}

module.exports={startBrowserSignIn,providerFromLoginUrl,providerFromRedirect,returnPathFromLoginUrl,signedInUrl,PROVIDER_NAMES};
