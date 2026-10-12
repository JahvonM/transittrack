import { ADMIN_READ_SPECS } from "../../base44/shared/adminReadSpecs.ts";
// Let existing entity fixtures answer the new combined read with identical data.
// Virtual subreads stay inside the fixture: only one browser request is made.
export function withAdminBatch(handler) {
 return async route=>{
  const request=route.request(),body=request.postDataJSON();
  if(!request.url().includes("/functions/entityAccess") || body?.entity!=="AdminBootstrap")return handler(route);
  const datasets={},errors={};
  for(const key of body.datasets || []) {
   const spec=ADMIN_READ_SPECS[key];let reply;
   if(!spec){errors[key]={status:400,error:"Unknown dataset"};continue;}
   const single={entity:spec.entity,operation:Object.keys(spec.query).length?"filter":"list",query:spec.query,sort:spec.sort,limit:spec.limit,skip:0};
   const virtualRequest=new Proxy(request,{get(target,prop){if(prop==="postDataJSON")return()=>single;if(prop==="postData")return()=>JSON.stringify(single);const value=target[prop];return typeof value==="function"?value.bind(target):value;}});
   const virtualRoute=new Proxy(route,{get(target,prop){if(prop==="request")return()=>virtualRequest;if(prop==="fulfill")return async value=>{reply=value;};const value=target[prop];return typeof value==="function"?value.bind(target):value;}});
   await handler(virtualRoute);
   if(!reply || (reply.status || 200)>=400)errors[key]={status:reply?.status || 500,error:reply?.json?.error || "Fixture read failed"};
   else datasets[key]=reply.json?.result || [];
  }
  return route.fulfill({json:{result:{datasets,errors}}});
 };
}
