import {test,expect} from "@playwright/test";
test("admin overview makes one combined read and refresh bypasses its cache",async({page})=>{
 const batches=[];let busName="Original Bus";
 await page.addInitScript(()=>{localStorage.setItem("base44_access_token","isolated-test-session");localStorage.setItem("tt-map-engine","basic");});
 await page.route("**/api/**",r=>{
  const body=r.request().postDataJSON(),url=r.request().url();
  if(url.includes("/functions/entityAccess")){
   if(body.entity==="User")return r.fulfill({json:{result:{id:"admin-test",role:"admin",full_name:"Test Admin"}}});
   if(body.entity==="AdminBootstrap"){
    batches.push(body);
    const datasets=Object.fromEntries(body.datasets.map(key=>[key,key==="vehicles"?[{id:"bus",name:busName,company_id:"a",status:"idle",type:"staff_bus",capacity:25}]:key==="companies"?[{id:"a",name:"Test Company"}]:[]]));
    return r.fulfill({json:{result:{datasets,errors:{}}}});
   }
   return r.fulfill({json:{result:[]}});
  }
  if(url.includes("/entities/"))return r.fulfill({status:403,json:{error:"Direct entities blocked"}});
  return r.fulfill({json:{id:"test-app",public_settings:{authentication_required:false}}});
 });
 await page.route("https://api.mapbox.com/**",r=>r.fulfill({status:404,body:""}));
 await page.goto("/admin");
 await expect(page.getByRole("region",{name:"Live Fleet"})).toBeVisible();
 expect(batches).toHaveLength(1);
 expect(batches[0].datasets).toEqual(["vehicles","routes","companies","parts","faultsOpen","schedulesDue","trips","kiosks"]);
 busName="Updated Bus";
 await page.getByRole("button",{name:"Refresh list",exact:true}).click();
 await expect.poll(()=>batches.length).toBe(2);
 await expect(page.getByRole("region",{name:"Live Fleet"})).toContainText("Updated Bus");
 expect(batches.every(b=>b.operation==="list")).toBe(true);
});
