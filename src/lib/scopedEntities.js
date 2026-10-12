// All signed-in entity operations use scoped backend access. Direct subscriptions
// would bypass the response projection, so scoped snapshots are polled instead.
// Base44 rejects bursts of backend calls with 429 ("Too many requests"). One
// rejected list used to blank a whole page (Admin loads 12 at once, plus live
// lists every 10s in every open tab), so calls run a few at a time and a
// rate-limited call waits and tries again.
const MAX_IN_FLIGHT = 4;
let inFlight = 0;
let cooldownUntil = 0;
const waiting = [];
const acquire = () => new Promise(resolve => { if (inFlight < MAX_IN_FLIGHT) { inFlight++; resolve(); } else waiting.push(resolve); });
const release = () => { const next = waiting.shift(); if (next) next(); else inFlight--; };
const statusOf = e => e?.status ?? e?.response?.status ?? e?.originalError?.response?.status;
const retryAfterMs = e => {
 const headers = e?.originalError?.response?.headers ?? e?.response?.headers;
 const value = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
 if (value == null || String(value).trim() === '') return 0;
 const seconds = Number(value);
 if (Number.isFinite(seconds)) return seconds > 0 ? seconds * 1000 : 0;
 const deadline = Date.parse(value);
 return Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : 0;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function withRateLimitRetry(fn, { attempts = 6, baseMs = 800, maxWaitMs = 45000 } = {}) {
 const deadline=Date.now()+maxWaitMs;
 let lastError;
 const waitForCooldown=async()=>{
  while(Date.now()<cooldownUntil) {
   const delay=cooldownUntil-Date.now();
   if(Date.now()+delay>deadline)throw lastError || Object.assign(new Error("Server is busy. Try again shortly."),{status:429});
   await sleep(delay);
  }
 };
 for (let attempt = 0; ; attempt++) {
  await waitForCooldown();
  await acquire();
  let error;
  try {
   // A request already in flight may have extended the shared cooldown.
   await waitForCooldown();
   cooldownUntil = 0;
   return await fn();
  } catch (e) {
   error = e;lastError=e;
   if (statusOf(e) === 429) {
    const delay = retryAfterMs(e) || baseMs * 2 ** attempt + Math.random() * 400;
    cooldownUntil = Math.max(cooldownUntil, Date.now() + Math.ceil(delay));
   }
  } finally { release(); }
  if (statusOf(error) !== 429 || attempt >= attempts - 1) throw error;
 }
}
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// Live lists re-check while someone is using the page and more slowly once
// nobody has touched it for 2 minutes. Buses (SOS) and broadcasts re-check
// every 20s, everything else every 30s (2 minutes when idle). All the lists a
// device is watching are refreshed together in one server call (LiveLists):
// every call costs several database reads just to check who is asking, and
// Base44 limits the app's database reads, so a few phones and tablets each
// refreshing many lists on their own used to run the whole app out.
export const FAST_POLL_MS = 20000, ACTIVE_POLL_MS = 30000, IDLE_POLL_MS = 120000, IDLE_AFTER_MS = 120000;
// A list due within this long rides along with the refresh going out now.
export const COALESCE_MS = 10000;
// A subscribe used to fetch its first snapshot the instant it was created,
// alongside the page's own load. Both competed for the app's rate limit.
export const FIRST_POLL_MS = 1500;
const ALWAYS_FAST = new Set(['Vehicle', 'Broadcast']);
let lastActivity = Date.now(), watchingActivity = false;
const watchActivity = () => {
 if (watchingActivity || typeof window === 'undefined' || !window.addEventListener) return;
 watchingActivity = true;
 for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true, capture: true });
};
export const pollDelay = (entity, now = Date.now()) => (ALWAYS_FAST.has(entity) ? FAST_POLL_MS : now - lastActivity < IDLE_AFTER_MS ? ACTIVE_POLL_MS : IDLE_POLL_MS);

export function scopedEntities(client) {
 const reads = new Map();
 const call = (entity, operation, args={}) => {
  const readOnly = ['list','filter','get'].includes(operation);
  const key = readOnly ? JSON.stringify([entity,operation,args]) : null;
  if (readOnly && reads.has(key)) return reads.get(key);
  const pending = withRateLimitRetry(() => client.functions.invoke('entityAccess', { entity, operation, ...args }))
   .then(response => response.data.result)
   .finally(() => { if (readOnly) reads.delete(key); });
  if (readOnly) reads.set(key,pending);
  return pending;
 };
 // Every list this device is watching, refreshed together by one timer.
 const polls=new Map();
 let timer=null, running=false, batch=true, watchingVisibility=false;
 const apply=(live,rows)=>{
  live.failures=0;live.nextAllowed=0;
  const next=new Map(rows.map(row=>[row.id,row]));
  if(live.current) {
   const emit=(event)=>{ for(const listener of [...live.listeners]) { try { listener(event); } catch { /* one screen's error doesn't stop the others */ } } };
   for(const [id,row] of next) {
    if(!live.current.has(id)) emit({type:'create',id,data:row});
    else if(JSON.stringify(live.current.get(id))!==JSON.stringify(row)) emit({type:'update',id,data:row});
   }
   for(const id of live.current.keys()) if(!next.has(id)) emit({type:'delete',id});
  }
  live.current=next;
 };
 const failed=(live,error)=>{
  const status=statusOf(error);
  // Signed out or not allowed: this list stops refreshing.
  if(status===401||status===403){live.current=null;live.dead=true;return;}
  live.failures++;
  live.nextAllowed=Date.now()+Math.max(retryAfterMs(error),Math.min(120000,30000*2**Math.min(live.failures-1,2)));
 };
 const arm=()=>{
  if(timer) clearTimeout(timer);
  timer=null;
  if(running) return; // the refresh in progress arms the next one when it ends
  let next=Infinity;
  for(const live of polls.values()) if(!live.dead) next=Math.min(next,Math.max(live.due,live.nextAllowed));
  if(next<Infinity) timer=setTimeout(refresh,Math.max(0,next-Date.now()));
 };
 const refresh=async()=>{
  timer=null;
  if(running) return;
  const now=Date.now();
  const alive=[...polls.entries()].filter(([,live])=>!live.dead);
  const due=alive.filter(([,live])=>Math.max(live.due,live.nextAllowed)<=now);
  if(!due.length) { arm(); return; }
  // A tab in the background doesn't refresh; it catches up when shown again.
  // Background refreshes also give way to the page's own reads.
  if(hidden()||now<cooldownUntil||inFlight>=MAX_IN_FLIGHT||waiting.length||reads.size) {
   for(const [entity,live] of due) live.due=now+pollDelay(entity);
   arm();
   return;
  }
  // Lists due soon ride along: one call instead of one per list.
  const take=alive.filter(([,live])=>live.nextAllowed<=now && live.due<=now+COALESCE_MS);
  running=true;
  try {
   // Background refreshes never occupy the foreground retry queue. On failure
   // they wait for their next scheduled refresh instead of retrying in a burst.
   await acquire();
   try {
    if(batch) {
     let response=null, error=null;
     try { response=await client.functions.invoke('entityAccess',{entity:'LiveLists',operation:'list',entities:take.map(([entity])=>entity),limit:5000}); }
     catch(e) { error=e; }
     const result=response?.data?.result;
     if(!error && result && typeof result==='object' && !Array.isArray(result) && result.lists && typeof result.lists==='object') {
      for(const [entity,live] of take) {
       if(live.stopped) continue;
       if(Array.isArray(result.lists[entity])) apply(live,result.lists[entity]);
       else failed(live,{status:result.errors?.[entity]?.status||500});
      }
     } else if(error && statusOf(error)===401) {
      for(const [,live] of take) failed(live,error);
     } else if(error && ![400,403,404].includes(statusOf(error))) {
      for(const [,live] of take) failed(live,error);
     } else batch=false; // a server without LiveLists: refresh each list on its own
    }
    if(!batch) {
     for(const [entity,live] of take) {
      if(live.stopped) continue;
      try {
       const response=await client.functions.invoke('entityAccess',{entity,operation:'list',limit:5000});
       if(!live.stopped) apply(live,response.data.result);
      } catch(error) { failed(live,error); }
     }
    }
   } finally { release(); }
  } catch { /* each list already recorded its own failure */ }
  finally {
   running=false;
   const after=Date.now();
   for(const [entity,live] of take) live.due=after+pollDelay(entity);
   arm();
  }
 };
 const watchVisibility=()=>{
  if(watchingVisibility || typeof document==='undefined' || !document.addEventListener) return;
  watchingVisibility=true;
  document.addEventListener('visibilitychange',()=>{
   if(hidden()||!polls.size) return;
   const now=Date.now();
   for(const live of polls.values()) live.due=Math.min(live.due,now);
   arm();
  });
 };
 const startPoll=(entity)=>{
  watchActivity();
  watchVisibility();
  // The page's own data load goes first. A refresh fired at the same instant
  // used to compete with it for the app's rate limit, and the page — not the
  // refresh — is what the person is waiting for.
  const live={listeners:new Set(),current:null,due:Date.now()+FIRST_POLL_MS,nextAllowed:0,failures:0,dead:false,stopped:false,
   stop:()=>{live.stopped=true;live.current=null;if(polls.get(entity)===live)polls.delete(entity);arm();}};
  polls.set(entity,live);
  arm();
  return live;
 };
 const handlers=new Map();
 return new Proxy({}, { get(_,entity) {
  if(typeof entity!=='string') return undefined;
  if(handlers.has(entity)) return handlers.get(entity);
  const handler={
   list:(sort,limit,skip)=>call(entity,'list',{sort,limit,skip}),
   filter:(query,sort,limit,skip)=>call(entity,'filter',{query,sort,limit,skip}),
   get:id=>call(entity,'get',{id}),
   create:data=>call(entity,'create',{data}),
   update:(id,data)=>call(entity,'update',{id,data}),
   delete:id=>call(entity,'delete',{id}),
   bulkCreate:data=>call(entity,'bulkCreate',{data}),
   // Every screen watching this list shares one poll (Admin and its live
   // fleet map used to fetch buses twice every 10s).
   subscribe(callback) {
    const live=polls.get(entity)||startPoll(entity);
    live.listeners.add(callback);
    return ()=>{
     live.listeners.delete(callback);
     if(!live.listeners.size) { live.stop(); polls.delete(entity); }
    };
   },
  };
  handlers.set(entity,handler);return handler;
 } });
}