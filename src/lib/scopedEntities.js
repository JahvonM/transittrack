
// All signed-in entity operations use scoped backend access. Direct subscriptions
// would bypass the response projection, so scoped snapshots are polled instead.
export function scopedEntities(client) {
 const call = async (entity, operation, args={}) => {
  const response = await client.functions.invoke('entityAccess', { entity, operation, ...args });
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
     if(stopped||pending) return;
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
    return ()=>{stopped=true;clearInterval(timer);current=null;};
   },
  };
  handlers.set(entity,handler);return handler;
 } });
}
