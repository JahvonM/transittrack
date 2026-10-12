import {it,expect} from "vitest";
import {createRequestMetrics} from "./requestMetrics";
import {cleanRequestMetrics} from "../../base44/shared/requestMetrics.ts";
it("counts outcomes, timings and failed combined lists without retaining contents",()=>{
 let now=1000;const m=createRequestMetrics({now:()=>now});
 m.record("entityAccess",{status:200,durationMs:100,body:{pin:"PRIVATE"},message:"PRIVATE"});
 m.record("entityAccess",{status:200,durationMs:300,partialStatuses:[429,503]});
 m.record("driverSession",{status:401,durationMs:200});m.record("driverSession",{durationMs:400});
 const report=m.snapshot();
 expect(report).toMatchObject({requests:4,failed:3,rate_limited:1,auth_errors:1,server_errors:1,network_errors:1,avg_ms:250,max_ms:400,partial_failures:2});
 expect(JSON.stringify(report)).not.toContain("PRIVATE");
});
it("expires old counters and bounds arbitrary names",()=>{
 let now=0;const m=createRequestMetrics({now:()=>now});
 m.record("https://invalid/?pin=PRIVATE",{status:200,durationMs:NaN});
 expect(m.snapshot().functions[0].name).toBe("unknown");
 now=601000;expect(m.snapshot().requests).toBe(0);
});
it("bounds server-stored tablet metrics and strips arbitrary fields",()=>{
 const data=cleanRequestMetrics({requests:100,failed:-1,rate_limited:Infinity,functions:[{token:"PRIVATE"}],card_uid:"PRIVATE",observed_at:"bad date",avg_ms:999999999});
 expect(data).toEqual({requests:100,failed:0,avg_ms:1000000});
 expect(cleanRequestMetrics([])).toBeUndefined();
});
it("keeps 100 simulated devices isolated and aggregates 10,000 requests",()=>{
 let total=0;
 for(let i=0;i<100;i++){
 const m=createRequestMetrics();
 for(let j=0;j<100;j++)m.record("driverSession",{status:j%20?200:429,durationMs:100});
 expect(m.snapshot()).toMatchObject({requests:100,rate_limited:5,failed:5});total+=m.snapshot().requests;
 }
 expect(total).toBe(10000);
});
