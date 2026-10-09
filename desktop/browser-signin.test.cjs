const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {startBrowserSignIn,providerFromLoginUrl,providerFromRedirect,returnPathFromLoginUrl,signedInUrl}=require('./browser-signin.cjs');
const APP='https://eager-transit-track-go.base44.app';
const TOKEN='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXZhbHVl';

function post(port,{body,origin=APP,type='application/x-www-form-urlencoded',host,method='POST',path='/callback'}={}){
 return new Promise((resolve,reject)=>{
  const headers={'Content-Type':type};if(origin)headers.Origin=origin;if(host)headers.Host=host;
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,csp:res.headers['content-security-policy']}));});
  req.on('error',reject);req.end(body);
 });
}
async function begin(options={}){
 let opened=null;
 const flow=startBrowserSignIn({openExternal:async u=>{opened=u;},...options});
 await flow.opened;
 const u=new URL(opened);
 return {flow,opened,port:Number(u.searchParams.get('port')),state:u.searchParams.get('state'),u};
}

test('recognises provider sign-in only on the TransitTrack and Base44 hosts',()=>{
 assert.equal(providerFromLoginUrl(APP+'/api/apps/auth/login?app_id=1&from_url=x'),'google');
 assert.equal(providerFromLoginUrl('https://app.base44.com/api/apps/auth/login?app_id=1'),'google');
 assert.equal(providerFromLoginUrl('https://app.base44.com/api/apps/auth/apple/login?app_id=1'),'apple');
 assert.equal(providerFromLoginUrl(APP+'/api/apps/6a98b192be27b5f9635020ba/auth/sso/login'),'sso');
 for(const bad of ['https://evil.invalid/api/apps/auth/login','http://eager-transit-track-go.base44.app/api/apps/auth/login',APP+'/api/apps/auth/evil/login',APP+'/login','https://user:pw@app.base44.com/api/apps/auth/login','javascript:alert(1)','not a url'])assert.equal(providerFromLoginUrl(bad),null,bad);
 assert.equal(providerFromRedirect('https://accounts.google.com/o/oauth2/v2/auth?x=1'),'google');
 assert.equal(providerFromRedirect('https://appleid.apple.com/auth/authorize'),'apple');
 for(const bad of ['https://accounts.google.com.evil.invalid/','http://accounts.google.com/','https://evil.invalid/?accounts.google.com'])assert.equal(providerFromRedirect(bad),null,bad);
});

test('return path stays inside the app and drops session parameters',()=>{
 const login=from=>APP+'/api/apps/auth/login?app_id=1&from_url='+encodeURIComponent(from);
 assert.equal(returnPathFromLoginUrl(login(APP+'/admin?tab=buses&access_token=stolen')),'/admin?tab=buses');
 assert.equal(returnPathFromLoginUrl(login('https://evil.invalid/admin')),'/');
 assert.equal(returnPathFromLoginUrl(login(APP+'//evil.invalid/x')),'/');
 assert.equal(returnPathFromLoginUrl(login(APP+'/login?returnTo=%2F')),'/');
 assert.equal(returnPathFromLoginUrl(APP+'/api/apps/auth/login'),'/');
 assert.equal(signedInUrl(TOKEN,'/admin'),APP+'/admin?access_token='+TOKEN);
 assert.throws(()=>signedInUrl('bad token','/'));
 assert.throws(()=>signedInUrl(TOKEN,'https://evil.invalid/'));
});

test('the loopback listener accepts only the matching state from the website, once',async()=>{
 const {flow,port,state,u}=await begin({provider:'google',returnPath:'/admin'});
 assert.equal(u.origin+u.pathname,APP+'/desktop-signin');
 assert.equal(u.searchParams.get('provider'),'google');
 assert.match(state,/^[A-Za-z0-9_-]{43}$/);
 const good=new URLSearchParams({state,token:TOKEN}).toString();
 assert.equal((await post(port,{method:'GET',path:'/callback?'+good})).status,404);
 assert.equal((await post(port,{body:new URLSearchParams({state:'x'.repeat(43),token:TOKEN}).toString()})).status,400);
 assert.equal((await post(port,{body:good,origin:'https://evil.invalid'})).status,403);
 assert.equal((await post(port,{body:good,host:'localhost:'+port})).status,400);
 assert.equal((await post(port,{body:good,type:'text/plain'})).status,415);
 assert.equal((await post(port,{body:new URLSearchParams({state,token:'not a token'}).toString()})).status,400);
 assert.equal((await post(port,{body:'state='+state+'&token='+'a'.repeat(20000)})).status,413);
 assert.equal(flow.finished,false);
 const ok=await post(port,{body:good});
 assert.equal(ok.status,200);
 assert.match(ok.csp,/default-src 'none'/);
 assert.equal(ok.text.includes(TOKEN),false);
 assert.equal(await flow.result,TOKEN);
 assert.equal(flow.returnPath,'/admin');
 await new Promise(r=>setTimeout(r,50));
 await assert.rejects(post(port,{body:good}));
});

test('cancel and timeout close the listener and reject',async()=>{
 const a=await begin();a.flow.cancel();
 await assert.rejects(a.flow.result,/cancelled/);
 await new Promise(r=>setTimeout(r,20));
 await assert.rejects(post(a.port,{body:'x=1'}));
 const b=await begin({timeoutMs:30});
 await assert.rejects(b.flow.result,/timed out/);
 const c=startBrowserSignIn({openExternal:async()=>{throw Error('no browser');}});
 await assert.rejects(c.opened);
 await assert.rejects(c.result,/failed/);
});

test('unknown providers fall back to Google',async()=>{
 const {flow,u}=await begin({provider:'evil'});
 assert.equal(u.searchParams.get('provider'),'google');
 flow.cancel();
});
