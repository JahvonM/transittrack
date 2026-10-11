// Only Admin's dataset reads are paced. Other app functions and writes are
// unaffected; two overlapping section loads share the same pending dataset.
export function createAdminLoader(datasets,{spacingMs=350}={}) {
 const pending=new Map();let tail=Promise.resolve(),nextStart=0;
 const load=key=>{
  if(pending.has(key))return pending.get(key);
  const job=tail.then(async()=>{
   const wait=nextStart-Date.now();
   if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
   nextStart=Date.now()+spacingMs;
   return datasets[key].load();
  });
  tail=job.catch(()=>{});
  pending.set(key,job);
  job.finally(()=>{if(pending.get(key)===job)pending.delete(key);}).catch(()=>{});
  return job;
 };
 return keys=>Promise.allSettled(keys.map(load));
}
export function adminLoadProblem(errors) {
 const statuses=errors.map(e=>e?.status ?? e?.response?.status ?? e?.originalError?.response?.status);
 if(statuses.includes(401))return {title:"Sign-in needs checking",description:"The server refused your sign-in. Try again to check your session."};
 if(statuses.includes(403))return {title:"Admin access was refused",description:"The server refused this request. Try again; if it continues, check this account’s admin access."};
 if(statuses.includes(429))return {title:"Server is busy",description:"The server reached its request limit. Wait a moment, then try again. Saved information is kept."};
 if(statuses.some(s=>s>=500))return {title:"Server couldn't load admin data",description:"The server returned an error. Try again shortly. Saved information is kept."};
 return {title:"Couldn't connect to admin data",description:"Check your connection, then try again. Saved information is kept."};
}
