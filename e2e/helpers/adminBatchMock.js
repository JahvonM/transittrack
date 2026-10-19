import { ADMIN_READ_SPECS } from "../../base44/shared/adminReadSpecs.ts";
// Let existing entity fixtures answer the new combined read with identical data.
// Virtual subreads stay inside the fixture: only one browser request is made.
export function withAdminBatch(handler) {
 return async route=>{
  const request=route.request();
  // Only the gateway's JSON is read here; uploads and other requests go straight through.
  if(!request.url().includes("/functions/entityAccess"))return handler(route);
  const body=request.postDataJSON();
  if(body?.entity!=="AdminBootstrap")return handler(route);
  const datasets={},errors={};
  let answered=0,passedOn=0;
  for(const key of body.datasets || []) {
   const spec=ADMIN_READ_SPECS[key];let reply,fellBack=false;
   if(!spec){errors[key]={status:400,error:"Unknown dataset"};continue;}
   const single={entity:spec.entity,operation:Object.keys(spec.query).length?"filter":"list",query:spec.query,sort:spec.sort,limit:spec.limit,skip:0};
   const virtualRequest=new Proxy(request,{get(target,prop){if(prop==="postDataJSON")return()=>single;if(prop==="postData")return()=>JSON.stringify(single);const value=target[prop];return typeof value==="function"?value.bind(target):value;}});
   // A fixture that passes a read on (fallback/continue) must not pass the real
   // request on: that answers it, and this batch then can't.
   const virtualRoute=new Proxy(route,{get(target,prop){if(prop==="request")return()=>virtualRequest;if(prop==="fulfill")return async value=>{reply=value;};if(prop==="fallback"||prop==="continue")return async()=>{fellBack=true;};const value=target[prop];return typeof value==="function"?value.bind(target):value;}});
   await handler(virtualRoute);
   if(fellBack&&!reply){passedOn++;datasets[key]=[];continue;}
   answered++;
   if(!reply || (reply.status || 200)>=400)errors[key]={status:reply?.status || 500,error:reply?.json?.error || "Fixture read failed"};
   else datasets[key]=reply.json?.result || [];
  }
  // This fixture reads none of these: let the one registered before it answer.
  if(passedOn&&!answered)return route.fallback();
  return route.fulfill({json:{result:{datasets,errors}}});
 };
}
