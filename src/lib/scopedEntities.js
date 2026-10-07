// All signed-in entity operations use scoped backend access. Direct subscriptions
// would bypass the response projection, so scoped snapshots are polled instead.
// Base44 rejects bursts of backend calls with 429 ("Too many requests"). One
// rejected list used to blank a whole page (Admin loads 12 at once, plus live
// lists every 10s in every open tab), so calls run a few at a time and a
// rate-limited call waits and tries again. A 429 was never run, so a retry is safe.
const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const waiting = [];
const acquire = () => new Promise(resolve => { if (inFlight < MAX_IN_FLIGHT) { inFlight++; resolve(); } else waiting.push(resolve); });
const release = () => { const next = waiting.shift(); if (next) next(); else inFlight--; };
const statusOf = e => e?.status ?? e?.response?.status ?? e?.originalError?.response?.status;
const retryAfterMs = e => {
 const headers = e?.originalError?.response?.headers;
 const seconds = Number(headers?.get?.('retry-after') ?? headers?.['retry-after']);
 return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10000) : 0;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function withRateLimitRetry(fn, { attempts = 6, baseMs = 800 } = {}) {
 for (let attempt = 0; ; attempt++) {
  await acquire();
  let error;
  try { return await fn(); } catch (e) { error = e; } finally { release(); }
  if (statusOf(error) !== 429 || attempt >= attempts - 1) throw error;
  await sleep(retryAfterMs(error) || baseMs * 2 ** attempt + Math.random() * 400);
 }
}
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// Live lists re-check while someone is using the page and more slowly once
// nobody has touched it for 2 minutes. Every read goes through one shared,
// rate-limited server call, so only buses (SOS) and broadcasts re-check as
// often as every 10s — everything else at half that rate, which keeps the app
// well clear of the limit that used to make screens report missing information.
export const FAST_POLL_MS = 10000, ACTIVE_POLL_MS = 20000, IDLE_POLL_MS = 60000, IDLE_AFTER_MS = 120000;
const ALWAYS_FAST = new Set(['Vehicle', 'Broadcast']);
let lastActivity = Date.now(), watchingActivity = false;
const watchActivity = () => {
 if (watchingActivity || typeof window === 'undefined' || !window.addEventListener) return;
 watchingActivity = true;
 for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true, capture: true });
};
export const pollDelay = (entity, now = Date.now()) => (ALWAYS_FAST.has(entity) ? FAST_POLL_MS : now - lastActivity < IDLE_AFTER_MS ? ACTIVE_POLL_MS : IDLE_POLL_MS);

export function scopedEntities(client) {
 const call = async (entity, operation, args={}) => {
  const response = await withRateLimitRetry(() => client.functions.invoke('entityAccess', { entity, operation, ...args }));
  return response.data.result;
 };
 const polls=new Map();
 const startPoll=(entity)=>{
  watchActivity();
  let stopped=false, current=null, pending=false, timer=null;
  const listeners=new Set();
  const emit=(event)=>{ for(const listener of [...listeners]) { try { listener(event); } catch { /* one screen's error doesn't stop the others */ } } };
  const poll=async()=>{
   // A tab in the background doesn't poll; it catches up when shown again.
   if(stopped||pending||hidden()) return;
   pending=true;
   try {
    const rows=await call(entity,'list',{limit:5000});
    if(stopped)return;
    const next=new Map(rows.map(row=>[row.id,row]));
    if(current) {
     for(const [id,row] of next) {
      if(!current.has(id)) emit({type:'create',id,data:row});
      else if(JSON.stringify(current.get(id))!==JSON.stringify(row)) emit({type:'update',id,data:row});
     }
     for(const id of current.keys()) if(!next.has(id)) emit({type:'delete',id});
    }
    current=next;
   } catch { /* No stale snapshot is delivered after authorization failure. */ }
   finally {pending=false;}
  };
  const schedule=()=>{ if(!stopped) timer=setTimeout(async()=>{ await poll(); schedule(); },pollDelay(entity)); };
  const onVisible=()=>{ if(!hidden()) poll(); };
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',onVisible);
  poll(); schedule();
  const live={listeners,stop:()=>{stopped=true;clearTimeout(timer);current=null;if(typeof document!=='undefined') document.removeEventListener('visibilitychange',onVisible);}};
  polls.set(entity,live);
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