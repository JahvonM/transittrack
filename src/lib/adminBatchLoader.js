// Cache is scoped to one mounted admin session, never persisted or shared with
// another account. Forced refresh bypasses it; unsuccessful datasets are not cached.
const clone=value=>JSON.parse(JSON.stringify(value));
export function createAdminBatchLoader(invoke,{ttlMs=30000,now=()=>Date.now()}={}) {
 const cache=new Map(),pending=new Map();let generation=0;
 const load=async(keys,{force=false}={})=>{
  const unique=[...new Set(keys)];
  if(force){generation++;for(const key of unique)cache.delete(key);}
  const fresh=unique.filter(key=>!(cache.get(key)?.until>now()) && (force || !pending.has(key)));
  if(fresh.length){
   const version=generation;
   const batch=Promise.resolve().then(()=>invoke(fresh)).then(response=>{
    const result=response?.data?.result;
    if(!result?.datasets || !result?.errors)throw Object.assign(new Error("Invalid admin snapshot"),{status:502});
    return result;
   });
   for(const key of fresh) {
    const item=batch.then(result=>{
     if(result.errors[key])throw Object.assign(new Error(result.errors[key].error),{status:result.errors[key].status});
     if(!Array.isArray(result.datasets[key]))throw Object.assign(new Error("Missing admin dataset"),{status:502});
     if(version===generation)cache.set(key,{until:now()+ttlMs,value:clone(result.datasets[key])});
     return clone(result.datasets[key]);
    });
    pending.set(key,item);
    item.finally(()=>{if(pending.get(key)===item)pending.delete(key);}).catch(()=>{});
   }
  }
  return Promise.allSettled(keys.map(key=>{
   const saved=cache.get(key);
   if(saved?.until>now() && !force)return Promise.resolve(clone(saved.value));
   return pending.get(key) || Promise.reject(Object.assign(new Error("Missing admin dataset"),{status:502}));
  }));
 };
 load.invalidate=()=>{generation++;cache.clear();};
 return load;
}
