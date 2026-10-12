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
 expect(batches[0].datasets).toEqual(["vehicles","routes","companies","parts","faultsOpen","schedulesDue","trips","kiosks","checkIns"]);
 busName="Updated Bus";
 await page.getByRole("button",{name:"Refresh list",exact:true}).click();
 await expect.poll(()=>batches.length).toBe(2);
 await expect(page.getByText("Updated Bus",{exact:true})).toBeVisible();
 expect(batches.every(b=>b.operation==="list")).toBe(true);
});

test('Fleet health shows local failures and tablet summaries without telemetry requests',async({page})=>{
 let fail=true;const endpoints=[];
 await page.addInitScript(()=>localStorage.setItem('base44_access_token','isolated-test-session'));
 await page.route('**/api/**',r=>{
  const url=r.request().url(),b=r.request().postDataJSON();
  if(url.includes('/functions/')){
   endpoints.push(url.split('/functions/')[1]);
   if(b.entity==='User')return r.fulfill({json:{result:{id:'admin',role:'admin',full_name:'Test Admin'}}});
   if(b.entity==='AdminBootstrap'){
    if(fail)return r.fulfill({json:{result:{datasets:{},errors:{vehicles:{status:503,error:'Unavailable'}}}}});
    return r.fulfill({json:{result:{datasets:{vehicles:[]},errors:{}}}});
   }
   if(b.entity==='KioskDevice')return r.fulfill({json:{result:[{id:'tablet',label:'Test tablet',app_health:{reported_at:new Date().toISOString(),request_metrics:{requests:20,failed:2,rate_limited:1,avg_ms:150}}}]}});
   return r.fulfill({json:{result:[]}});
  }
  return r.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/admin/health');
 await expect(page.getByText("Server couldn't load admin data",{exact:true})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 const health=page.getByLabel('Request health',{exact:true});
 await expect(health).toBeVisible();
 await expect(health.getByText('Test tablet',{exact:true})).toBeVisible();
 await expect(health.getByText('Server errors',{exact:true}).locator('..')).toContainText('1');
 expect(endpoints.every(name=>!name.toLowerCase().includes('telemetry'))).toBe(true);
});
