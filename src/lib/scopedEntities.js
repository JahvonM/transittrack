
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

export function scopedEntities(client) {
 const call = async (entity, operation, args={}) => {
  const response = await withRateLimitRetry(() => client.functions.invoke('entityAccess', { entity, operation, ...args }));
  return response.data.result;
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
   subscribe(callback) {
    let stopped=false, current=null, pending=false;
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
        if(!current.has(id)) callback({type:'create',id,data:row});
        else if(JSON.stringify(current.get(id))!==JSON.stringify(row)) callback({type:'update',id,data:row});
       }
       for(const id of current.keys()) if(!next.has(id)) callback({type:'delete',id});
      }
      current=next;
     } catch { /* No stale snapshot is delivered after authorization failure. */ }
     finally {pending=false;}
    };
    poll(); const timer=setInterval(poll,10000);
    const onVisible=()=>{ if(!hidden()) poll(); };
    if(typeof document!=='undefined') document.addEventListener('visibilitychange',onVisible);
    return ()=>{stopped=true;clearInterval(timer);current=null;if(typeof document!=='undefined') document.removeEventListener('visibilitychange',onVisible);};
   },
  };
  handlers.set(entity,handler);return handler;
 } });
}
