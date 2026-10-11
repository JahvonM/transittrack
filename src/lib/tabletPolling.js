import {httpStatus} from "./requestError";
// Background reads only: never wraps card taps, PIN checks, GPS uploads or writes.
export function createPollBudget({now=()=>Date.now(),baseMs=30000,maxMs=120000}={}) {
 let until=0,failures=0;
 return {
  allowed:()=>now()>=until,
  succeeded:()=>{until=0;failures=0;},
  failed:error=>{
   const status=httpStatus(error);
   if(status && status!==429 && status<500)return;
   failures++;
   const headers=error?.originalError?.response?.headers ?? error?.response?.headers ?? error?.headers;
   const value=headers?.get?.("retry-after") ?? headers?.["retry-after"] ?? headers?.["Retry-After"];
   const seconds=Number(value);
   const serverMs=value==null?0:Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(value)-now()) || 0;
   until=now()+Math.max(serverMs,Math.min(maxMs,baseMs*2**Math.min(failures-1,8)));
  },
 };
}
// Schedule from completion, not from start. Random extra delay spreads tablets
// out without ever increasing their configured polling frequency.
export function startTabletPoll(run,intervalMs,{random=Math.random}={}) {
 let stopped=false,timer;
 const schedule=()=>{timer=setTimeout(async()=>{try{await run();}finally{if(!stopped)schedule();}},intervalMs*(1+random()*.2));};
 schedule();
 return()=>{stopped=true;clearTimeout(timer);};
}
